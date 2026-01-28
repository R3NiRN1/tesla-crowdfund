import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

type DeploymentFile = {
  chainId: number;
  networkName: string;
  timestamp: string;
  contracts: {
    Factory: string;
    Token: string;
  };
};

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  await assertNetworkSafety("smoke");

  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment: DeploymentFile = JSON.parse(
    fs.readFileSync(deploymentPath, "utf-8")
  );

  const tokenAddress = deployment.contracts.Token;
  const factoryAddress = deployment.contracts.Factory;

  const token = await ethers.getContractAt("MockTES", tokenAddress);
  const factory = await ethers.getContractAt("CampaignFactory", factoryAddress);

  const [name, symbol, factoryToken, campaignCount] = await Promise.all([
    token.name(),
    token.symbol(),
    factory.token(),
    factory.campaignCount(),
  ]);

  if (factoryToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(
      `Factory token mismatch. Expected ${tokenAddress}, got ${factoryToken}.`
    );
  }

  console.log("Smoke OK:");
  console.log("- Token:", tokenAddress, name, symbol);
  console.log("- Factory:", factoryAddress, "campaigns:", campaignCount.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
