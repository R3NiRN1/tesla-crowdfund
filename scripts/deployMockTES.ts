import { parseEther } from "viem";
import { assertNetworkSafety } from "./guardrails.js";

async function main() {
  const { publicClient, viem } = await assertNetworkSafety("deployMockTES");

  const [deployer] = await viem.getWalletClients();
  console.log("Deployer:", deployer.account.address);

  // Deploy MockTES(initialOwner)
  const token = await viem.deployContract("MockTES", [deployer.account.address]);

  console.log("MockTES:", token.address);

  // Optional mint: works if MockTES has mint(address,uint256)
  const mintAmount = parseEther("1000000");
  try {
    const hash = await token.write.mint([deployer.account.address, mintAmount], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("Minted:", mintAmount.toString(), "to", deployer.account.address);
  } catch (e) {
    console.log("Mint skipped (mint() not found or restricted).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
