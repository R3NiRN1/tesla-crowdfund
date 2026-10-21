import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, maxUint256, parseEther, parseEventLogs, toBytes } from "viem";

const DAY = 24 * 60 * 60;
const connection = await network.create();
const { viem } = connection;
const publicClient = await viem.getPublicClient();
const testClient = await viem.getTestClient();
const wallets = await viem.getWalletClients();

type Wallet = (typeof wallets)[number];

async function send(transaction: Promise<`0x${string}`>) {
  const hash = await transaction;
  return publicClient.waitForTransactionReceipt({ hash });
}

async function advance(seconds: number) {
  await testClient.increaseTime({ seconds });
  await testClient.mine({ blocks: 1 });
}

async function deployV2(options?: {
  goal?: string;
  goalUnits?: string;
  duration?: number;
  milestoneAmounts?: string[];
  milestoneAmountUnits?: string[];
}) {
  const [deployer, creator, arbitrator, backerA, backerB, outsider] = wallets;
  const token = await viem.deployContract("MockTES", [deployer.account.address]);
  const factory = await viem.deployContract("CampaignFactoryV2", [token.address, arbitrator.account.address]);

  const goal = options?.goalUnits ? BigInt(options.goalUnits) : parseEther(options?.goal ?? "100");
  const amounts = options?.milestoneAmountUnits
    ? options.milestoneAmountUnits.map(BigInt)
    : options?.milestoneAmounts?.map((value) => parseEther(value)) ?? [parseEther("40"), parseEther("60")];
  const descriptions = amounts.map((_, index) => `Milestone ${index + 1}`);

  const receipt = await send(factory.write.createCampaignWithMetadata([
    "Teslastarter V2 campaign",
    "ipfs://teslastarter-v2-test",
    goal,
    BigInt(options?.duration ?? 7 * DAY),
    descriptions,
    amounts,
  ], { account: creator.account }));
  const [created] = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "CampaignV2Created" });
  assert.ok(created?.args.campaign);

  const campaign = await viem.getContractAt("CampaignV2", created.args.campaign);
  return { deployer, creator, arbitrator, backerA, backerB, outsider, token, factory, campaign, goal };
}

async function fund(token: any, campaign: any, minter: Wallet, backer: Wallet, amount: string) {
  return fundUnits(token, campaign, minter, backer, parseEther(amount));
}

async function fundUnits(token: any, campaign: any, minter: Wallet, backer: Wallet, amount: bigint) {
  await send(token.write.mint([backer.account.address, amount], { account: minter.account }));
  await send(token.write.approve([campaign.address, amount], { account: backer.account }));
  await send(campaign.write.contribute([amount], { account: backer.account }));
  return amount;
}

async function assertStandardTokenAccounting(token: any, campaign: any) {
  const [state, balance, contributed, released, refunded, goal] = await Promise.all([
    campaign.read.state(),
    token.read.balanceOf([campaign.address]),
    campaign.read.totalContributed(),
    campaign.read.totalReleased(),
    campaign.read.totalRefunded(),
    campaign.read.goal(),
  ]);

  assert.ok(contributed <= goal);
  if (Number(state) === 2) {
    const [snapshot, remaining] = await Promise.all([
      campaign.read.refundPoolSnapshot(),
      campaign.read.refundPoolRemaining(),
    ]);
    assert.equal(refunded + remaining, snapshot);
    assert.equal(balance, remaining);
  } else {
    assert.equal(balance + released + refunded, contributed);
  }
}

function evidence(label: string) {
  return keccak256(toBytes(label));
}

describe("CampaignV2 security invariants", function () {
  it("hard-caps funding and leaves excess in the final backer's wallet", async function () {
    const { deployer, backerA, backerB, token, campaign, goal } = await deployV2();

    await fund(token, campaign, deployer, backerA, "80");
    const requested = parseEther("50");
    await send(token.write.mint([backerB.account.address, requested], { account: deployer.account }));
    await send(token.write.approve([campaign.address, requested], { account: backerB.account }));
    const receipt = await send(campaign.write.contribute([requested], { account: backerB.account }));
    const [contributed] = parseEventLogs({ abi: campaign.abi, logs: receipt.logs, eventName: "Contributed" });

    assert.equal(await campaign.read.totalContributed(), goal);
    assert.equal(await token.read.balanceOf([campaign.address]), goal);
    assert.equal(await token.read.balanceOf([backerB.account.address]), parseEther("30"));
    assert.equal(contributed?.args.requestedAmount, requested);
    assert.equal(contributed?.args.acceptedAmount, parseEther("20"));
    assert.equal(await campaign.read.remainingToGoal(), 0n);
    assert.equal(await campaign.read.state(), 1);
    await assert.rejects(campaign.write.contribute([1n], { account: backerA.account }), /InvalidState/);
  });

  it("refunds an underfunded campaign after the immutable deadline without reviving funding", async function () {
    const { deployer, backerA, token, campaign } = await deployV2({ duration: 60 });
    const contribution = await fund(token, campaign, deployer, backerA, "60");
    await advance(61);
    await send(campaign.write.refund({ account: backerA.account }));

    assert.equal(await campaign.read.state(), 2);
    assert.equal(await campaign.read.totalContributed(), contribution);
    assert.equal(await campaign.read.totalRefunded(), contribution);
    assert.equal(await token.read.balanceOf([backerA.account.address]), contribution);
    assert.equal(await token.read.balanceOf([campaign.address]), 0n);
    await assert.rejects(campaign.write.contribute([1n], { account: backerA.account }), /InvalidState/);
    await assert.rejects(campaign.write.refund({ account: backerA.account }), /AlreadyRefunded/);
  });

  it("enforces sequential evidence gates and permissionless release only after review", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");

    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://evidence-1", evidence("m1")], { account: creator.account }));
    await assert.rejects(
      campaign.write.submitMilestoneEvidence([1n, "ipfs://evidence-2", evidence("m2")], { account: creator.account }),
      /MilestoneOutOfOrder/,
    );
    await assert.rejects(campaign.write.finalizeMilestone([0n], { account: outsider.account }), /ReviewActive/);
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));

    assert.equal(await campaign.read.nextMilestone(), 1n);
    assert.equal(await campaign.read.totalReleased(), parseEther("40"));
    assert.equal(await token.read.balanceOf([creator.account.address]), parseEther("40"));
    await send(campaign.write.submitMilestoneEvidence([1n, "ipfs://evidence-2", evidence("m2")], { account: creator.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([1n], { account: outsider.account }));

    assert.equal(await campaign.read.state(), 3);
    assert.equal(await campaign.read.totalReleased(), parseEther("100"));
    assert.equal(await token.read.balanceOf([campaign.address]), 0n);
  });

  it("keeps the full review window open, then routes a threshold challenge to arbitration", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://evidence-1", evidence("challenge")], { account: creator.account }));
    await send(campaign.write.voteMilestone([0n, 2], { account: backerB.account }));

    const beforeReviewEnds = await campaign.read.milestones([0n]);
    assert.equal(beforeReviewEnds[2], 1);
    assert.equal(beforeReviewEnds[9], parseEther("10"));
    await send(campaign.write.voteMilestone([0n, 1], { account: backerA.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));

    const disputed = await campaign.read.milestones([0n]);
    assert.equal(disputed[2], 2);
    assert.ok(disputed[7] > 0n);
    await assert.rejects(campaign.write.resolveDispute([0n, true], { account: outsider.account }), /NotArbitrator/);
    await send(campaign.write.resolveDispute([0n, true], { account: arbitrator.account }));
    assert.equal(await campaign.read.nextMilestone(), 1n);
    assert.equal(await token.read.balanceOf([creator.account.address]), parseEther("40"));
  });

  it("rounds the 10% challenge threshold up without overflowing at uint256 boundaries", async function () {
    for (const total of [1n, 9_999n, 10_000n, 10_001n, maxUint256]) {
      const { deployer, backerA, token, campaign } = await deployV2({
        goalUnits: total.toString(), milestoneAmountUnits: [total.toString()],
      });
      assert.equal(await campaign.read.challengeThresholdWeight(), 0n);
      await fundUnits(token, campaign, deployer, backerA, total);
      assert.equal(await campaign.read.challengeThresholdWeight(), (total * 1_000n + 9_999n) / 10_000n);
    }
  });

  it("turns a rejected later milestone into pro-rata refunds of all unreleased escrow", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "33");
    await fund(token, campaign, deployer, backerB, "67");
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://evidence-1", evidence("release-first")], { account: creator.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));
    assert.equal(await token.read.balanceOf([campaign.address]), parseEther("60"));

    await send(campaign.write.submitMilestoneEvidence([1n, "ipfs://evidence-2", evidence("reject-second")], { account: creator.account }));
    await send(campaign.write.voteMilestone([1n, 2], { account: backerA.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([1n], { account: outsider.account }));
    await send(campaign.write.resolveDispute([1n, false], { account: arbitrator.account }));

    assert.equal(await campaign.read.state(), 2);
    assert.equal(await campaign.read.refundPoolSnapshot(), parseEther("60"));
    await send(campaign.write.refund({ account: backerA.account }));
    await send(campaign.write.refund({ account: backerB.account }));
    assert.equal(await token.read.balanceOf([backerA.account.address]), parseEther("19.8"));
    assert.equal(await token.read.balanceOf([backerB.account.address]), parseEther("40.2"));
    assert.equal(await campaign.read.refundPoolRemaining(), 0n);
    assert.equal(await token.read.balanceOf([campaign.address]), 0n);
  });

  it("fails safe to refunds when arbitration times out", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://evidence-timeout", evidence("timeout")], { account: creator.account }));
    await send(campaign.write.voteMilestone([0n, 2], { account: backerB.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));
    await advance(14 * DAY + 1);
    await send(campaign.write.expireDispute([0n], { account: outsider.account }));
    assert.equal(await campaign.read.state(), 2);
    assert.equal(await campaign.read.refundPoolSnapshot(), parseEther("100"));
  });

  it("fails safe to refunds when a funded creator never submits the next milestone", async function () {
    const { deployer, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");
    await advance(30 * DAY + 1);
    await send(campaign.write.cancelForMissingMilestone({ account: outsider.account }));
    assert.equal(await campaign.read.state(), 2);
    assert.equal(await campaign.read.refundPoolSnapshot(), parseEther("100"));
  });

  it("allows only contributors to vote and prevents repeat voting", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://evidence-vote", evidence("vote")], { account: creator.account }));
    await assert.rejects(campaign.write.voteMilestone([0n, 2], { account: outsider.account }), /NotContributor/);
    await send(campaign.write.voteMilestone([0n, 1], { account: backerA.account }));
    await assert.rejects(campaign.write.voteMilestone([0n, 2], { account: backerA.account }), /AlreadyVoted/);
  });

  it("keeps V1 and V2 explicitly separate and rejects invalid V2 milestone totals", async function () {
    const [deployer, creator, arbitrator] = wallets;
    const token = await viem.deployContract("MockTES", [deployer.account.address]);
    const factory = await viem.deployContract("CampaignFactoryV2", [token.address, arbitrator.account.address]);
    assert.equal(await factory.read.CONTRACT_VERSION(), "2.0.0-alpha");
    await assert.rejects(factory.write.createCampaign([
      "Invalid total", parseEther("100"), BigInt(DAY), ["Only milestone"], [parseEther("99")],
    ], { account: creator.account }), /InvalidMilestones/);
  });

  it("rejects code-less factory tokens and exposes identity on each deployed campaign", async function () {
    const [deployer, , arbitrator] = wallets;
    await assert.rejects(
      viem.deployContract("CampaignFactoryV2", [deployer.account.address, arbitrator.account.address]),
      /TokenHasNoCode/,
    );
    const { campaign, factory, creator } = await deployV2();
    assert.equal(await factory.read.CONTRACT_VERSION(), "2.0.0-alpha");
    assert.equal(await campaign.read.CONTRACT_VERSION(), "2.0.0-alpha");
    assert.equal((await campaign.read.owner()).toLowerCase(), creator.account.address.toLowerCase());
  });

  it("preserves the exact cap across many backers and arbitrary contribution ordering", async function () {
    const { deployer, token, campaign, goal } = await deployV2({ goal: "100", milestoneAmounts: ["100"] });
    const backers = wallets.slice(3, 9);
    const requests = ["13", "7", "26", "9", "25", "50"];
    for (let index = 0; index < backers.length; index += 1) {
      const requested = parseEther(requests[index]);
      await send(token.write.mint([backers[index].account.address, requested], { account: deployer.account }));
      await send(token.write.approve([campaign.address, requested], { account: backers[index].account }));
      await send(campaign.write.contribute([requested], { account: backers[index].account }));
      assert.ok((await campaign.read.totalContributed()) <= goal);
      await assertStandardTokenAccounting(token, campaign);
    }
    assert.equal(await campaign.read.totalContributed(), goal);
    assert.equal(await campaign.read.uniqueBackerCount(), BigInt(backers.length));
    assert.equal(await token.read.balanceOf([backers.at(-1)!.account.address]), parseEther("30"));
  });

  it("conserves a refund pool exactly despite integer rounding and claim order", async function () {
    const { deployer, creator, arbitrator, outsider, token, campaign } = await deployV2({
      goalUnits: "7", milestoneAmountUnits: ["2", "5"],
    });
    const [backerA, backerB, backerC] = wallets.slice(3, 6);
    await fundUnits(token, campaign, deployer, backerA, 2n);
    await fundUnits(token, campaign, deployer, backerB, 2n);
    await fundUnits(token, campaign, deployer, backerC, 3n);
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://rounding-1", evidence("rounding-1")], { account: creator.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));
    await send(campaign.write.submitMilestoneEvidence([1n, "ipfs://rounding-2", evidence("rounding-2")], { account: creator.account }));
    await send(campaign.write.voteMilestone([1n, 2], { account: backerA.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([1n], { account: outsider.account }));
    await send(campaign.write.resolveDispute([1n, false], { account: arbitrator.account }));
    for (const backer of [backerC, backerA, backerB]) {
      await send(campaign.write.refund({ account: backer.account }));
      await assertStandardTokenAccounting(token, campaign);
    }
    assert.equal(await campaign.read.totalRefunded(), 5n);
    assert.equal(await campaign.read.refundPoolRemaining(), 0n);
    assert.equal(await token.read.balanceOf([campaign.address]), 0n);
  });

  it("rejects expired-window and unexpected-role calls, then preserves timeout recovery", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");
    await assert.rejects(
      campaign.write.submitMilestoneEvidence([0n, "ipfs://forged", evidence("forged")], { account: outsider.account }),
      /OwnableUnauthorizedAccount/,
    );
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://window", evidence("window")], { account: creator.account }));
    await send(campaign.write.voteMilestone([0n, 2], { account: backerB.account }));
    await advance(7 * DAY + 1);
    await assert.rejects(campaign.write.voteMilestone([0n, 1], { account: backerA.account }), /ReviewEnded/);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));
    await assert.rejects(campaign.write.resolveDispute([0n, true], { account: creator.account }), /NotArbitrator/);
    await advance(14 * DAY + 1);
    await assert.rejects(campaign.write.resolveDispute([0n, true], { account: arbitrator.account }), /ArbitrationExpired/);
    await send(campaign.write.expireDispute([0n], { account: outsider.account }));
    await assert.rejects(campaign.write.expireDispute([0n], { account: outsider.account }), /InvalidState/);
    await assertStandardTokenAccounting(token, campaign);
  });

  it("fails safe when the creator misses a later milestone submission window", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://released", evidence("released")], { account: creator.account }));
    await advance(7 * DAY + 1);
    await send(campaign.write.finalizeMilestone([0n], { account: outsider.account }));
    await advance(30 * DAY + 1);
    await assert.rejects(
      campaign.write.submitMilestoneEvidence([1n, "ipfs://late", evidence("late")], { account: creator.account }),
      /MilestoneSubmissionExpired/,
    );
    await send(campaign.write.cancelForMissingMilestone({ account: outsider.account }));
    assert.equal(await campaign.read.refundPoolSnapshot(), parseEther("60"));
    await assertStandardTokenAccounting(token, campaign);
  });

  it("rejects both inbound and outbound directional token-accounting mismatches", async function () {
    const [deployer, creator, arbitrator, backer, outsider] = wallets;
    const token = await viem.deployContract("MockDirectionalFeeToken");
    const factory = await viem.deployContract("CampaignFactoryV2", [token.address, arbitrator.account.address]);
    const goal = parseEther("10");
    const receipt = await send(factory.write.createCampaign([
      "Directional fee rejection", goal, BigInt(DAY), ["Only milestone"], [goal],
    ], { account: creator.account }));
    const [created] = parseEventLogs({ abi: factory.abi, logs: receipt.logs, eventName: "CampaignV2Created" });
    assert.ok(created?.args.campaign);
    const campaign = await viem.getContractAt("CampaignV2", created.args.campaign);

    await send(token.write.mint([backer.account.address, goal], { account: deployer.account }));
    await send(token.write.approve([campaign.address, goal], { account: backer.account }));
    await send(token.write.setFeeSender([backer.account.address, true], { account: deployer.account }));
    await assert.rejects(campaign.write.contribute([goal], { account: backer.account }), /TokenAccountingMismatch/);
    assert.equal(await campaign.read.totalContributed(), 0n);
    assert.equal(await token.read.balanceOf([campaign.address]), 0n);
    await send(token.write.setFeeSender([backer.account.address, false], { account: deployer.account }));
    await send(campaign.write.contribute([goal], { account: backer.account }));
    await send(campaign.write.submitMilestoneEvidence([0n, "ipfs://outbound", evidence("outbound")], { account: creator.account }));
    await advance(7 * DAY + 1);
    await send(token.write.setFeeSender([campaign.address, true], { account: deployer.account }));
    await assert.rejects(campaign.write.finalizeMilestone([0n], { account: outsider.account }), /TokenAccountingMismatch/);
    assert.equal(await campaign.read.state(), 1);
    assert.equal(await campaign.read.totalReleased(), 0n);
    assert.equal(await token.read.balanceOf([campaign.address]), goal);
    assert.equal(await token.read.balanceOf([creator.account.address]), 0n);
  });
});
