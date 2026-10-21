import { network } from "hardhat";

async function main() {
  const { viem } = await network.connect();

  const campaignAddr = process.env.DIAG_CAMPAIGN;
  const me = process.env.DIAG_ME;

  if (!campaignAddr) throw new Error("Missing env DIAG_CAMPAIGN");
  if (!me) throw new Error("Missing env DIAG_ME");

  // ✅ Fully qualified name to avoid HH701 ambiguity
  const campaign = await viem.getContractAt(
    "contracts/Campaign.sol:Campaign",
    campaignAddr
  );

  // 1) What token is this Campaign actually using?
  const tokenAddr = await campaign.read.token();

  // 2) Sanity reads
  const deadline = await campaign.read.deadline();
  const totalContributed = await campaign.read.totalContributed();
  const myContribution = await campaign.read.contributions([me]);

  // Token: use MockTES ABI if present; if not, balanceOf/allowance are standard anyway.
  const token = await viem.getContractAt("contracts/MockTES.sol:MockTES", tokenAddr);

  const myBalance = await token.read.balanceOf([me]);
  const allowanceToCampaign = await token.read.allowance([me, campaignAddr]);
  const campaignTokenBalance = await token.read.balanceOf([campaignAddr]);

  console.log("campaign =", campaignAddr);
  console.log("me =", me);
  console.log("campaign.token() =", tokenAddr);
  console.log("deadline =", deadline.toString());
  console.log("totalContributed =", totalContributed.toString());
  console.log("myContribution =", myContribution.toString());
  console.log("myBalance =", myBalance.toString());
  console.log("allowanceToCampaign =", allowanceToCampaign.toString());
  console.log("campaignTokenBalance =", campaignTokenBalance.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
