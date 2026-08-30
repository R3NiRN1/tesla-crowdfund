// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CampaignV2} from "./CampaignV2.sol";

/**
 * @title CampaignFactoryV2
 * @notice Versioned factory for CampaignV2. One factory is bound to one compatible
 *         BSC ERC-20/BEP-20 token. Teslastarter's intended native deployment uses TES,
 *         while the audited escrow code remains reusable with another compatible token.
 */
contract CampaignFactoryV2 {
    string public constant CONTRACT_VERSION = "2.0.0-alpha";

    address public immutable token;
    address public immutable arbitrator;
    address[] public campaigns;

    event CampaignV2Created(
        address indexed campaign,
        address indexed owner,
        address indexed token,
        address arbitrator,
        string description,
        string metadataURI,
        uint256 goal,
        uint256 deadline
    );

    error ZeroAddress();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidMilestones();

    constructor(address token_, address arbitrator_) {
        if (token_ == address(0) || arbitrator_ == address(0)) revert ZeroAddress();
        token = token_;
        arbitrator = arbitrator_;
    }

    function createCampaign(
        string calldata description,
        uint256 goal,
        uint256 duration,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external returns (address campaignAddress) {
        return _createCampaign(
            description,
            "",
            goal,
            duration,
            milestoneDescriptions,
            milestoneAmounts
        );
    }

    function createCampaignWithMetadata(
        string calldata description,
        string calldata metadataURI,
        uint256 goal,
        uint256 duration,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external returns (address campaignAddress) {
        return _createCampaign(
            description,
            metadataURI,
            goal,
            duration,
            milestoneDescriptions,
            milestoneAmounts
        );
    }

    function _createCampaign(
        string memory description,
        string memory metadataURI,
        uint256 goal,
        uint256 duration,
        string[] memory milestoneDescriptions,
        uint256[] memory milestoneAmounts
    ) internal returns (address campaignAddress) {
        if (goal == 0) revert InvalidAmount();
        if (duration == 0) revert InvalidDuration();
        if (
            milestoneDescriptions.length == 0 ||
            milestoneDescriptions.length != milestoneAmounts.length
        ) revert InvalidMilestones();

        uint256 deadline = block.timestamp + duration;
        CampaignV2 campaign = new CampaignV2(
            token,
            msg.sender,
            arbitrator,
            description,
            goal,
            deadline,
            milestoneDescriptions,
            milestoneAmounts
        );

        campaignAddress = address(campaign);
        campaigns.push(campaignAddress);

        emit CampaignV2Created(
            campaignAddress,
            msg.sender,
            token,
            arbitrator,
            description,
            metadataURI,
            goal,
            deadline
        );
    }

    function campaignCount() external view returns (uint256) {
        return campaigns.length;
    }
}
