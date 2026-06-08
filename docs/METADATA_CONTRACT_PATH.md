# Metadata-aware contract path

This note documents the V1-compatible metadata-aware publish path.

## What changed

`CampaignFactory` keeps the existing `createCampaign(...)` function intact and adds `createCampaignWithMetadata(...)`.

The new function deploys the same `Campaign` contract as the original path, then emits `CampaignCreatedWithMetadata` with the campaign address, owner, description, and metadata URI.

## Boundary