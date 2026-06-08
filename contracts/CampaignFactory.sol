// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Campaign.sol";

/**
 * @title CampaignFactory
 * @dev Deploys and tracks crowdfunding Campaign contracts.
 *      All campaigns created by this factory use the same ERC20 token.
 */
contract CampaignFactory {
    /// @notice ERC20 token accepted by all campaigns (MockTES / TES)
    address public immutable token;

    /// @notice List of deployed campaigns
    address[] public campaigns;

    /// @notice Emitted when a new campaign is created
    event CampaignCreated(
        address indexed campaign,
        address indexed owner,
        string description
    );

    /// @notice Emitted when a campaign is created with off-chain metadata.
    /// @dev This augments CampaignCreated without changing the existing Campaign constructor.
    event CampaignCreatedWithMetadata(
        address indexed campaign,
        address indexed owner,
        string description,
        string metadataURI
    );

    /**
     * @param tokenAddress Address of the ERC20 token used for contributions
     */
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "token address zero");
        token = tokenAddress;
    }

    /**
     * @notice Deploy a new Campaign contract
     * @param description Human-readable campaign description
     * @param goal Funding goal in token units
     * @param duration Duration (seconds) until deadline
     * @param milestoneDescriptions Descriptions of milestones
     * @param milestoneAmounts Token amounts for milestones
     */
    function createCampaign(
        string memory description,
        uint256 goal,
        uint256 duration,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (address campaignAddress) {
        return _createCampaign(
            description,
            goal,
            duration,
            milestoneDescriptions,
            milestoneAmounts
        );
    }

    /**
     * @notice Deploy a new Campaign contract and emit an associated metadata URI.
     * @dev Metadata is intentionally emitted, not stored, so the existing Campaign funding core remains unchanged.
     * @param description Human-readable campaign description used by the Campaign contract
     * @param metadataURI Backend/IPFS/HTTPS metadata URI for richer campaign details
     * @param goal Funding goal in token units
     * @param duration Duration (seconds) until deadline
     * @param milestoneDescriptions Descriptions of milestones
     * @param milestoneAmounts Token amounts for milestones
     */
    function createCampaignWithMetadata(
        string memory description,
        string memory metadataURI,
        uint256 goal,
        uint256 duration,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) external returns (address campaignAddress) {
        campaignAddress = _createCampaign(
            description,
            goal,
            duration,
            milestoneDescriptions,
            milestoneAmounts
        );

        emit CampaignCreatedWithMetadata(
            campaignAddress,
            msg.sender,
            description,
            metadataURI
        );

        return campaignAddress;
    }

    function _createCampaign(
        string memory description,
        uint256 goal,
        uint256 duration,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) internal returns (address campaignAddress) {
        require(goal > 0, "goal must be > 0");
        require(duration > 0, "duration must be > 0");
        require(milestoneDescriptions.length > 0, "no milestones");
        require(
            milestoneDescriptions.length == milestoneAmounts.length,
            "milestone mismatch"
        );

        uint256 deadline = block.timestamp + duration;

        // Match contracts/Campaign.sol constructor:
        // (address token_, address owner_, string description_, uint256 goal_, uint256 deadline_, ...)
        Campaign campaign = new Campaign(
            token,
            msg.sender,
            description,
            goal,
            deadline,
            milestoneDescriptions,
            milestoneAmounts
        );

        campaigns.push(address(campaign));

        emit CampaignCreated(address(campaign), msg.sender, description);

        return address(campaign);
    }

    /**
     * @notice Number of campaigns created
     */
    function campaignCount() external view returns (uint256) {
        return campaigns.length;
    }
}
