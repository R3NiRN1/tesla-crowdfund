import assert from "node:assert/strict";

export const BSC_TESTNET_CHAIN_ID = 97;
export const EXPECTED_V2_VERSION = "2.0.0-alpha";

export async function requireBscTestnet(publicClient: any): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `Testnet harness is chain-97-only. Connected chain ${chainId} is refused before any transaction.`,
    );
  }
}

export async function requireCode(publicClient: any, label: string, address: string): Promise<void> {
  const code = await publicClient.getCode({ address });
  assert.notEqual(code, "0x", `${label} has no deployed code at ${address}`);
}

export async function assertFactoryIdentity(
  factory: any,
  expectedToken: string,
  expectedArbitrator: string,
): Promise<void> {
  const [version, token, arbitrator] = await Promise.all([
    factory.read.CONTRACT_VERSION(),
    factory.read.token(),
    factory.read.arbitrator(),
  ]);
  assert.equal(version, EXPECTED_V2_VERSION, "unexpected CampaignFactoryV2 version");
  assert.equal(token.toLowerCase(), expectedToken.toLowerCase(), "factory token mismatch");
  assert.equal(arbitrator.toLowerCase(), expectedArbitrator.toLowerCase(), "factory arbitrator mismatch");
}

export async function assertCampaignIdentity(
  campaign: any,
  expectedToken: string,
  expectedArbitrator: string,
  expectedCreator: string,
): Promise<void> {
  const [version, token, arbitrator, owner] = await Promise.all([
    campaign.read.CONTRACT_VERSION(),
    campaign.read.token(),
    campaign.read.arbitrator(),
    campaign.read.owner(),
  ]);
  assert.equal(version, EXPECTED_V2_VERSION, `unexpected CampaignV2 version at ${campaign.address}`);
  assert.equal(token.toLowerCase(), expectedToken.toLowerCase(), "campaign token mismatch");
  assert.equal(arbitrator.toLowerCase(), expectedArbitrator.toLowerCase(), "campaign arbitrator mismatch");
  assert.equal(owner.toLowerCase(), expectedCreator.toLowerCase(), "campaign creator mismatch");
}

export async function assertEscrowAccounting(token: any, campaign: any): Promise<void> {
  const [balance, totalContributed, totalReleased, totalRefunded, goal] = await Promise.all([
    token.read.balanceOf([campaign.address]),
    campaign.read.totalContributed(),
    campaign.read.totalReleased(),
    campaign.read.totalRefunded(),
    campaign.read.goal(),
  ]);
  assert.ok(totalContributed <= goal, `campaign ${campaign.address} exceeded its goal`);
  const expected = totalContributed - totalReleased - totalRefunded;
  assert.equal(balance.toString(), expected.toString(), `escrow accounting mismatch at ${campaign.address}`);
}

export async function assertTerminalEmpty(token: any, campaign: any): Promise<void> {
  await assertEscrowAccounting(token, campaign);
  const [state, balance] = await Promise.all([campaign.read.state(), token.read.balanceOf([campaign.address])]);
  assert.ok(state === 2 || state === 3, `campaign ${campaign.address} is not terminal`);
  assert.equal(balance.toString(), "0", `terminal campaign ${campaign.address} retains escrow`);
}

export function requireEligible(timestamp: bigint, currentBlockTimestamp: bigint, label: string): void {
  const seconds = Number(timestamp);
  const current = Number(currentBlockTimestamp);
  if (current <= seconds) {
    throw new Error(`${label} is not eligible until ${new Date((seconds + 1) * 1000).toISOString()}.`);
  }
}

export async function waitForSuccess(
  publicClient: any,
  hash: `0x${string}`,
  confirmations: number,
): Promise<any> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
  assert.equal(receipt.status, "success", `transaction ${hash} failed`);
  return receipt;
}
