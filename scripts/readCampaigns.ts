import { network } from "hardhat";

async function main() {
  const FACTORY = "0xf21b48B2e1309de87962031F7d7b35A802bA4E34";
  const { viem } = await network.connect();
  const factory: any = await viem.getContractAt("CampaignFactory", FACTORY);

  const count = await factory.read.campaignCount();
  console.log("Campaign count:", count.toString());

  for (let i = 0n; i < count; i += 1n) {
    const addr = await factory.read.campaigns([i]);
    console.log(i, addr);
  }
}

main().catch(console.error);
