# Metadata-aware contract path

`CampaignFactory` keeps `createCampaign(...)` intact and adds `createCampaignWithMetadata(...)`, which deploys the same `Campaign` contract and emits `CampaignCreatedWithMetadata` with the off-chain metadata URI.
