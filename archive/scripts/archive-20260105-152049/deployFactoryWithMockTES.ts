import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) throw new Error("Set TOKEN_ADDRESS env var");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("TOKEN_ADDRESS:", tokenAddress);

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(tokenAddress);
  await factory.deployed();

  console.log("Factory:", factory.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
