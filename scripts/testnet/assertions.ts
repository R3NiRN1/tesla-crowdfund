import assert from "node:assert/strict";

import { BigNumber, Contract, ContractReceipt, ContractTransaction, providers } from "ethers";

export const BSC_TESTNET_CHAIN_ID = 97;
export const EXPECTED_V2_VERSION = "2.0.0-alpha";

export async function requireBscTestnet(provider: providers.Provider): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error(
      `Testnet harness is chain-97-only. Connected chain ${network.chainId} is refused before any transaction.`,
    );
  }
}

export async function requireCode(provider: providers.Provider, label: string, address: string): Promise<void> {
  const code = await provider.getCode(address);
  assert.notEqual(code, "0x", `${label} has no deployed code at ${address}`);
}

export async function assertFactoryIdentity(
  factory: Contract,
  expectedToken: string,
  expectedArbitrator: string,
): Promise<void> {
  const [version, token, arbitrator] = await Promise.all([
    factory.CONTRACT_VERSION(),
    factory.token(),
    factory.arbitrator(),
  ]);
  assert.equal(version, EXPECTED_V2_VERSION, "unexpected CampaignFactoryV2 version");
  assert.equal(token.toLowerCase(), expectedToken.toLowerCase(), "factory token mismatch");
  assert.equal(arbitrator.toLowerCase(), expectedArbitrator.toLowerCase(), "factory arbitrator mismatch");
}

export async function assertCampaignIdentity(
  campaign: Contract,
  expectedToken: string,
  expectedArbitrator: string,
  expectedCreator: string,
): Promise<void> {
  const [version, token, arbitrator, owner] = await Promise.all([
    campaign.CONTRACT_VERSION(),
    campaign.token(),
    campaign.arbitrator(),
    campaign.owner(),
  ]);
  assert.equal(version, EXPECTED_V2_VERSION, `unexpected CampaignV2 version at ${campaign.address}`);
  assert.equal(token.toLowerCase(), expectedToken.toLowerCase(), "campaign token mismatch");
  assert.equal(arbitrator.toLowerCase(), expectedArbitrator.toLowerCase(), "campaign arbitrator mismatch");
  assert.equal(owner.toLowerCase(), expectedCreator.toLowerCase(), "campaign creator mismatch");
}

export async function assertEscrowAccounting(token: Contract, campaign: Contract): Promise<void> {
  const [balance, totalContributed, totalReleased, totalRefunded, goal] = await Promise.all([
    token.balanceOf(campaign.address),
    campaign.totalContributed(),
    campaign.totalReleased(),
    campaign.totalRefunded(),
    campaign.goal(),
  ]);
  assert.ok(totalContributed.lte(goal), `campaign ${campaign.address} exceeded its goal`);
  const expected = BigNumber.from(totalContributed).sub(totalReleased).sub(totalRefunded);
  assert.equal(balance.toString(), expected.toString(), `escrow accounting mismatch at ${campaign.address}`);
}

export async function assertTerminalEmpty(token: Contract, campaign: Contract): Promise<void> {
  await assertEscrowAccounting(token, campaign);
  const [state, balance] = await Promise.all([campaign.state(), token.balanceOf(campaign.address)]);
  assert.ok(state.eq(2) || state.eq(3), `campaign ${campaign.address} is not terminal`);
  assert.equal(balance.toString(), "0", `terminal campaign ${campaign.address} retains escrow`);
}

export function requireEligible(timestamp: BigNumber, currentBlockTimestamp: number, label: string): void {
  const seconds = timestamp.toNumber();
  if (currentBlockTimestamp <= seconds) {
    throw new Error(`${label} is not eligible until ${new Date((seconds + 1) * 1000).toISOString()}.`);
  }
}

export async function waitForSuccess(
  transaction: ContractTransaction,
  confirmations: number,
): Promise<ContractReceipt> {
  const receipt = await transaction.wait(confirmations);
  assert.equal(receipt.status, 1, `transaction ${transaction.hash} failed`);
  return receipt;
}
