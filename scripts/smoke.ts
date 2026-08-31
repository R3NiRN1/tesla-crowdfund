import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { assertNetworkSafety } from "./guardrails";

const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

const tokenAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function owner() view returns (address)",
  "function mint(address,uint256)",
];

type DeploymentFile = {
  schema: "tes-crowdfund-deployment/v2";
  chainId: number;
  networkName: string;
  timestamp: string;
  releaseCommit?: string | null;
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

async function main() {
  const { actualChainId } = await assertNetworkSafety("smoke");

  const deploymentPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  const deployment: DeploymentFile = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  if (deployment.schema !== "tes-crowdfund-deployment/v2") {
    throw new Error(`Refusing non-V2 deployment record: ${deployment.schema || "missing schema"}.`);
  }
  if (deployment.chainId !== actualChainId) {
    throw new Error(`Deployment chain ${deployment.chainId} does not match connected chain ${actualChainId}.`);
  }
  if (deployment.networkName !== network.name) {
    throw new Error(`Deployment network ${deployment.networkName} does not match connected network ${network.name}.`);
  }
  if (!["external", "MockTES"].includes(deployment.metadata.tokenSource)) {
    throw new Error(`Deployment record has unsupported token source: ${deployment.metadata.tokenSource}.`);
  }

  const { FactoryV2: factoryAddress, Token: tokenAddress, Arbitrator: expectedArbitrator } = deployment.contracts;
  const [factoryCode, tokenCode] = await Promise.all([
    ethers.provider.getCode(factoryAddress),
    ethers.provider.getCode(tokenAddress),
  ]);
  if (!factoryCode || factoryCode === "0x") throw new Error(`FactoryV2 has no code at ${factoryAddress}.`);
  if (!tokenCode || tokenCode === "0x") throw new Error(`Token has no code at ${tokenAddress}.`);

  const factory = await ethers.getContractAt("CampaignFactoryV2", factoryAddress);
  const token = new ethers.Contract(tokenAddress, tokenAbi, ethers.provider);

  const [version, factoryToken, arbitrator, campaignCount, name, symbol, decimals, totalSupply, factoryBalance, factoryAllowance] = await Promise.all([
    factory.CONTRACT_VERSION(),
    factory.token(),
    factory.arbitrator(),
    factory.campaignCount(),
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
    token.balanceOf(factoryAddress),
    token.allowance(factoryAddress, factoryAddress),
  ]);

  if (version !== EXPECTED_FACTORY_VERSION || deployment.metadata.factoryVersion !== EXPECTED_FACTORY_VERSION) {
    throw new Error(`Factory version mismatch. On-chain=${version}, record=${deployment.metadata.factoryVersion}.`);
  }
  if (factoryToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(`Factory token mismatch. Expected ${tokenAddress}, got ${factoryToken}.`);
  }
  if (arbitrator.toLowerCase() !== expectedArbitrator.toLowerCase()) {
    throw new Error(`Factory arbitrator mismatch. Expected ${expectedArbitrator}, got ${arbitrator}.`);
  }
  if (!Number.isInteger(Number(decimals)) || Number(decimals) < 0 || Number(decimals) > 255) {
    throw new Error(`Token returned invalid decimals: ${decimals}.`);
  }
  if (!String(name).trim() || !String(symbol).trim()) {
    throw new Error("Token name and symbol must be non-empty metadata strings.");
  }

  // MockTES is deliberately mint-on-demand and therefore starts with zero supply.
  // When the deployment manifest proves this repository deployed it, exercise the
  // owner-only faucet plus ordinary ERC-20 transfer/balance accounting instead of
  // inventing a non-zero initial-supply requirement for production tokens.
  if (deployment.metadata.tokenSource === "MockTES") {
    const [signer] = await ethers.getSigners();
    const signerAddress = await signer.getAddress();
    const owner = await token.owner();
    if (owner.toLowerCase() !== deployment.metadata.deployer.toLowerCase()) {
      throw new Error(`MockTES owner mismatch. Expected ${deployment.metadata.deployer}, got ${owner}.`);
    }
    if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(`Connected signer ${signerAddress} is not the recorded MockTES owner ${owner}.`);
    }

    const probeAmount = ethers.BigNumber.from(1);
    const recipientBefore = await token.balanceOf(expectedArbitrator);
    const supplyBefore = await token.totalSupply();
    await (await token.connect(signer).mint(signerAddress, probeAmount)).wait();
    await (await token.connect(signer).transfer(expectedArbitrator, probeAmount)).wait();
    const [supplyAfter, recipientAfter] = await Promise.all([
      token.totalSupply(),
      token.balanceOf(expectedArbitrator),
    ]);
    if (!supplyAfter.eq(supplyBefore.add(probeAmount))) {
      throw new Error("MockTES mint probe did not increase total supply exactly.");
    }
    if (!recipientAfter.eq(recipientBefore.add(probeAmount))) {
      throw new Error("MockTES transfer probe did not increase recipient balance exactly.");
    }
  }

  console.log("V2 smoke OK:");
  console.log("- Chain:", actualChainId, network.name);
  console.log("- Token:", tokenAddress, name, symbol, `decimals=${decimals}`, `supply=${totalSupply.toString()}`);
  console.log("- ERC-20 reads:", `factoryBalance=${factoryBalance.toString()}`, `factoryAllowance=${factoryAllowance.toString()}`);
  console.log("- FactoryV2:", factoryAddress, version, `campaigns=${campaignCount.toString()}`);
  console.log("- Arbitrator:", arbitrator);
  console.log("- Token source:", deployment.metadata.tokenSource);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
