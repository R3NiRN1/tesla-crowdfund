import { ethers } from "hardhat";
import { assertBscChainId, assertMainnetConfirmation } from "./networkGuard";

async function main() {
  assertBscChainId();
  assertMainnetConfirmation();

  const tokenAddress =
    process.env.MOCK_TES_ADDRESS || process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    throw new Error("Set MOCK_TES_ADDRESS (preferred) or TOKEN_ADDRESS in root .env");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Token for factory:", tokenAddress);

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(tokenAddress);
  await factory.deployed();

  console.log("Factory:", factory.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
