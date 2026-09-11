import { parseEther, parseEventLogs } from "viem";
import { assertNetworkSafety } from "./guardrails.js";

async function main() {
  const { publicClient, viem } = await assertNetworkSafety("createCampaign");

  const FACTORY = process.env.FACTORY_ADDRESS;
  if (!FACTORY) throw new Error("Set FACTORY_ADDRESS in root .env");

  const [deployer] = await viem.getWalletClients();
  console.log("Deployer:", deployer.account.address);
  console.log("Factory:", FACTORY);

  const factory: any = await viem.getContractAt("CampaignFactory", FACTORY as `0x${string}`);

  // === Campaign params ===
  const description = "TESTNET ONLY: validate crowdfund flow (no real value)";
  const goal = parseEther("100"); // 100 tokens
  const duration = 60 * 60 * 24 * 30; // 30 days

  const milestoneDescriptions = [
    "Milestone 1: publish project outline + safety notes",
    "Milestone 2: release build docs + BOM",
  ];

  const milestoneAmounts = [
    parseEther("40"),
    parseEther("60"),
  ];

  const hash = await factory.write.createCampaign([
    description,
    goal,
    BigInt(duration),
    milestoneDescriptions,
    milestoneAmounts,
  ], { account: deployer.account });

  console.log("createCampaign tx:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("confirmed in block:", receipt.blockNumber);

  const [event]: any[] = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "CampaignCreated" });
  const campaignAddr = event?.args?.campaign;

  console.log("New campaign address:", campaignAddr || "(not found in events)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
