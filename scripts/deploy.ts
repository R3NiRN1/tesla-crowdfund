import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function requireAddress(name: string, value: string | undefined) {
  const raw = String(value || "").trim();
  if (!ethers.utils.isAddress(raw) || raw.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${name} must be set to a valid non-zero address.`);
  }
  return ethers.utils.getAddress(raw);
}

async function main() {
  const { actualChainId } = await assertNetworkSafety("deploy");
  const force = hasFlag("--force");

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);

  if (fs.existsSync(deploymentPath) && !force) {
    throw new Error(
      `Deployments file already exists at ${deploymentPath}. Re-run with --force only after explicitly reviewing the existing deployment.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const arbitratorAddress = requireAddress("ARBITRATOR_ADDRESS", process.env.ARBITRATOR_ADDRESS);
  let tokenAddress = String(process.env.TOKEN_ADDRESS || "").trim();
  let tokenSource: "external" | "MockTES" = "external";

  if (!tokenAddress) {
    if (network.name === "bscMainnet") {
      throw new Error("TOKEN_ADDRESS must be explicitly set for bscMainnet. MockTES is forbidden on mainnet.");
    }

    const Token = await ethers.getContractFactory("MockTES");
    const token = await Token.deploy(deployer.address);
    await token.deployed();
    tokenAddress = token.address;
    tokenSource = "MockTES";
    console.log("MockTES:", tokenAddress);
  } else {
    tokenAddress = requireAddress("TOKEN_ADDRESS", tokenAddress);
    const code = await ethers.provider.getCode(tokenAddress);
    if (!code || code === "0x") {
      throw new Error(`TOKEN_ADDRESS ${tokenAddress} has no deployed code on ${network.name}.`);
    }
    console.log("Using external TOKEN_ADDRESS:", tokenAddress);
  }

  const Factory = await ethers.getContractFactory("CampaignFactoryV2");
  const factory = await Factory.deploy(tokenAddress, arbitratorAddress);
  await factory.deployed();

  const [factoryVersion, factoryToken, factoryArbitrator] = await Promise.all([
    factory.CONTRACT_VERSION(),
    factory.token(),
    factory.arbitrator(),
  ]);

  if (factoryVersion !== EXPECTED_FACTORY_VERSION) {
    throw new Error(`New factory reports ${factoryVersion}; expected ${EXPECTED_FACTORY_VERSION}.`);
  }
  if (factoryToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`New factory token mismatch: ${factoryToken} != ${tokenAddress}.`);
  }
  if (factoryArbitrator.toLowerCase() !== arbitratorAddress.toLowerCase()) {
    throw new Error(`New factory arbitrator mismatch: ${factoryArbitrator} != ${arbitratorAddress}.`);
  }

  console.log("CampaignFactoryV2:", factory.address);
  console.log("Factory version:", factoryVersion);
  console.log("Arbitrator:", arbitratorAddress);

  const payload = {
    schema: "tes-crowdfund-deployment/v2",
    chainId: actualChainId,
    networkName: network.name,
    timestamp: new Date().toISOString(),
    releaseCommit: process.env.GITHUB_SHA || null,
    contracts: {
      FactoryV2: factory.address,
      Token: tokenAddress,
      Arbitrator: arbitratorAddress,
    },
    metadata: {
      factoryVersion,
      tokenSource,
      deployer: deployer.address,
    },
  };

  fs.writeFileSync(deploymentPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`V2 deployment record saved: ${deploymentPath}`);

  if (tokenSource === "external") {
    console.log("External token was not deployed or modified by this script.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
