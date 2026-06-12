export const campaignFactoryMetadataWriteAbi = [
  {
    type: "function",
    name: "createCampaignWithMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "description", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "goal", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "milestoneDescriptions", type: "string[]" },
      { name: "milestoneAmounts", type: "uint256[]" },
    ],
    outputs: [{ name: "campaignAddress", type: "address" }],
  },
  {
    type: "event",
    name: "CampaignCreatedWithMetadata",
    inputs: [
      { indexed: true, name: "campaign", type: "address" },
      { indexed: true, name: "owner", type: "address" },
      { indexed: false, name: "description", type: "string" },
      { indexed: false, name: "metadataURI", type: "string" },
    ],
  },
] as const;
