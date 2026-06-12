import assert from "node:assert/strict";

import { ethers } from "hardhat";

describe("CampaignFactory metadata path", function () {
  it("deploys a creator-owned campaign and emits its metadata URI", async function () {
    const [deployer, creator] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockTES");
    const token = await tokenFactory.deploy(deployer.address);
    await token.deployed();

    const factoryFactory = await ethers.getContractFactory("CampaignFactory");
    const factory = await factoryFactory.deploy(token.address);
    await factory.deployed();

    const goal = ethers.utils.parseEther("100");
    const metadataURI = "ipfs://bafybeigdyrztcampaignmetadata";
    const transaction = await factory.connect(creator).createCampaignWithMetadata(
      "Community charging site",
      metadataURI,
      goal,
      7 * 24 * 60 * 60,
      ["Lease", "Installation"],
      [ethers.utils.parseEther("40"), ethers.utils.parseEther("60")],
    );
    const receipt = await transaction.wait();
    const metadataEvent = receipt.events?.find((event) => event.event === "CampaignCreatedWithMetadata");

    assert.ok(metadataEvent?.args);
    assert.equal(metadataEvent.args.owner, creator.address);
    assert.equal(metadataEvent.args.metadataURI, metadataURI);
    assert.equal((await factory.campaignCount()).toString(), "1");

    const campaign = await ethers.getContractAt("Campaign", metadataEvent.args.campaign);
    assert.equal(await campaign.owner(), creator.address);
    assert.equal(await campaign.description(), "Community charging site");
    assert.equal((await campaign.goal()).toString(), goal.toString());
    assert.equal((await campaign.milestoneCount()).toString(), "2");
  });

  it("rejects metadata-path campaigns whose milestones do not equal the goal", async function () {
    const [deployer, creator] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("MockTES");
    const token = await tokenFactory.deploy(deployer.address);
    await token.deployed();
    const factoryFactory = await ethers.getContractFactory("CampaignFactory");
    const factory = await factoryFactory.deploy(token.address);
    await factory.deployed();

    await assert.rejects(
      factory.connect(creator).createCampaignWithMetadata(
        "Invalid milestone total",
        "ipfs://bafybeigdyrztinvalidmetadata",
        ethers.utils.parseEther("100"),
        3600,
        ["Only milestone"],
        [ethers.utils.parseEther("90")],
      ),
      /milestones!=goal/,
    );
  });
});
