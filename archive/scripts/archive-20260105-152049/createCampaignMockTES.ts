import { ethers } from "hardhat";

const FACTORY = process.env.FACTORY_ADDRESS!; // or paste the new factory address here

async function main() {
  if (!FACTORY) throw new Error("Set FACTORY_ADDRESS in .env or paste it in the script");

  const factory = await ethers.getContractAt("CampaignFactory", FACTORY);

  const desc = "TESTNET ONLY: validate approve + contribute";
  const goal = ethers.utils.parseUnits("100", 18);
  const duration = 7 * 24 * 60 * 60;

  const milestoneDescriptions = ["Milestone 1", "Milestone 2"];
  const milestoneAmounts = [
    ethers.utils.parseUnits("40", 18),
    ethers.utils.parseUnits("60", 18),
  ];

  const tx = await factory.createCampaign(desc, goal, duration, milestoneDescriptions, milestoneAmounts);
  const receipt = await tx.wait();

  console.log("tx:", receipt.transactionHash);
  // easiest: just read campaignCount + campaigns(index) after
  const count = await factory.campaignCount();
  console.log("campaignCount:", count.toString());

  const last = await factory.campaigns(count.sub(1));
  console.log("New Campaign:", last);
}

main().catch(console.error);
