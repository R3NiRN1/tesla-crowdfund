import { assertNetworkSafety } from "./guardrails.js";

async function main() {
  const { viem } = await assertNetworkSafety("deployFactory");

  const tokenAddress =
    process.env.MOCK_TES_ADDRESS || process.env.TOKEN_ADDRESS;

  if (!tokenAddress) {
    throw new Error("Set MOCK_TES_ADDRESS (preferred) or TOKEN_ADDRESS in root .env");
  }

  const [deployer] = await viem.getWalletClients();
  console.log("Deployer:", deployer.account.address);
  console.log("Token for factory:", tokenAddress);

  const factory = await viem.deployContract("CampaignFactory", [tokenAddress as `0x${string}`]);

  console.log("Factory:", factory.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
