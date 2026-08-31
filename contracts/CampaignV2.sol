// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title CampaignV2
 * @notice Security-hardened, token-generic crowdfunding escrow intended to make TES
 *         the native/default Teslastarter funding token without hard-coding a token address.
 *
 * Security model:
 * - hard cap: totalContributed can never exceed goal;
 * - partial final contribution: only the remaining amount is transferred from the wallet;
 * - immutable goal and deadline: no goal/milestone divergence or failed-campaign revival;
 * - exact inbound accounting: fee-on-transfer style tokens are rejected;
 * - sequential milestone escrow gates;
 * - full optimistic contributor review window with a stake-weighted challenge threshold;
 * - challenged milestones require an explicit arbitrator decision;
 * - non-responsive arbitration fails safe to refunds;
 * - creator inactivity also fails safe to refunds;
 * - failed/rejected milestone refunds distribute all unreleased escrow pro-rata.
 *
 * The arbitrator is deliberately constrained. It cannot release an unchallenged milestone,
 * change campaign economics, bypass milestone ordering, shorten the contributor review window,
 * or prevent timeout refunds. A production arbitrator should itself be a separately governed
 * multisig/DAO mechanism.
 */
contract CampaignV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant CONTRACT_VERSION = "2.0.0-alpha";
    uint256 public constant BPS = 10_000;
    uint256 public constant CHALLENGE_THRESHOLD_BPS = 1_000; // 10% of contributed stake
    uint256 public constant CHALLENGE_PERIOD = 7 days;
    uint256 public constant ARBITRATION_PERIOD = 14 days;
    uint256 public constant MILESTONE_SUBMISSION_GRACE_PERIOD = 30 days;

    enum CampaignState {
        Funding,
        Milestones,
        Refunds,
        Complete
    }

    enum MilestoneStatus {
        Unsubmitted,
        Review,
        Disputed,
        Released
    }

    enum VoteChoice {
        None,
        Approve,
        Challenge
    }

    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
        string evidenceURI;
        bytes32 evidenceHash;
        uint256 submittedAt;
        uint256 challengeDeadline;
        uint256 disputeDeadline;
        uint256 approvalWeight;
        uint256 challengeWeight;
    }

    IERC20 public immutable token;
    address public immutable arbitrator;
    string public description;
    uint256 public immutable goal;
    uint256 public immutable deadline;

    CampaignState public state;
    uint256 public totalContributed;
    uint256 public totalReleased;
    uint256 public totalRefunded;
    uint256 public nextMilestone;
    uint256 public milestoneSubmissionDeadline;

    mapping(address => uint256) public contributions;
    mapping(address => bool) private _seenBacker;
    uint256 public uniqueBackerCount;

    Milestone[] public milestones;
    mapping(uint256 => mapping(address => VoteChoice)) public milestoneVotes;

    uint256 public refundPoolSnapshot;
    uint256 public refundPoolRemaining;
    uint256 public refundableBackersRemaining;
    mapping(address => bool) public refundClaimed;

    event Contributed(
        address indexed backer,
        uint256 requestedAmount,
        uint256 acceptedAmount,
        uint256 newTotal
    );
    event FundingGoalReached(uint256 totalContributed, uint256 firstMilestoneSubmissionDeadline);
    event FundingFailed(uint256 totalContributed, uint256 goal);
    event MilestoneEvidenceSubmitted(
        uint256 indexed index,
        string evidenceURI,
        bytes32 indexed evidenceHash,
        uint256 challengeDeadline
    );
    event MilestoneVoted(
        uint256 indexed index,
        address indexed backer,
        VoteChoice choice,
        uint256 weight,
        uint256 approvalWeight,
        uint256 challengeWeight
    );
    event MilestoneDisputed(uint256 indexed index, uint256 challengeWeight, uint256 disputeDeadline);
    event MilestoneReleased(uint256 indexed index, uint256 amount, address indexed recipient);
    event DisputeResolved(uint256 indexed index, bool approved, address indexed arbitrator);
    event RefundsActivated(uint256 pool, uint256 contributorWeight, uint256 backerCount, bytes32 reason);
    event Refunded(address indexed backer, uint256 contributionWeight, uint256 amount);
    event CampaignCompleted(uint256 totalReleased);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidMilestones();
    error InvalidState();
    error FundingEnded();
    error FundingStillActive();
    error GoalAlreadyMet();
    error TokenAccountingMismatch();
    error MilestoneOutOfRange();
    error MilestoneOutOfOrder();
    error InvalidMilestoneStatus();
    error InvalidEvidence();
    error ReviewActive();
    error ReviewEnded();
    error NotContributor();
    error AlreadyVoted();
    error NotArbitrator();
    error ArbitrationActive();
    error ArbitrationExpired();
    error MilestoneSubmissionActive();
    error MilestoneSubmissionExpired();
    error NothingToRefund();
    error AlreadyRefunded();
    error InsufficientEscrow();

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert NotArbitrator();
        _;
    }

    constructor(
        address token_,
        address owner_,
        address arbitrator_,
        string memory description_,
        uint256 goal_,
        uint256 deadline_,
        string[] memory milestoneDescriptions_,
        uint256[] memory milestoneAmounts_
    ) Ownable(owner_) {
        if (token_ == address(0) || owner_ == address(0) || arbitrator_ == address(0)) revert ZeroAddress();
        if (deadline_ <= block.timestamp) revert InvalidDeadline();
        if (goal_ == 0) revert InvalidAmount();
        if (
            milestoneDescriptions_.length == 0 ||
            milestoneDescriptions_.length != milestoneAmounts_.length
        ) revert InvalidMilestones();

        token = IERC20(token_);
        arbitrator = arbitrator_;
        description = description_;
        goal = goal_;
        deadline = deadline_;
        state = CampaignState.Funding;

        uint256 milestoneTotal;
        for (uint256 i = 0; i < milestoneDescriptions_.length; i++) {
            uint256 amount = milestoneAmounts_[i];
            if (amount == 0) revert InvalidAmount();
            milestoneTotal += amount;
            milestones.push(
                Milestone({
                    description: milestoneDescriptions_[i],
                    amount: amount,
                    status: MilestoneStatus.Unsubmitted,
                    evidenceURI: "",
                    evidenceHash: bytes32(0),
                    submittedAt: 0,
                    challengeDeadline: 0,
                    disputeDeadline: 0,
                    approvalWeight: 0,
                    challengeWeight: 0
                })
            );
        }

        if (milestoneTotal != goal_) revert InvalidMilestones();
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function isExpired() public view returns (bool) {
        return block.timestamp > deadline;
    }

    function goalMet() public view returns (bool) {
        return totalContributed == goal;
    }

    function remainingToGoal() public view returns (uint256) {
        if (totalContributed >= goal) return 0;
        return goal - totalContributed;
    }

    function challengeThresholdWeight() external view returns (uint256) {
        return _thresholdWeight(totalContributed, CHALLENGE_THRESHOLD_BPS);
    }

    /**
     * @notice Requests a contribution. If the request exceeds the remaining goal,
     *         only the remaining amount is transferred; excess stays in the wallet.
     * @return acceptedAmount Amount actually transferred into escrow.
     */
    function contribute(uint256 requestedAmount) external nonReentrant returns (uint256 acceptedAmount) {
        if (state != CampaignState.Funding) revert InvalidState();
        if (block.timestamp > deadline) revert FundingEnded();
        if (requestedAmount == 0) revert InvalidAmount();

        uint256 remaining = remainingToGoal();
        if (remaining == 0) revert GoalAlreadyMet();
        acceptedAmount = requestedAmount > remaining ? remaining : requestedAmount;

        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), acceptedAmount);
        uint256 afterBalance = token.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != acceptedAmount) {
            revert TokenAccountingMismatch();
        }

        if (!_seenBacker[msg.sender]) {
            _seenBacker[msg.sender] = true;
            uniqueBackerCount += 1;
        }
        contributions[msg.sender] += acceptedAmount;
        totalContributed += acceptedAmount;

        emit Contributed(msg.sender, requestedAmount, acceptedAmount, totalContributed);

        if (totalContributed == goal) {
            state = CampaignState.Milestones;
            milestoneSubmissionDeadline = block.timestamp + MILESTONE_SUBMISSION_GRACE_PERIOD;
            emit FundingGoalReached(totalContributed, milestoneSubmissionDeadline);
        }
    }

    /** Permissionless transition for an underfunded campaign after its immutable deadline. */
    function activateFundingFailure() external {
        if (state != CampaignState.Funding) revert InvalidState();
        if (block.timestamp <= deadline) revert FundingStillActive();
        if (totalContributed == goal) revert GoalAlreadyMet();

        emit FundingFailed(totalContributed, goal);
        _activateRefunds(keccak256("FUNDING_FAILED"));
    }

    /** Creator submits immutable evidence reference for the next milestone. */
    function submitMilestoneEvidence(
        uint256 index,
        string calldata evidenceURI,
        bytes32 evidenceHash
    ) external onlyOwner {
        if (state != CampaignState.Milestones) revert InvalidState();
        if (index >= milestones.length) revert MilestoneOutOfRange();
        if (index != nextMilestone) revert MilestoneOutOfOrder();
        if (block.timestamp > milestoneSubmissionDeadline) revert MilestoneSubmissionExpired();
        if (bytes(evidenceURI).length == 0 || evidenceHash == bytes32(0)) revert InvalidEvidence();

        Milestone storage milestone = milestones[index];
        if (milestone.status != MilestoneStatus.Unsubmitted) revert InvalidMilestoneStatus();

        milestone.status = MilestoneStatus.Review;
        milestone.evidenceURI = evidenceURI;
        milestone.evidenceHash = evidenceHash;
        milestone.submittedAt = block.timestamp;
        milestone.challengeDeadline = block.timestamp + CHALLENGE_PERIOD;

        emit MilestoneEvidenceSubmitted(index, evidenceURI, evidenceHash, milestone.challengeDeadline);
    }

    /**
     * @notice A contributor may cast one immutable stake-weighted approve/challenge signal.
     *         Votes remain open for the entire review window even when the challenge threshold
     *         is reached, preventing early arbitration from truncating contributor review.
     */
    function voteMilestone(uint256 index, VoteChoice choice) external {
        if (state != CampaignState.Milestones) revert InvalidState();
        if (index >= milestones.length) revert MilestoneOutOfRange();
        if (index != nextMilestone) revert MilestoneOutOfOrder();
        if (choice != VoteChoice.Approve && choice != VoteChoice.Challenge) revert InvalidAmount();

        Milestone storage milestone = milestones[index];
        if (milestone.status != MilestoneStatus.Review) revert InvalidMilestoneStatus();
        if (block.timestamp > milestone.challengeDeadline) revert ReviewEnded();

        uint256 weight = contributions[msg.sender];
        if (weight == 0) revert NotContributor();
        if (milestoneVotes[index][msg.sender] != VoteChoice.None) revert AlreadyVoted();

        milestoneVotes[index][msg.sender] = choice;
        if (choice == VoteChoice.Approve) {
            milestone.approvalWeight += weight;
        } else {
            milestone.challengeWeight += weight;
        }

        emit MilestoneVoted(
            index,
            msg.sender,
            choice,
            weight,
            milestone.approvalWeight,
            milestone.challengeWeight
        );
    }

    /**
     * @notice Permissionless finalisation after the complete contributor review window.
     *         If at least 10% of contributed stake challenged, the milestone enters arbitration;
     *         otherwise the optimistic gate releases it.
     */
    function finalizeMilestone(uint256 index) external nonReentrant {
        if (state != CampaignState.Milestones) revert InvalidState();
        if (index >= milestones.length) revert MilestoneOutOfRange();
        if (index != nextMilestone) revert MilestoneOutOfOrder();

        Milestone storage milestone = milestones[index];
        if (milestone.status != MilestoneStatus.Review) revert InvalidMilestoneStatus();
        if (block.timestamp <= milestone.challengeDeadline) revert ReviewActive();

        if (_meetsThreshold(milestone.challengeWeight, totalContributed, CHALLENGE_THRESHOLD_BPS)) {
            milestone.status = MilestoneStatus.Disputed;
            milestone.disputeDeadline = block.timestamp + ARBITRATION_PERIOD;
            emit MilestoneDisputed(index, milestone.challengeWeight, milestone.disputeDeadline);
            return;
        }

        _releaseMilestone(index);
    }

    /**
     * @notice Arbitrator can only resolve a milestone that contributors actually disputed.
     *         Rejection immediately protects all unreleased escrow for pro-rata refunds.
     */
    function resolveDispute(uint256 index, bool approve) external onlyArbitrator nonReentrant {
        if (state != CampaignState.Milestones) revert InvalidState();
        if (index >= milestones.length) revert MilestoneOutOfRange();
        if (index != nextMilestone) revert MilestoneOutOfOrder();

        Milestone storage milestone = milestones[index];
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (block.timestamp > milestone.disputeDeadline) revert ArbitrationExpired();

        emit DisputeResolved(index, approve, msg.sender);
        if (approve) {
            _releaseMilestone(index);
        } else {
            _activateRefunds(keccak256("MILESTONE_REJECTED"));
        }
    }

    /** Non-responsive arbitration fails safe to refunds. */
    function expireDispute(uint256 index) external {
        if (state != CampaignState.Milestones) revert InvalidState();
        if (index >= milestones.length) revert MilestoneOutOfRange();
        if (index != nextMilestone) revert MilestoneOutOfOrder();

        Milestone storage milestone = milestones[index];
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneStatus();
        if (block.timestamp <= milestone.disputeDeadline) revert ArbitrationActive();

        _activateRefunds(keccak256("ARBITRATION_TIMEOUT"));
    }

    /** Creator inactivity cannot freeze the unreleased escrow indefinitely. */
    function cancelForMissingMilestone() external {
        if (state != CampaignState.Milestones) revert InvalidState();
        Milestone storage milestone = milestones[nextMilestone];
        if (milestone.status != MilestoneStatus.Unsubmitted) revert InvalidMilestoneStatus();
        if (block.timestamp <= milestoneSubmissionDeadline) revert MilestoneSubmissionActive();

        _activateRefunds(keccak256("CREATOR_INACTIVE"));
    }

    /**
     * @notice Claims the caller's pro-rata share of the terminal refund pool.
     *         The last claiming backer receives integer-rounding dust, so there is no
     *         owner-controlled sweep of legitimate unreleased campaign escrow.
     */
    function refund() external nonReentrant returns (uint256 amount) {
        if (state == CampaignState.Funding) {
            if (block.timestamp <= deadline || totalContributed == goal) revert InvalidState();
            emit FundingFailed(totalContributed, goal);
            _activateRefunds(keccak256("FUNDING_FAILED"));
        }
        if (state != CampaignState.Refunds) revert InvalidState();
        if (refundClaimed[msg.sender]) revert AlreadyRefunded();

        uint256 weight = contributions[msg.sender];
        if (weight == 0) revert NothingToRefund();

        refundClaimed[msg.sender] = true;
        contributions[msg.sender] = 0;

        if (refundableBackersRemaining == 1) {
            amount = refundPoolRemaining;
        } else {
            amount = Math.mulDiv(refundPoolSnapshot, weight, totalContributed);
            if (amount > refundPoolRemaining) amount = refundPoolRemaining;
        }

        refundableBackersRemaining -= 1;
        refundPoolRemaining -= amount;
        totalRefunded += amount;

        _safeExactTransfer(msg.sender, amount);
        emit Refunded(msg.sender, weight, amount);
    }

    function _releaseMilestone(uint256 index) internal {
        Milestone storage milestone = milestones[index];
        if (
            milestone.status != MilestoneStatus.Review &&
            milestone.status != MilestoneStatus.Disputed
        ) revert InvalidMilestoneStatus();

        uint256 balance = token.balanceOf(address(this));
        if (balance < milestone.amount) revert InsufficientEscrow();

        milestone.status = MilestoneStatus.Released;
        totalReleased += milestone.amount;
        nextMilestone += 1;

        _safeExactTransfer(owner(), milestone.amount);
        emit MilestoneReleased(index, milestone.amount, owner());

        if (nextMilestone == milestones.length) {
            state = CampaignState.Complete;
            milestoneSubmissionDeadline = 0;
            emit CampaignCompleted(totalReleased);
        } else {
            milestoneSubmissionDeadline = block.timestamp + MILESTONE_SUBMISSION_GRACE_PERIOD;
        }
    }

    function _activateRefunds(bytes32 reason) internal {
        if (state == CampaignState.Refunds || state == CampaignState.Complete) revert InvalidState();

        state = CampaignState.Refunds;
        refundPoolSnapshot = token.balanceOf(address(this));
        refundPoolRemaining = refundPoolSnapshot;
        refundableBackersRemaining = uniqueBackerCount;
        milestoneSubmissionDeadline = 0;

        emit RefundsActivated(
            refundPoolSnapshot,
            totalContributed,
            refundableBackersRemaining,
            reason
        );
    }

    function _safeExactTransfer(address recipient, uint256 amount) internal {
        if (amount == 0) return;

        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 escrowAfter = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(recipient);

        if (
            escrowAfter > escrowBefore ||
            escrowBefore - escrowAfter != amount ||
            recipientAfter < recipientBefore ||
            recipientAfter - recipientBefore != amount
        ) revert TokenAccountingMismatch();
    }

    function _thresholdWeight(uint256 total, uint256 thresholdBps) internal pure returns (uint256) {
        uint256 whole = (total / BPS) * thresholdBps;
        uint256 remainder = total % BPS;
        return whole + (remainder * thresholdBps + BPS - 1) / BPS;
    }

    function _meetsThreshold(
        uint256 weight,
        uint256 total,
        uint256 thresholdBps
    ) internal pure returns (bool) {
        return weight >= _thresholdWeight(total, thresholdBps);
    }
}
