import { ethers } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

async function main() {
  await assertNetworkSafety("deployMockTES");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy MockTES(initialOwner)
  const MockTES = await ethers.getContractFactory("MockTES");
  const token = await MockTES.deploy(deployer.address);
  await token.deployed();

  console.log("MockTES:", token.address);

  // Optional mint: works if MockTES has mint(address,uint256)
  const mintAmount = ethers.utils.parseUnits("1000000", 18);
  try {
    const tx = await token.mint(deployer.address, mintAmount);
    await tx.wait();
    console.log("Minted:", mintAmount.toString(), "to", deployer.address);
  } catch (e) {
    console.log("Mint skipped (mint() not found or restricted).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
