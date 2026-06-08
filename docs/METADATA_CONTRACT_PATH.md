# Metadata-aware contract path

`CampaignFactory` keeps the existing `createCampaign(...)` function intact and adds `createCampaignWithMetadata(...)`.

The new function deploys the same `Campaign` contract as the original path, then emits `CampaignCreatedWithMetadata` with campaign address, owner, description, and metadata URI.

Metadata is event-based in this MVP step. It is not stored in the `