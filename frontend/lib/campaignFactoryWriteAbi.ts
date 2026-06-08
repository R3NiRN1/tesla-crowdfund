export const campaignFactoryWriteAbi = [
  {
    type: "function",
    name: "createCampaign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "description", type: "string" },
      { name: "goal", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "milestoneDescriptions",