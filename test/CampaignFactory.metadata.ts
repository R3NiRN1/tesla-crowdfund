import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther, parseEventLogs } from "viem";

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer, creator] = await viem.getWalletClients();

async function send(transaction: Promise<`0x${string}`>) {
  const hash = await transaction;
  return publicClient.waitForTransactionReceipt({ hash });
}

describe("CampaignFactory metadata path", function () {
  it("deploys a creator-owned campaign and emits its metadata URI", async function () {
    const token = await viem.deployContract("MockTES", [deployer.account.address]);
    const factory = await viem.deployContract("CampaignFactory", [token.address]);

    const goal = parseEther("100");
    const metadataURI = "ipfs://bafybeigdyrztcampaignmetadata";
    const receipt = await send(factory.write.createCampaignWithMetadata([
      "Community charging site",
      metadataURI,
      goal,
      BigInt(7 * 24 * 60 * 60),
      ["Lease", "Installation"],
      [parseEther("40"), parseEther("60")],
    ], { account: creator.account }));
    const [metadataEvent] = parseEventLogs({
      abi: factory.abi,
      logs: receipt.logs,
      eventName: "CampaignCreatedWithMetadata",
    });

    assert.ok(metadataEvent?.args);
    assert.equal(metadataEvent.args.owner.toLowerCase(), creator.account.address.toLowerCase());
    assert.equal(metadataEvent.args.metadataURI, metadataURI);
    assert.equal(await factory.read.campaignCount(), 1n);

    const campaign = await viem.getContractAt("Campaign", metadataEvent.args.campaign);
    assert.equal((await campaign.read.owner()).toLowerCase(), creator.account.address.toLowerCase());
    assert.equal(await campaign.read.description(), "Community charging site");
    assert.equal(await campaign.read.goal(), goal);
    assert.equal(await campaign.read.milestoneCount(), 2n);
  });

  it("rejects metadata-path campaigns whose milestones do not equal the goal", async function () {
    const token = await viem.deployContract("MockTES", [deployer.account.address]);
    const factory = await viem.deployContract("CampaignFactory", [token.address]);

    await assert.rejects(
      factory.write.createCampaignWithMetadata([
        "Invalid milestone total",
        "ipfs://bafybeigdyrztinvalidmetadata",
        parseEther("100"),
        3600n,
        ["Only milestone"],
        [parseEther("90")],
      ], { account: creator.account }),
      /milestones!=goal/,
    );
  });
});
