import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const { actualChainId } = await assertNetworkSafety("deploy");
  const force = hasFlag("--force");

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);

  if (fs.existsSync(deploymentPath) && !force) {
    throw new Error(
      `Deployments file already exists at ${deploymentPath}. Re-run with --force to overwrite.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let tokenAddress = process.env.TOKEN_ADDRESS || "";
  let tokenDeployed = false;

  if (!tokenAddress) {
    if (network.name === "bscMainnet") {
      throw new Error("TOKEN_ADDRESS must be set for bscMainnet deployments.");
    }

    const Token = await ethers.getContractFactory("MockTES");
    const token = await Token.deploy(deployer.address);
    await token.deployed();
    tokenAddress = token.address;
    tokenDeployed = true;
    console.log("MockTES:", tokenAddress);
  } else {
    console.log("Using TOKEN_ADDRESS:", tokenAddress);
  }

  const Factory = await ethers.getContractFactory("CampaignFactory");
  const factory = await Factory.deploy(tokenAddress);
  await factory.deployed();

  console.log("CampaignFactory:", factory.address);

  const payload = {
    chainId: actualChainId,
    networkName: network.name,
    timestamp: new Date().toISOString(),
    contracts: {
      Factory: factory.address,
      Token: tokenAddress,
    },
  };

  fs.writeFileSync(deploymentPath, JSON.stringify(payload, null, 2));
  console.log(`Deployments saved: ${deploymentPath}`);

  if (!tokenDeployed) {
    console.log("Token deployment skipped (using existing address).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
