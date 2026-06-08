# Metadata-aware contract path

This note documents the V1-compatible metadata-aware publish path.

## What changed

`CampaignFactory` now keeps the existing `createCampaign(...)` function intact and adds:

```solidity
createCampaignWithMetadata(
  string description,
  string metadataURI,
  uint256 goal,
  uint256 duration,
  string[] milestoneDescriptions,
  uint256[] milestoneAmounts
)
```

The new function deploys the same `Campaign` contract as the