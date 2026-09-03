import assert from "node:assert/strict";

import { ethers, network } from "hardhat";

const DAY = 24 * 60 * 60;

async function advance(seconds: number) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

async function deployV2(options?: {
  goal?: string;
  goalUnits?: string;
  duration?: number;
  milestoneAmounts?: string[];
  milestoneAmountUnits?: string[];
}) {
  const [deployer, creator, arbitrator, backerA, backerB, outsider] = await ethers.getSigners();
  const tokenFactory = await ethers.getContractFactory("MockTES");
  const token = await tokenFactory.deploy(deployer.address);
  await token.deployed();

  const factoryFactory = await ethers.getContractFactory("CampaignFactoryV2");
  const factory = await factoryFactory.deploy(token.address, arbitrator.address);
  await factory.deployed();

  const goal = options?.goalUnits
    ? ethers.BigNumber.from(options.goalUnits)
    : ethers.utils.parseEther(options?.goal ?? "100");
  const amounts = options?.milestoneAmountUnits
    ? options.milestoneAmountUnits.map((value) => ethers.BigNumber.from(value))
    : options?.milestoneAmounts?.map((value) => ethers.utils.parseEther(value)) ?? [
        ethers.utils.parseEther("40"),
        ethers.utils.parseEther("60"),
      ];
  const descriptions = amounts.map((_, index) => `Milestone ${index + 1}`);

  const tx = await factory.connect(creator).createCampaignWithMetadata(
    "Teslastarter V2 campaign",
    "ipfs://teslastarter-v2-test",
    goal,
    options?.duration ?? 7 * DAY,
    descriptions,
    amounts,
  );
  const receipt = await tx.wait();
  const created = receipt.events?.find((event) => event.event === "CampaignV2Created");
  assert.ok(created?.args?.campaign);

  const campaign = await ethers.getContractAt("CampaignV2", created.args.campaign);
  return { deployer, creator, arbitrator, backerA, backerB, outsider, token, factory, campaign, goal };
}

async function fund(token: any, campaign: any, minter: any, backer: any, amount: string) {
  const value = ethers.utils.parseEther(amount);
  await token.connect(minter).mint(backer.address, value);
  await token.connect(backer).approve(campaign.address, value);
  await campaign.connect(backer).contribute(value);
  return value;
}

async function fundUnits(token: any, campaign: any, minter: any, backer: any, value: any) {
  const amount = ethers.BigNumber.from(value);
  await token.connect(minter).mint(backer.address, amount);
  await token.connect(backer).approve(campaign.address, amount);
  await campaign.connect(backer).contribute(amount);
  return amount;
}

async function assertStandardTokenAccounting(token: any, campaign: any) {
  const [state, balance, contributed, released, refunded] = await Promise.all([
    campaign.state(),
    token.balanceOf(campaign.address),
    campaign.totalContributed(),
    campaign.totalReleased(),
    campaign.totalRefunded(),
  ]);

  assert.ok(contributed.lte(await campaign.goal()));
  if (Number(state) === 2) {
    const [snapshot, remaining] = await Promise.all([
      campaign.refundPoolSnapshot(),
      campaign.refundPoolRemaining(),
    ]);
    assert.equal(refunded.add(remaining).toString(), snapshot.toString());
    assert.equal(balance.toString(), remaining.toString());
  } else {
    assert.equal(balance.add(released).add(refunded).toString(), contributed.toString());
  }
}

function evidence(label: string) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(label));
}

describe("CampaignV2 security invariants", function () {
  it("hard-caps funding and leaves excess in the final backer's wallet", async function () {
    const { deployer, backerA, backerB, token, campaign, goal } = await deployV2();

    await fund(token, campaign, deployer, backerA, "80");
    const requested = ethers.utils.parseEther("50");
    await token.connect(deployer).mint(backerB.address, requested);
    await token.connect(backerB).approve(campaign.address, requested);

    const tx = await campaign.connect(backerB).contribute(requested);
    const receipt = await tx.wait();
    const contributed = receipt.events?.find((event: any) => event.event === "Contributed");

    assert.equal((await campaign.totalContributed()).toString(), goal.toString());
    assert.equal((await token.balanceOf(campaign.address)).toString(), goal.toString());
    assert.equal((await token.balanceOf(backerB.address)).toString(), ethers.utils.parseEther("30").toString());
    assert.equal(contributed?.args?.requestedAmount.toString(), requested.toString());
    assert.equal(contributed?.args?.acceptedAmount.toString(), ethers.utils.parseEther("20").toString());
    assert.equal((await campaign.remainingToGoal()).toString(), "0");
    assert.equal((await campaign.state()).toString(), "1"); // Milestones

    await assert.rejects(
      campaign.connect(backerA).contribute(1),
      /InvalidState/,
    );
  });

  it("refunds an underfunded campaign after the immutable deadline without reviving funding", async function () {
    const { deployer, backerA, token, campaign } = await deployV2({ duration: 60 });
    const contribution = await fund(token, campaign, deployer, backerA, "60");

    await advance(61);
    await campaign.connect(backerA).refund();

    assert.equal((await campaign.state()).toString(), "2"); // Refunds
    assert.equal((await campaign.totalContributed()).toString(), contribution.toString());
    assert.equal((await campaign.totalRefunded()).toString(), contribution.toString());
    assert.equal((await token.balanceOf(backerA.address)).toString(), contribution.toString());
    assert.equal((await token.balanceOf(campaign.address)).toString(), "0");

    await assert.rejects(
      campaign.connect(backerA).contribute(1),
      /InvalidState/,
    );
    await assert.rejects(
      campaign.connect(backerA).refund(),
      /AlreadyRefunded/,
    );
  });

  it("enforces sequential evidence gates and permissionless release only after review", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");

    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://evidence-1", evidence("m1"));
    await assert.rejects(
      campaign.connect(creator).submitMilestoneEvidence(1, "ipfs://evidence-2", evidence("m2")),
      /MilestoneOutOfOrder/,
    );
    await assert.rejects(
      campaign.connect(outsider).finalizeMilestone(0),
      /ReviewActive/,
    );

    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);

    assert.equal((await campaign.nextMilestone()).toString(), "1");
    assert.equal((await campaign.totalReleased()).toString(), ethers.utils.parseEther("40").toString());
    assert.equal((await token.balanceOf(creator.address)).toString(), ethers.utils.parseEther("40").toString());

    await campaign.connect(creator).submitMilestoneEvidence(1, "ipfs://evidence-2", evidence("m2"));
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(1);

    assert.equal((await campaign.state()).toString(), "3"); // Complete
    assert.equal((await campaign.totalReleased()).toString(), ethers.utils.parseEther("100").toString());
    assert.equal((await token.balanceOf(campaign.address)).toString(), "0");
  });

  it("keeps the full review window open, then routes a threshold challenge to arbitration", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");

    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://evidence-1", evidence("challenge"));
    await campaign.connect(backerB).voteMilestone(0, 2); // Challenge

    const beforeReviewEnds = await campaign.milestones(0);
    assert.equal(beforeReviewEnds.status.toString(), "1"); // Review, not prematurely disputed
    assert.equal(beforeReviewEnds.challengeWeight.toString(), ethers.utils.parseEther("10").toString());

    await campaign.connect(backerA).voteMilestone(0, 1); // Approve still possible during full window
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);

    const disputed = await campaign.milestones(0);
    assert.equal(disputed.status.toString(), "2");
    assert.ok(disputed.disputeDeadline.gt(0));

    await assert.rejects(
      campaign.connect(outsider).resolveDispute(0, true),
      /NotArbitrator/,
    );

    await campaign.connect(arbitrator).resolveDispute(0, true);
    assert.equal((await campaign.nextMilestone()).toString(), "1");
    assert.equal((await token.balanceOf(creator.address)).toString(), ethers.utils.parseEther("40").toString());
  });

  it("turns a rejected later milestone into pro-rata refunds of all unreleased escrow", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "33");
    await fund(token, campaign, deployer, backerB, "67");

    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://evidence-1", evidence("release-first"));
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);
    assert.equal((await token.balanceOf(campaign.address)).toString(), ethers.utils.parseEther("60").toString());

    await campaign.connect(creator).submitMilestoneEvidence(1, "ipfs://evidence-2", evidence("reject-second"));
    await campaign.connect(backerA).voteMilestone(1, 2); // 33% challenge
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(1);
    await campaign.connect(arbitrator).resolveDispute(1, false);

    assert.equal((await campaign.state()).toString(), "2");
    assert.equal((await campaign.refundPoolSnapshot()).toString(), ethers.utils.parseEther("60").toString());

    await campaign.connect(backerA).refund();
    await campaign.connect(backerB).refund();

    assert.equal((await token.balanceOf(backerA.address)).toString(), ethers.utils.parseEther("19.8").toString());
    assert.equal((await token.balanceOf(backerB.address)).toString(), ethers.utils.parseEther("40.2").toString());
    assert.equal((await campaign.refundPoolRemaining()).toString(), "0");
    assert.equal((await token.balanceOf(campaign.address)).toString(), "0");
  });

  it("fails safe to refunds when arbitration times out", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");

    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://evidence-timeout", evidence("timeout"));
    await campaign.connect(backerB).voteMilestone(0, 2);
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);

    await advance(14 * DAY + 1);
    await campaign.connect(outsider).expireDispute(0);

    assert.equal((await campaign.state()).toString(), "2");
    assert.equal((await campaign.refundPoolSnapshot()).toString(), ethers.utils.parseEther("100").toString());
  });

  it("fails safe to refunds when a funded creator never submits the next milestone", async function () {
    const { deployer, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");

    await advance(30 * DAY + 1);
    await campaign.connect(outsider).cancelForMissingMilestone();

    assert.equal((await campaign.state()).toString(), "2");
    assert.equal((await campaign.refundPoolSnapshot()).toString(), ethers.utils.parseEther("100").toString());
  });

  it("allows only contributors to vote and prevents repeat voting", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");
    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://evidence-vote", evidence("vote"));

    await assert.rejects(
      campaign.connect(outsider).voteMilestone(0, 2),
      /NotContributor/,
    );

    await campaign.connect(backerA).voteMilestone(0, 1);
    await assert.rejects(
      campaign.connect(backerA).voteMilestone(0, 2),
      /AlreadyVoted/,
    );
  });

  it("keeps V1 and V2 explicitly separate and rejects invalid V2 milestone totals", async function () {
    const [deployer, creator, arbitrator] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockTES");
    const token = await tokenFactory.deploy(deployer.address);
    await token.deployed();
    const factoryFactory = await ethers.getContractFactory("CampaignFactoryV2");
    const factory = await factoryFactory.deploy(token.address, arbitrator.address);
    await factory.deployed();

    assert.equal(await factory.CONTRACT_VERSION(), "2.0.0-alpha");

    await assert.rejects(
      factory.connect(creator).createCampaign(
        "Invalid total",
        ethers.utils.parseEther("100"),
        DAY,
        ["Only milestone"],
        [ethers.utils.parseEther("99")],
      ),
      /InvalidMilestones/,
    );
  });

  it("rejects code-less factory tokens and exposes identity on each deployed campaign", async function () {
    const [deployer, creator, arbitrator] = await ethers.getSigners();
    const factoryFactory = await ethers.getContractFactory("CampaignFactoryV2");
    await assert.rejects(
      factoryFactory.deploy(deployer.address, arbitrator.address),
      /TokenHasNoCode/,
    );

    const { campaign, factory } = await deployV2();
    assert.equal(await factory.CONTRACT_VERSION(), "2.0.0-alpha");
    assert.equal(await campaign.CONTRACT_VERSION(), "2.0.0-alpha");
    assert.equal(await campaign.owner(), creator.address);
  });

  it("preserves the exact cap across many backers and arbitrary contribution ordering", async function () {
    const signers = await ethers.getSigners();
    const { deployer, token, campaign, goal } = await deployV2({
      goal: "100",
      milestoneAmounts: ["100"],
    });
    const backers = signers.slice(3, 9);
    const requests = ["13", "7", "26", "9", "25", "50"];

    for (let index = 0; index < backers.length; index += 1) {
      const requested = ethers.utils.parseEther(requests[index]);
      await token.connect(deployer).mint(backers[index].address, requested);
      await token.connect(backers[index]).approve(campaign.address, requested);
      await campaign.connect(backers[index]).contribute(requested);
      assert.ok((await campaign.totalContributed()).lte(goal));
      await assertStandardTokenAccounting(token, campaign);
    }

    assert.equal((await campaign.totalContributed()).toString(), goal.toString());
    assert.equal((await campaign.uniqueBackerCount()).toString(), backers.length.toString());
    assert.equal(
      (await token.balanceOf(backers[backers.length - 1].address)).toString(),
      ethers.utils.parseEther("30").toString(),
    );
  });

  it("conserves a refund pool exactly despite integer rounding and claim order", async function () {
    const signers = await ethers.getSigners();
    const { deployer, creator, arbitrator, outsider, token, campaign } = await deployV2({
      goalUnits: "7",
      milestoneAmountUnits: ["2", "5"],
    });
    const [backerA, backerB, backerC] = signers.slice(3, 6);
    await fundUnits(token, campaign, deployer, backerA, 2);
    await fundUnits(token, campaign, deployer, backerB, 2);
    await fundUnits(token, campaign, deployer, backerC, 3);

    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://rounding-1", evidence("rounding-1"));
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);
    await campaign.connect(creator).submitMilestoneEvidence(1, "ipfs://rounding-2", evidence("rounding-2"));
    await campaign.connect(backerA).voteMilestone(1, 2);
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(1);
    await campaign.connect(arbitrator).resolveDispute(1, false);

    await campaign.connect(backerC).refund();
    await assertStandardTokenAccounting(token, campaign);
    await campaign.connect(backerA).refund();
    await assertStandardTokenAccounting(token, campaign);
    await campaign.connect(backerB).refund();
    await assertStandardTokenAccounting(token, campaign);

    assert.equal((await campaign.totalRefunded()).toString(), "5");
    assert.equal((await campaign.refundPoolRemaining()).toString(), "0");
    assert.equal((await token.balanceOf(campaign.address)).toString(), "0");
  });

  it("rejects expired-window and unexpected-role calls, then preserves timeout recovery", async function () {
    const { deployer, creator, arbitrator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "90");
    await fund(token, campaign, deployer, backerB, "10");

    await assert.rejects(
      campaign.connect(outsider).submitMilestoneEvidence(0, "ipfs://forged", evidence("forged")),
      /OwnableUnauthorizedAccount/,
    );
    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://window", evidence("window"));
    await campaign.connect(backerB).voteMilestone(0, 2);
    await advance(7 * DAY + 1);
    await assert.rejects(campaign.connect(backerA).voteMilestone(0, 1), /ReviewEnded/);
    await campaign.connect(outsider).finalizeMilestone(0);
    await assert.rejects(campaign.connect(creator).resolveDispute(0, true), /NotArbitrator/);

    await advance(14 * DAY + 1);
    await assert.rejects(campaign.connect(arbitrator).resolveDispute(0, true), /ArbitrationExpired/);
    await campaign.connect(outsider).expireDispute(0);
    await assert.rejects(campaign.connect(outsider).expireDispute(0), /InvalidState/);
    await assertStandardTokenAccounting(token, campaign);
  });

  it("fails safe when the creator misses a later milestone submission window", async function () {
    const { deployer, creator, backerA, backerB, outsider, token, campaign } = await deployV2();
    await fund(token, campaign, deployer, backerA, "50");
    await fund(token, campaign, deployer, backerB, "50");
    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://released", evidence("released"));
    await advance(7 * DAY + 1);
    await campaign.connect(outsider).finalizeMilestone(0);
    await advance(30 * DAY + 1);

    await assert.rejects(
      campaign.connect(creator).submitMilestoneEvidence(1, "ipfs://late", evidence("late")),
      /MilestoneSubmissionExpired/,
    );
    await campaign.connect(outsider).cancelForMissingMilestone();
    assert.equal((await campaign.refundPoolSnapshot()).toString(), ethers.utils.parseEther("60").toString());
    await assertStandardTokenAccounting(token, campaign);
  });

  it("rejects both inbound and outbound directional token-accounting mismatches", async function () {
    const [deployer, creator, arbitrator, backer, outsider] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockDirectionalFeeToken");
    const token = await tokenFactory.deploy();
    await token.deployed();
    const factoryFactory = await ethers.getContractFactory("CampaignFactoryV2");
    const factory = await factoryFactory.deploy(token.address, arbitrator.address);
    await factory.deployed();
    const goal = ethers.utils.parseEther("10");
    const create = await factory.connect(creator).createCampaign(
      "Directional fee rejection",
      goal,
      DAY,
      ["Only milestone"],
      [goal],
    );
    const receipt = await create.wait();
    const campaignAddress = receipt.events?.find((event: any) => event.event === "CampaignV2Created")?.args?.campaign;
    const campaign = await ethers.getContractAt("CampaignV2", campaignAddress);

    await token.mint(backer.address, goal);
    await token.connect(backer).approve(campaign.address, goal);
    await token.setFeeSender(backer.address, true);
    await assert.rejects(campaign.connect(backer).contribute(goal), /TokenAccountingMismatch/);
    assert.equal((await campaign.totalContributed()).toString(), "0");
    assert.equal((await token.balanceOf(campaign.address)).toString(), "0");

    await token.setFeeSender(backer.address, false);
    await campaign.connect(backer).contribute(goal);
    await campaign.connect(creator).submitMilestoneEvidence(0, "ipfs://outbound", evidence("outbound"));
    await advance(7 * DAY + 1);
    await token.setFeeSender(campaign.address, true);
    await assert.rejects(campaign.connect(outsider).finalizeMilestone(0), /TokenAccountingMismatch/);
    assert.equal((await campaign.state()).toString(), "1");
    assert.equal((await campaign.totalReleased()).toString(), "0");
    assert.equal((await token.balanceOf(campaign.address)).toString(), goal.toString());
    assert.equal((await token.balanceOf(creator.address)).toString(), "0");
  });
});
