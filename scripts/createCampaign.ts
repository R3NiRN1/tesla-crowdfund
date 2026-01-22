import { ethers } from "hardhat";
import { assertBscChainId, assertMainnetConfirmation } from "./networkGuard";

async function main() {
  assertBscChainId();
  assertMainnetConfirmation();
  const FACTORY = process.env.FACTORY_ADDRESS;
  if (!FACTORY) throw new Error("Set FACTORY_ADDRESS in root .env");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Factory:", FACTORY);

  const factory = await ethers.getContractAt("CampaignFactory", FACTORY);

  // === Campaign params ===
  const description = "TESTNET ONLY: validate crowdfund flow (no real value)";
  const goal = ethers.utils.parseUnits("100", 18); // 100 tokens
  const duration = 60 * 60 * 24 * 30; // 30 days

  const milestoneDescriptions = [
    "Milestone 1: publish project outline + safety notes",
    "Milestone 2: release build docs + BOM",
  ];

  const milestoneAmounts = [
    ethers.utils.parseUnits("40", 18),
    ethers.utils.parseUnits("60", 18),
  ];

  const tx = await factory.createCampaign(
    description,
    goal,
    duration,
    milestoneDescriptions,
    milestoneAmounts
  );

  console.log("createCampaign tx:", tx.hash);

  const receipt = await tx.wait();
  console.log("confirmed in block:", receipt.blockNumber);

  const ev = receipt.events?.find((e) => e.event === "CampaignCreated");
  const campaignAddr = ev?.args?.campaign;

  console.log("New campaign address:", campaignAddr || "(not found in events)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
