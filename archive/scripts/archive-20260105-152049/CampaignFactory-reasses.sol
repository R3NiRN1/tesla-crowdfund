// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Campaign
 * @dev A single crowdfunding campaign funded with an ERC20 token.
 *      Uses SafeERC20 for maximum compatibility (non-standard ERC20s, etc).
 *
 * Frontend expectations (based on your readCampaign.ts / ABI usage):
 *  - description() -> string
 *  - goal() -> uint256
 *  - deadline() -> uint256
 *  - owner() -> address
 *  - totalContributed() -> uint256
 *  - milestoneCount() -> uint256
 *  - milestones(uint256) -> (string,uint256,bool)
 *  - contributions(address) -> uint256
 *  - contribute(uint256) -> nonpayable
 */
contract Campaign is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutable / core ============
    IERC20 public immutable token;

    address public immutable owner;
    uint256 public immutable goal;
    uint256 public immutable deadline;

    string public description;

    // ============ Funding state ============
    uint256 public totalContributed;
    mapping(address => uint256) public contributions;

    // ============ Milestones ============
    struct Milestone {
        string description;
        uint256 amount;
        bool claimed;
    }

    Milestone[] public milestones;

    // ============ Events ============
    event Contributed(address indexed backer, uint256 amount, uint256 newTotal);
    event MilestoneClaimed(uint256 indexed index, uint256 amount, address indexed owner);
    event DescriptionUpdated(string newDescription);

    // ============ Errors (cheaper than strings in many cases) ============
    error NotOwner();
    error CampaignExpired();
    error CampaignNotExpired();
    error InvalidAmount();
    error InvalidMilestones();
    error MilestoneAlreadyClaimed();
    error MilestoneIndexOutOfRange();
    error NotEnoughRaised();

    // ============ Modifiers ============
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        IERC20 token_,
        address owner_,
        uint256 goal_,
        uint256 deadline_,
        string memory description_,
        string[] memory milestoneDescriptions_,
        uint256[] memory milestoneAmounts_
    ) {
        require(address(token_) != address(0), "token=0");
        require(owner_ != address(0), "owner=0");
        require(goal_ > 0, "goal=0");
        require(deadline_ > block.timestamp, "deadline<=now");
        require(milestoneDescriptions_.length > 0, "no milestones");
        require(milestoneDescriptions_.length == milestoneAmounts_.length, "milestone mismatch");

        // Validate milestone totals (you can choose == goal or <= goal; == is cleaner)
        uint256 sum;
        for (uint256 i = 0; i < milestoneDescriptions_.length; i++) {
            if (milestoneAmounts_[i] == 0) revert InvalidMilestones();
            milestones.push(
                Milestone({
                    description: milestoneDescriptions_[i],
                    amount: milestoneAmounts_[i],
                    claimed: false
                })
            );
            sum += milestoneAmounts_[i];
        }

        // Enforce milestone plan equals goal (recommended for clarity)
        require(sum == goal_, "milestones != goal");

        token = token_;
        owner = owner_;
        goal = goal_;
        deadline = deadline_;
        description = description_;
    }

    // ---------- Read helpers expected by your UI ----------
    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    // ---------- Optional admin (safe to keep, not required by UI) ----------
    function setDescription(string calldata newDescription) external onlyOwner {
        description = newDescription;
        emit DescriptionUpdated(newDescription);
    }

    // ---------- Funding ----------
    /**
     * @notice Contribute `amount` tokens to the campaign.
     * @dev Requires prior ERC20 approve(token, campaignAddress, amount).
     */
    function contribute(uint256 amount) external nonReentrant {
        if (block.timestamp >= deadline) revert CampaignExpired();
        if (amount == 0) revert InvalidAmount();

        // Pull tokens from contributor into this contract
        // If token is non-standard, SafeERC20 handles it.
        token.safeTransferFrom(msg.sender, address(this), amount);

        contributions[msg.sender] += amount;
        totalContributed += amount;

        emit Contributed(msg.sender, amount, totalContributed);
    }

    // ---------- Milestone payout (basic version) ----------
    /**
     * @notice Claim a milestone payout to the owner.
     * @dev You can decide policy: allow only after deadline or after goal reached.
     *      Here: require totalContributed >= goal AND allow even before deadline.
     *      If you want "only after deadline", add `if (block.timestamp < deadline) revert CampaignNotExpired();`
     */
    function claimMilestone(uint256 index) external onlyOwner nonReentrant {
        if (index >= milestones.length) revert MilestoneIndexOutOfRange();
        Milestone storage m = milestones[index];
        if (m.claimed) revert MilestoneAlreadyClaimed();

        // Require campaign fully funded before any claim
        if (totalContributed < goal) revert NotEnoughRaised();

        m.claimed = true;
        token.safeTransfer(owner, m.amount);

        emit MilestoneClaimed(index, m.amount, owner);
    }
}
