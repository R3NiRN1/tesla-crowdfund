import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { network } from "hardhat";
import { keccak256, parseEther, parseEventLogs, toBytes } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import {
  assertCampaignIdentity,
  assertEscrowAccounting,
  assertFactoryIdentity,
  assertTerminalEmpty,
  requireBscTestnet,
  requireCode,
  requireEligible,
  waitForSuccess,
} from "./assertions.js";
import {
  assertPublicPublication as assertBackendPublication,
  prepareApprovedSubmission,
  recordVerifiedPublication,
} from "./backend-client.js";
import {
  HARNESS_SCHEMA,
  HarnessPhase,
  HarnessState,
  ScenarioName,
  ScenarioRecord,
  markPhase,
  markScenarioPhase,
  requireScenario,
  saveState,
} from "./state.js";

const DAY = 24 * 60 * 60;
const LONG_DURATION = 90 * DAY;
const UNDERFUNDED_DURATION = 5 * 60;
const GOAL = parseEther("100");
const MILESTONE_AMOUNTS = [parseEther("40"), parseEther("60")];
const MILESTONE_DESCRIPTIONS = ["Testnet milestone one", "Testnet milestone two"];

type Roles = {
  deployer: PrivateKeyAccount;
  creator: PrivateKeyAccount;
  arbitrator: PrivateKeyAccount;
  backerA: PrivateKeyAccount;
  backerB: PrivateKeyAccount;
  outsider: PrivateKeyAccount;
};

type Context = {
  roles: Roles;
  factory: any;
  token: any;
  publicClient: any;
  viem: any;
  confirmations: number;
};

type DeploymentFile = {
  schema: string;
  chainId: number;
  networkName: string;
  contracts: { FactoryV2: string; Token: string; Arbitrator: string };
  metadata: { tokenSource: string; deployer: string; factoryVersion: string };
};

function requiredPrivateKey(name: string): `0x${string}` {
  const value = String(process.env[name] || "").trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${name} must be supplied through the environment as a 32-byte testnet-only private key.`);
  }
  return value as `0x${string}`;
}

function connectedWallet(name: string): PrivateKeyAccount {
  return privateKeyToAccount(requiredPrivateKey(name));
}

function confirmations(): number {
  const parsed = Number(process.env.TESTNET_CONFIRMATIONS || 3);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error("TESTNET_CONFIRMATIONS must be an integer from 1 to 20.");
  }
  return parsed;
}

function releaseCommit(): string {
  const value = String(process.env.TESTNET_RELEASE_COMMIT || process.env.GITHUB_SHA || "").trim();
  if (!/^[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("TESTNET_RELEASE_COMMIT must be the exact 40-character release-candidate commit.");
  }
  return value.toLowerCase();
}

function loadDeployment(): DeploymentFile {
  const filename = path.resolve("deployments", "bscTestnet.json");
  if (!fs.existsSync(filename)) throw new Error(`Missing BSC testnet deployment manifest: ${filename}.`);
  const deployment = JSON.parse(fs.readFileSync(filename, "utf8")) as DeploymentFile;
  if (
    deployment.schema !== "tes-crowdfund-deployment/v2"
    || deployment.chainId !== 97
    || deployment.networkName !== "bscTestnet"
  ) {
    throw new Error("Harness accepts only the V2 bscTestnet deployment manifest on chain 97.");
  }
  if (deployment.metadata.tokenSource !== "MockTES") {
    throw new Error("Harness requires repository-deployed MockTES; external or mainnet TES is refused.");
  }
  return deployment;
}

function distinctRoles(roles: Roles): void {
  const addresses = Object.values(roles).map((wallet) => wallet.address.toLowerCase());
  assert.equal(new Set(addresses).size, addresses.length, "every harness role must use a distinct testnet wallet");
}

export async function buildContext(): Promise<Context> {
  const connection = await network.connect();
  const publicClient = await connection.viem.getPublicClient();
  await requireBscTestnet(publicClient);
  const deployment = loadDeployment();
  const roles: Roles = {
    deployer: connectedWallet("DEPLOYER_PRIVATE_KEY"),
    creator: connectedWallet("TESTNET_CREATOR_PRIVATE_KEY"),
    arbitrator: connectedWallet("TESTNET_ARBITRATOR_PRIVATE_KEY"),
    backerA: connectedWallet("TESTNET_BACKER_A_PRIVATE_KEY"),
    backerB: connectedWallet("TESTNET_BACKER_B_PRIVATE_KEY"),
    outsider: connectedWallet("TESTNET_OUTSIDER_PRIVATE_KEY"),
  };
  distinctRoles(roles);
  assert.equal(roles.deployer.address.toLowerCase(), deployment.metadata.deployer.toLowerCase());
  assert.equal(roles.arbitrator.address.toLowerCase(), deployment.contracts.Arbitrator.toLowerCase());

  await Promise.all([
    requireCode(publicClient, "CampaignFactoryV2", deployment.contracts.FactoryV2),
    requireCode(publicClient, "MockTES", deployment.contracts.Token),
  ]);
  const factory: any = await connection.viem.getContractAt("CampaignFactoryV2", deployment.contracts.FactoryV2 as `0x${string}`);
  const token: any = await connection.viem.getContractAt("MockTES", deployment.contracts.Token as `0x${string}`);
  await assertFactoryIdentity(factory, deployment.contracts.Token, deployment.contracts.Arbitrator);
  assert.equal((await token.read.owner()).toLowerCase(), roles.deployer.address.toLowerCase());

  return { roles, factory, token, publicClient, viem: connection.viem, confirmations: confirmations() };
}

function createInitialState(context: Context): HarnessState {
  const now = new Date().toISOString();
  return {
    schema: HARNESS_SCHEMA,
    chainId: 97,
    releaseCommit: releaseCommit(),
    createdAt: now,
    updatedAt: now,
    deployment: {
      factory: context.factory.address,
      token: context.token.address,
      arbitrator: context.roles.arbitrator.address,
      deployer: context.roles.deployer.address,
      tokenSource: "MockTES",
    },
    participants: {
      creator: context.roles.creator.address,
      arbitrator: context.roles.arbitrator.address,
      backerA: context.roles.backerA.address,
      backerB: context.roles.backerB.address,
      outsider: context.roles.outsider.address,
    },
    scenarios: {},
    completedPhases: [],
  };
}

function scenarioDescription(name: ScenarioName): string {
  return `TeslaStarter V2 BSC testnet ${name} lifecycle evidence campaign`;
}

function scenarioMetadata(name: ScenarioName): string {
  return `ipfs://teslastarter-v2-testnet-${name}`;
}

async function campaignAt(context: Context, state: HarnessState, name: ScenarioName): Promise<any> {
  const record = requireScenario(state, name);
  await requireCode(context.publicClient, `CampaignV2 ${name}`, record.address);
  const campaign = await context.viem.getContractAt("CampaignV2", record.address as `0x${string}`);
  await assertCampaignIdentity(
    campaign,
    context.token.address,
    context.roles.arbitrator.address,
    context.roles.creator.address,
  );
  return campaign;
}

async function createCampaign(
  context: Context,
  state: HarnessState,
  name: ScenarioName,
  duration: number,
): Promise<{ campaign: any; record: ScenarioRecord }> {
  const existing = state.scenarios[name];
  if (existing) return { campaign: await campaignAt(context, state, name), record: existing };

  const hash = await context.factory.write.createCampaignWithMetadata([
    scenarioDescription(name),
    scenarioMetadata(name),
    GOAL,
    BigInt(duration),
    MILESTONE_DESCRIPTIONS,
    MILESTONE_AMOUNTS,
  ], { account: context.roles.creator });
  const receipt = await waitForSuccess(context.publicClient, hash, context.confirmations);
  const [created]: any[] = parseEventLogs({
    abi: context.factory.abi,
    logs: receipt.logs,
    eventName: "CampaignV2Created",
  });
  assert.ok(created?.args?.campaign, `CampaignV2Created missing for ${name}`);
  const campaign = await context.viem.getContractAt("CampaignV2", created.args.campaign);
  await assertCampaignIdentity(
    campaign,
    context.token.address,
    context.roles.arbitrator.address,
    context.roles.creator.address,
  );
  const record: ScenarioRecord = {
    address: campaign.address,
    creationTransactionHash: hash,
    creationBlock: Number(receipt.blockNumber),
    deadline: (await campaign.read.deadline()).toString(),
    metadataURI: scenarioMetadata(name),
    phases: [],
  };
  state.scenarios[name] = record;
  saveState(state);
  return { campaign, record };
}

async function mintAndContribute(
  context: Context,
  campaign: any,
  backer: PrivateKeyAccount,
  requested: bigint,
): Promise<void> {
  await waitForSuccess(context.publicClient,
    await context.token.write.mint([backer.address, requested], { account: context.roles.deployer }),
    context.confirmations);
  await waitForSuccess(context.publicClient,
    await context.token.write.approve([campaign.address, requested], { account: backer }),
    context.confirmations);
  await waitForSuccess(context.publicClient,
    await campaign.write.contribute([requested], { account: backer }),
    context.confirmations);
  await assertEscrowAccounting(context.token, campaign);
}

async function fundExactly(context: Context, campaign: any): Promise<void> {
  await mintAndContribute(context, campaign, context.roles.backerA, parseEther("90"));
  await mintAndContribute(context, campaign, context.roles.backerB, parseEther("10"));
  assert.equal(await campaign.read.totalContributed(), GOAL);
  assert.equal(await campaign.read.state(), 1);
}

function evidence(name: string, milestone: number): string {
  return keccak256(toBytes(`${name}:milestone:${milestone}`));
}

async function submitEvidence(context: Context, campaign: any, name: ScenarioName, milestone: number): Promise<void> {
  await waitForSuccess(context.publicClient,
    await campaign.write.submitMilestoneEvidence([
      BigInt(milestone),
      `ipfs://teslastarter-v2-testnet-${name}-evidence-${milestone}`,
      evidence(name, milestone),
    ], { account: context.roles.creator }), context.confirmations);
}

async function challenge(context: Context, campaign: any, milestone: number): Promise<void> {
  await waitForSuccess(context.publicClient,
    await campaign.write.voteMilestone([BigInt(milestone), 2], { account: context.roles.backerB }),
    context.confirmations);
  const details = await campaign.read.milestones([BigInt(milestone)]);
  assert.equal(details[9], parseEther("10"));
  assert.equal(details[9], await campaign.read.challengeThresholdWeight());
}

async function approve(context: Context, campaign: any, milestone: number): Promise<void> {
  await waitForSuccess(context.publicClient,
    await campaign.write.voteMilestone([BigInt(milestone), 1], { account: context.roles.backerA }),
    context.confirmations);
  const details = await campaign.read.milestones([BigInt(milestone)]);
  assert.ok(details[8] > 0n, "contributor approval weight was not recorded on-chain");
}

export async function seed(existing: HarnessState | null, context: Context): Promise<HarnessState> {
  const state = existing || createInitialState(context);
  assert.equal(state.releaseCommit, releaseCommit(), "state belongs to a different release commit");
  if (state.completedPhases.includes("seed")) return state;

  const approved = await prepareApprovedSubmission(context.roles.creator, {
    title: "TeslaStarter V2 testnet publication",
    description: scenarioDescription("happy"),
    metadataURI: scenarioMetadata("happy"),
    goal: GOAL.toString(),
    duration: LONG_DURATION,
    milestoneDescriptions: MILESTONE_DESCRIPTIONS,
    milestoneAmounts: MILESTONE_AMOUNTS.map((amount) => amount.toString()),
  });

  const happy = await createCampaign(context, state, "happy", LONG_DURATION);
  const publication = await recordVerifiedPublication(approved, happy.record.creationTransactionHash);
  assert.equal(publication.campaignAddress.toLowerCase(), happy.campaign.address.toLowerCase());
  state.backendPublication = {
    submissionId: approved.id,
    campaignAddress: publication.campaignAddress,
    transactionHash: happy.record.creationTransactionHash,
    verifiedAt: publication.verifiedAt,
  };
  saveState(state);

  const happyBStart = await context.token.read.balanceOf([context.roles.backerB.address]);
  await mintAndContribute(context, happy.campaign, context.roles.backerA, parseEther("60"));
  await mintAndContribute(context, happy.campaign, context.roles.backerB, parseEther("50"));
  assert.equal(await happy.campaign.read.totalContributed(), GOAL);
  assert.equal((await context.token.read.balanceOf([context.roles.backerB.address])) - happyBStart, parseEther("10"));
  assert.equal(await happy.campaign.read.state(), 1);
  await submitEvidence(context, happy.campaign, "happy", 0);
  await approve(context, happy.campaign, 0);
  markScenarioPhase(happy.record, "seed");

  const disputed = await createCampaign(context, state, "disputed-approval", LONG_DURATION);
  await fundExactly(context, disputed.campaign);
  await submitEvidence(context, disputed.campaign, "disputed-approval", 0);
  await challenge(context, disputed.campaign, 0);
  markScenarioPhase(disputed.record, "seed");

  const rejected = await createCampaign(context, state, "later-rejection", LONG_DURATION);
  await fundExactly(context, rejected.campaign);
  await submitEvidence(context, rejected.campaign, "later-rejection", 0);
  markScenarioPhase(rejected.record, "seed");

  const timeout = await createCampaign(context, state, "arbitration-timeout", LONG_DURATION);
  await fundExactly(context, timeout.campaign);
  await submitEvidence(context, timeout.campaign, "arbitration-timeout", 0);
  await challenge(context, timeout.campaign, 0);
  markScenarioPhase(timeout.record, "seed");

  const inactivity = await createCampaign(context, state, "creator-inactivity", LONG_DURATION);
  await fundExactly(context, inactivity.campaign);
  markScenarioPhase(inactivity.record, "seed");

  const underfunded = await createCampaign(context, state, "underfunded", UNDERFUNDED_DURATION);
  await mintAndContribute(context, underfunded.campaign, context.roles.backerA, parseEther("40"));
  assert.equal(await underfunded.campaign.read.state(), 0);
  markScenarioPhase(underfunded.record, "seed");

  markPhase(state, "seed");
  saveState(state);
  return state;
}

async function latestTimestamp(context: Context): Promise<bigint> {
  const block = await context.publicClient.getBlock();
  return block.timestamp;
}

async function refundIfNeeded(context: Context, campaign: any, backer: PrivateKeyAccount): Promise<void> {
  if (await campaign.read.refundClaimed([backer.address])) return;
  if ((await campaign.read.contributions([backer.address])) === 0n) return;
  await waitForSuccess(context.publicClient, await campaign.write.refund({ account: backer }), context.confirmations);
}

export async function fundingExpiry(context: Context, state: HarnessState): Promise<void> {
  if (state.completedPhases.includes("funding-expiry")) return;
  const record = requireScenario(state, "underfunded");
  const campaign = await campaignAt(context, state, "underfunded");
  requireEligible(await campaign.read.deadline(), await latestTimestamp(context), "underfunded campaign expiry");
  if ((await campaign.read.state()) === 0) {
    await waitForSuccess(context.publicClient,
      await campaign.write.activateFundingFailure({ account: context.roles.outsider }), context.confirmations);
  }
  await refundIfNeeded(context, campaign, context.roles.backerA);
  await assertTerminalEmpty(context.token, campaign);
  markScenarioPhase(record, "funding-expiry");
  markPhase(state, "funding-expiry");
  saveState(state);
}

async function finalizeAfterReview(context: Context, campaign: any, milestone: number, label: string): Promise<void> {
  const details = await campaign.read.milestones([BigInt(milestone)]);
  requireEligible(details[6], await latestTimestamp(context), label);
  if (details[2] === 1) {
    await waitForSuccess(context.publicClient,
      await campaign.write.finalizeMilestone([BigInt(milestone)], { account: context.roles.outsider }), context.confirmations);
  }
}

export async function reviewOne(context: Context, state: HarnessState): Promise<void> {
  if (state.completedPhases.includes("review-1")) return;

  const happyRecord = requireScenario(state, "happy");
  const happy = await campaignAt(context, state, "happy");
  await finalizeAfterReview(context, happy, 0, "happy milestone-one review");
  if ((await happy.read.nextMilestone()) === 1n && (await happy.read.milestones([1n]))[2] === 0) {
    await submitEvidence(context, happy, "happy", 1);
    await approve(context, happy, 1);
  }
  markScenarioPhase(happyRecord, "review-1");

  const disputedRecord = requireScenario(state, "disputed-approval");
  const disputed = await campaignAt(context, state, "disputed-approval");
  await finalizeAfterReview(context, disputed, 0, "disputed-approval review");
  if ((await disputed.read.milestones([0n]))[2] === 2) {
    await waitForSuccess(context.publicClient,
      await disputed.write.resolveDispute([0n, true], { account: context.roles.arbitrator }), context.confirmations);
  }
  if ((await disputed.read.nextMilestone()) === 1n && (await disputed.read.milestones([1n]))[2] === 0) {
    await submitEvidence(context, disputed, "disputed-approval", 1);
    await approve(context, disputed, 1);
  }
  markScenarioPhase(disputedRecord, "review-1");

  const rejectedRecord = requireScenario(state, "later-rejection");
  const rejected = await campaignAt(context, state, "later-rejection");
  await finalizeAfterReview(context, rejected, 0, "later-rejection milestone-one review");
  if ((await rejected.read.nextMilestone()) === 1n && (await rejected.read.milestones([1n]))[2] === 0) {
    await submitEvidence(context, rejected, "later-rejection", 1);
    await challenge(context, rejected, 1);
  }
  markScenarioPhase(rejectedRecord, "review-1");

  const timeoutRecord = requireScenario(state, "arbitration-timeout");
  const timeout = await campaignAt(context, state, "arbitration-timeout");
  await finalizeAfterReview(context, timeout, 0, "arbitration-timeout review");
  assert.equal((await timeout.read.milestones([0n]))[2], 2);
  markScenarioPhase(timeoutRecord, "review-1");

  markPhase(state, "review-1");
  saveState(state);
}

export async function reviewTwo(context: Context, state: HarnessState): Promise<void> {
  if (state.completedPhases.includes("review-2")) return;

  for (const name of ["happy", "disputed-approval"] as const) {
    const record = requireScenario(state, name);
    const campaign = await campaignAt(context, state, name);
    await finalizeAfterReview(context, campaign, 1, `${name} milestone-two review`);
    assert.equal(await campaign.read.state(), 3);
    await assertTerminalEmpty(context.token, campaign);
    markScenarioPhase(record, "review-2");
  }

  const rejectedRecord = requireScenario(state, "later-rejection");
  const rejected = await campaignAt(context, state, "later-rejection");
  await finalizeAfterReview(context, rejected, 1, "later-rejection milestone-two review");
  if ((await rejected.read.milestones([1n]))[2] === 2) {
    await waitForSuccess(context.publicClient,
      await rejected.write.resolveDispute([1n, false], { account: context.roles.arbitrator }), context.confirmations);
  }
  assert.equal(await rejected.read.refundPoolSnapshot(), parseEther("60"));
  await refundIfNeeded(context, rejected, context.roles.backerA);
  await refundIfNeeded(context, rejected, context.roles.backerB);
  await assertTerminalEmpty(context.token, rejected);
  markScenarioPhase(rejectedRecord, "review-2");

  markPhase(state, "review-2");
  saveState(state);
}

export async function arbitrationTimeout(context: Context, state: HarnessState): Promise<void> {
  if (state.completedPhases.includes("arbitration-timeout")) return;
  const record = requireScenario(state, "arbitration-timeout");
  const campaign = await campaignAt(context, state, "arbitration-timeout");
  const details = await campaign.read.milestones([0n]);
  assert.equal(details[2], 2, "milestone is not disputed");
  requireEligible(details[7], await latestTimestamp(context), "arbitration timeout");
  await waitForSuccess(context.publicClient,
    await campaign.write.expireDispute([0n], { account: context.roles.outsider }), context.confirmations);
  await refundIfNeeded(context, campaign, context.roles.backerA);
  await refundIfNeeded(context, campaign, context.roles.backerB);
  await assertTerminalEmpty(context.token, campaign);
  markScenarioPhase(record, "arbitration-timeout");
  markPhase(state, "arbitration-timeout");
  saveState(state);
}

export async function creatorInactivity(context: Context, state: HarnessState): Promise<void> {
  if (state.completedPhases.includes("creator-inactivity")) return;
  const record = requireScenario(state, "creator-inactivity");
  const campaign = await campaignAt(context, state, "creator-inactivity");
  requireEligible(await campaign.read.milestoneSubmissionDeadline(), await latestTimestamp(context), "creator inactivity timeout");
  if ((await campaign.read.state()) === 1) {
    await waitForSuccess(context.publicClient,
      await campaign.write.cancelForMissingMilestone({ account: context.roles.outsider }), context.confirmations);
  }
  await refundIfNeeded(context, campaign, context.roles.backerA);
  await refundIfNeeded(context, campaign, context.roles.backerB);
  await assertTerminalEmpty(context.token, campaign);
  markScenarioPhase(record, "creator-inactivity");
  markPhase(state, "creator-inactivity");
  saveState(state);
}

export async function verifyAll(context: Context, state: HarnessState): Promise<void> {
  const required: HarnessPhase[] = [
    "seed",
    "funding-expiry",
    "review-1",
    "review-2",
    "arbitration-timeout",
    "creator-inactivity",
  ];
  const missing = required.filter((phase) => !state.completedPhases.includes(phase));
  if (missing.length) throw new Error(`Harness is incomplete. Missing phases: ${missing.join(", ")}.`);

  await assertFactoryIdentity(context.factory, context.token.address, context.roles.arbitrator.address);
  for (const name of Object.keys(state.scenarios) as ScenarioName[]) {
    const campaign = await campaignAt(context, state, name);
    await assertTerminalEmpty(context.token, campaign);
  }
  const publication = state.backendPublication;
  if (!publication) throw new Error("Backend publication-verification evidence is missing.");
  await assertBackendPublication(
    publication.submissionId,
    publication.campaignAddress,
    publication.transactionHash,
  );

  markPhase(state, "verify-all");
  saveState(state);
}
