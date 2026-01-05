import { ethers } from "hardhat";

async function main() {
  const FACTORY = "0xf21b48B2e1309de87962031F7d7b35A802bA4E34";
  const factory = await ethers.getContractAt("CampaignFactory", FACTORY);

  const count = await factory.campaignCount();
  console.log("Campaign count:", count.toString());

  for (let i = 0; i < count.toNumber(); i++) {
    const addr = await factory.campaigns(i);
    console.log(i, addr);
  }
}

main().catch(console.error);
