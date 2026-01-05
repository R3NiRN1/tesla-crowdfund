import { ethers } from "hardhat";

async function main() {
  const TES = "0x9Cb4D8D3BfddC790A807178ba5548314A73A31F8"; // TES token address

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(TES);

  await factory.deployed();

  console.log("CampaignFactory deployed to:", factory.address);
  console.log("Token address set to:", TES);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
