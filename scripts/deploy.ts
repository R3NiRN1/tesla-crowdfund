import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress } from "viem";
import { assertNetworkSafety } from "./guardrails.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";
const BSC_MAINNET_CHAIN_ID = 56;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function requireAddress(name: string, value: string | undefined) {
  const raw = String(value || "").trim();
  if (!isAddress(raw) || raw.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${name} must be set to a valid non-zero address.`);
  }
  return getAddress(raw);
}

async function main() {
  const { actualChainId, networkName, publicClient, viem } = await assertNetworkSafety("deploy");
  const force = hasFlag("--force");

  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${networkName}.json`);

  if (fs.existsSync(deploymentPath) && !force) {
    throw new Error(
      `Deployments file already exists at ${deploymentPath}. Re-run with --force only after explicitly reviewing the existing deployment.`
    );
  }

  const [deployer] = await viem.getWalletClients();
  console.log("Deployer:", deployer.account.address);

  const arbitratorAddress = requireAddress("ARBITRATOR_ADDRESS", process.env.ARBITRATOR_ADDRESS);
  let tokenAddress = String(process.env.TOKEN_ADDRESS || "").trim();
  let tokenSource: "external" | "MockTES" = "external";

  if (!tokenAddress) {
    if (actualChainId === BSC_MAINNET_CHAIN_ID) {
      throw new Error("TOKEN_ADDRESS must be explicitly set on BSC mainnet. MockTES is forbidden on chain 56.");
    }

    const token: any = await viem.deployContract("MockTES", [deployer.account.address]);
    tokenAddress = token.address;
    tokenSource = "MockTES";
    console.log("MockTES:", tokenAddress);
  } else {
    tokenAddress = requireAddress("TOKEN_ADDRESS", tokenAddress);
    const code = await publicClient.getCode({ address: tokenAddress as `0x${string}` });
    if (!code || code === "0x") {
      throw new Error(`TOKEN_ADDRESS ${tokenAddress} has no deployed code on ${networkName}.`);
    }
    console.log("Using external TOKEN_ADDRESS:", tokenAddress);
  }

  const factory: any = await viem.deployContract("CampaignFactoryV2", [
    tokenAddress as `0x${string}`,
    arbitratorAddress as `0x${string}`,
  ]);

  const [factoryVersion, factoryToken, factoryArbitrator] = await Promise.all([
    factory.read.CONTRACT_VERSION(),
    factory.read.token(),
    factory.read.arbitrator(),
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
    networkName,
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
      deployer: deployer.account.address,
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
