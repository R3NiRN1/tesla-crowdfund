import fs from "fs";
import path from "path";
import { artifacts, ethers, network } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

type DeploymentFile = {
  schema: "tes-crowdfund-deployment/v2";
  chainId: number;
  networkName: string;
  timestamp: string;
  contracts: {
    FactoryV2: string;
    Token: string;
    Arbitrator: string;
  };
  metadata: {
    factoryVersion: string;
    tokenSource: "external" | "MockTES";
    deployer: string;
  };
};

type VerifyConfig = {
  apiUrl: string;
  browserUrl: string;
  apiKey: string;
};

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";

function getVerifyConfig(): VerifyConfig {
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) throw new Error("Missing BSCSCAN_API_KEY in environment.");

  if (network.name === "bscMainnet") {
    return { apiUrl: "https://api.bscscan.com/api", browserUrl: "https://bscscan.com", apiKey };
  }
  if (network.name === "bscTestnet") {
    return { apiUrl: "https://api-testnet.bscscan.com/api", browserUrl: "https://testnet.bscscan.com", apiKey };
  }
  throw new Error(`Unsupported network for verification: ${network.name}`);
}

async function submitVerification(apiUrl: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`BscScan verification request failed: ${response.status}`);
  return (await response.json()) as { status: string; message: string; result: string };
}

async function pollVerificationStatus(apiUrl: string, apiKey: string, guid: string) {
  const statusUrl = new URL(apiUrl);
  statusUrl.searchParams.set("module", "contract");
  statusUrl.searchParams.set("action", "checkverifystatus");
  statusUrl.searchParams.set("guid", guid);
  statusUrl.searchParams.set("apikey", apiKey);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const response = await fetch(statusUrl.toString());
    if (!response.ok) throw new Error(`BscScan status check failed: ${response.status}`);
    const data = (await response.json()) as { status: string; message: string; result: string };
    if (data.status === "1") return data.result;
    if (data.result && !data.result.toLowerCase().includes("pending")) {
      throw new Error(`Verification failed: ${data.result}`);
    }
  }
  throw new Error("Verification status check timed out.");
}

async function verifyContract(
  config: VerifyConfig,
  fullyQualifiedName: string,
  address: string,
  constructorTypes: string[],
  constructorValues: string[],
) {
  const buildInfo = await artifacts.getBuildInfo(fullyQualifiedName);
  if (!buildInfo) throw new Error(`Missing build info for ${fullyQualifiedName}. Run hardhat compile.`);

  const optimizerEnabled = buildInfo.input.settings.optimizer?.enabled ?? false;
  const optimizerRuns = buildInfo.input.settings.optimizer?.runs ?? 200;
  const constructorArguements = ethers.utils.defaultAbiCoder.encode(constructorTypes, constructorValues).slice(2);

  const response = await submitVerification(config.apiUrl, {
    module: "contract",
    action: "verifysourcecode",
    apikey: config.apiKey,
    contractaddress: address,
    sourceCode: JSON.stringify(buildInfo.input),
    codeformat: "solidity-standard-json-input",
    contractname: fullyQualifiedName,
    compilerversion: `v${buildInfo.solcVersion}`,
    constructorArguements,
    optimizationUsed: optimizerEnabled ? "1" : "0",
    runs: optimizerRuns.toString(),
  });

  if (response.status !== "1") {
    const alreadyVerified = response.result?.toLowerCase().includes("already verified");
    if (alreadyVerified) {
      console.log(`Already verified: ${address}`);
      return;
    }
    throw new Error(`BscScan verification submission failed: ${response.result}`);
  }

  const result = await pollVerificationStatus(config.apiUrl, config.apiKey, response.result);
  console.log(`Verified: ${address} (${result})`);
}

async function main() {
  const { actualChainId } = await assertNetworkSafety("verify");
  const config = getVerifyConfig();
  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  if (!fs.existsSync(deploymentPath)) throw new Error(`Deployment file not found: ${deploymentPath}`);

  const deployment: DeploymentFile = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  if (deployment.schema !== "tes-crowdfund-deployment/v2") {
    throw new Error(`Refusing to verify non-V2 deployment record: ${deployment.schema || "missing schema"}.`);
  }
  if (deployment.chainId !== actualChainId) {
    throw new Error(`Deployment chain ${deployment.chainId} does not match connected chain ${actualChainId}.`);
  }
  if (deployment.networkName !== network.name) {
    throw new Error(`Deployment network ${deployment.networkName} does not match connected network ${network.name}.`);
  }
  if (deployment.metadata.factoryVersion !== EXPECTED_FACTORY_VERSION) {
    throw new Error(
      `Refusing deployment record factory version ${deployment.metadata.factoryVersion}; expected ${EXPECTED_FACTORY_VERSION}.`,
    );
  }
  if (
    deployment.metadata.tokenSource !== "external" &&
    deployment.metadata.tokenSource !== "MockTES"
  ) {
    throw new Error(`Unsupported token source in deployment record: ${deployment.metadata.tokenSource}.`);
  }

  const { FactoryV2: factoryAddress, Token: tokenAddress, Arbitrator: arbitratorAddress } = deployment.contracts;

  if (deployment.metadata.tokenSource === "MockTES") {
    await verifyContract(
      config,
      "contracts/MockTES.sol:MockTES",
      tokenAddress,
      ["address"],
      [deployment.metadata.deployer],
    );
  } else {
    console.log(`External token ${tokenAddress}: source verification is not claimed by this repository.`);
  }

  await verifyContract(
    config,
    "contracts/CampaignFactoryV2.sol:CampaignFactoryV2",
    factoryAddress,
    ["address", "address"],
    [tokenAddress, arbitratorAddress],
  );

  console.log(`FactoryV2 explorer: ${config.browserUrl}/address/${factoryAddress}`);
  console.log(`Token explorer: ${config.browserUrl}/address/${tokenAddress}`);
  console.log(`Arbitrator explorer: ${config.browserUrl}/address/${arbitratorAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
