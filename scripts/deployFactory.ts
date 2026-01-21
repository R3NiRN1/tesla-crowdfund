import { ethers, network } from "hardhat";

async function main() {
  if (network.name === "bscMainnet" && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error(
      "Mainnet deploy blocked. Set CONFIRM_MAINNET=yes to proceed."
    );
  }

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
