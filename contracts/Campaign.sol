// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * TES Crowdfund Campaign
 * - Accepts ERC20 contributions (SafeERC20) into this campaign contract.
 * - Tracks totalContributed + per-backer contributions.
 * - Supports milestones that owner can claim from the raised funds.
 * - Supports refunds if deadline passes and goal not met.
 *
 * Frontend compatibility (based on what you posted):
 *  - description() view returns string
 *  - goal() view returns uint256
 *  - deadline() view returns uint256 (unix seconds)
 *  - owner() view returns address (from Ownable)
 *  - totalContributed() view returns uint256
 *  - milestoneCount() view returns uint256
 *  - milestones(i) view returns (string description, uint256 amount, bool claimed)
 *  - contributions(backer) view returns uint256
 *  - contribute(uint256 amount) nonpayable
 */
contract Campaign is Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Milestone {
    string description;
    uint256 amount;
    bool claimed;
  }

  /// @notice ERC20 token used for contributions (e.g. MockTES on testnet)
  IERC20 public immutable token;

  /// @notice Human readable description
  string public description;

  /// @notice Funding goal (token units, i.e. smallest units)
  uint256 public goal;

  /// @notice Deadline (unix timestamp, seconds)
  uint256 public deadline;

  /// @notice Total contributed so far (token units)
  uint256 public totalContributed;

  /// @notice Backer => contributed amount (token units)
  mapping(address => uint256) public contributions;

  /// @notice Milestones list
  Milestone[] public milestones;

  event Contributed(address indexed backer, uint256 amount, uint256 newTotal);
  event Refunded(address indexed backer, uint256 amount);
  event MilestoneClaimed(uint256 indexed index, uint256 amount, address indexed to);
  event DeadlineExtended(uint256 oldDeadline, uint256 newDeadline);
  event GoalUpdated(uint256 oldGoal, uint256 newGoal);

  error CampaignEnded();
  error CampaignActive();
  error GoalNotMet();
  error InvalidAmount();
  error InvalidDeadline();
  error InvalidMilestones();
  error MilestoneAlreadyClaimed();
  error MilestoneOutOfRange();
  error InsufficientRaisedForMilestone();

  constructor(
    address token_,
    address owner_,
    string memory description_,
    uint256 goal_,
    uint256 deadline_,
    string[] memory milestoneDescriptions_,
    uint256[] memory milestoneAmounts_
  ) Ownable(owner_) {
    if (token_ == address(0)) revert("token=0");
    if (deadline_ <= block.timestamp) revert InvalidDeadline();
    if (goal_ == 0) revert InvalidAmount();
    if (milestoneDescriptions_.length != milestoneAmounts_.length) revert InvalidMilestones();
    if (milestoneDescriptions_.length == 0) revert InvalidMilestones();

    token = IERC20(token_);
    description = description_;
    goal = goal_;
    deadline = deadline_;

    uint256 sum;
    for (uint256 i = 0; i < milestoneDescriptions_.length; i++) {
      if (milestoneAmounts_[i] == 0) revert InvalidAmount();
      milestones.push(
        Milestone({
          description: milestoneDescriptions_[i],
          amount: milestoneAmounts_[i],
          claimed: false
        })
      );
      sum += milestoneAmounts_[i];
    }

    // Optional safety: ensure milestones add up exactly to goal.
    // If you *don’t* want this strictness, delete this check.
    if (sum != goal_) revert("milestones!=goal");
  }

  // ---- Read helpers for frontend ----

  function milestoneCount() external view returns (uint256) {
    return milestones.length;
  }

  function isExpired() public view returns (bool) {
    return block.timestamp > deadline;
  }

  function goalMet() public view returns (bool) {
    return totalContributed >= goal;
  }

  // ---- Core flow ----

  /**
   * @notice Contribute `amount` tokens to this campaign.
   * You must have approved this campaign address as spender on the token.
   */
  function contribute(uint256 amount) external nonReentrant {
    if (amount == 0) revert InvalidAmount();
    if (block.timestamp > deadline) revert CampaignEnded();

    // pull tokens in using SafeERC20 (handles non-standard ERC20s safely)
    token.safeTransferFrom(msg.sender, address(this), amount);

    contributions[msg.sender] += amount;
    totalContributed += amount;

    emit Contributed(msg.sender, amount, totalContributed);
  }

  /**
   * @notice Refund your contribution if campaign ended and goal NOT met.
   */
  function refund() external nonReentrant {
    if (block.timestamp <= deadline) revert CampaignActive();
    if (totalContributed >= goal) revert GoalNotMet(); // goal met => no refunds

    uint256 contributed = contributions[msg.sender];
    if (contributed == 0) revert InvalidAmount();

    contributions[msg.sender] = 0;
    token.safeTransfer(msg.sender, contributed);

    emit Refunded(msg.sender, contributed);
  }

  /**
   * @notice Claim a milestone payout to the owner.
   * Only allowed if goal is met (you can relax this if your model differs).
   */
  function claimMilestone(uint256 index) external onlyOwner nonReentrant {
    if (index >= milestones.length) revert MilestoneOutOfRange();

    Milestone storage m = milestones[index];
    if (m.claimed) revert MilestoneAlreadyClaimed();

    // Require goal met before any milestone claim (common crowdfunding rule)
    if (totalContributed < goal) revert GoalNotMet();

    // Ensure contract has enough balance for this milestone (defensive)
    uint256 bal = token.balanceOf(address(this));
    if (bal < m.amount) revert InsufficientRaisedForMilestone();

    m.claimed = true;
    token.safeTransfer(owner(), m.amount);

    emit MilestoneClaimed(index, m.amount, owner());
  }

  // ---- Admin knobs (optional but useful on testnet) ----

  /**
   * @notice Extend deadline (testnet convenience). Only can extend into the future.
   */
  function extendDeadline(uint256 newDeadline) external onlyOwner {
    if (newDeadline <= deadline) revert InvalidDeadline();
    if (newDeadline <= block.timestamp) revert InvalidDeadline();
    uint256 old = deadline;
    deadline = newDeadline;
    emit DeadlineExtended(old, newDeadline);
  }

  /**
   * @notice Update goal BEFORE any contributions (optional).
   * If you use the strict milestones==goal check in constructor, you probably want to remove this.
   */
  function updateGoal(uint256 newGoal) external onlyOwner {
    if (totalContributed != 0) revert("started");
    if (newGoal == 0) revert InvalidAmount();
    uint256 old = goal;
    goal = newGoal;
    emit GoalUpdated(old, newGoal);
  }
}
