import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ethersPackage from "ethers";

const tempDb = path.join(os.tmpdir(), `tesla-crowdfund-backend-check-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = tempDb;

const {
  addCampaignUpdate,
  buildSubmissionMetadata,
  createSubmission,
  listPublishedCampaigns,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} = await import("./store.mjs");
const { issueWalletChallenge } = await import("./challenges.mjs");
const { READINESS, validateSubmission } = await import("./validation.mjs");
const { verifyWalletSignature } = await import("./auth.mjs");
const { getBackendConfig } = await import("./config.mjs");
const {
  BACKUP_SCHEMA,
  buildBackupPayload,
  unpackBackupPayload,
  validateStoreSnapshot,
} = await import("./persistence.mjs");
const { ethers } = ethersPackage;

const validPayload = {
  creatorAddress: "0x1111111111111111111111111111111111111111",
  title: "Community Tesla charger buildout",
  shortDescription: "Funding a community-owned charging site for a regional Tesla club.",
  metadataURI: "ipfs://bafybeigdyrztcommunitymetadata",
  media: [
    {
      id: "primary-image",
      kind: "image",
      uri: "ipfs://bafybeigdyrztcommunityimage",
      label: "Campaign rendering",
      altText: "Rendering of the proposed community charging site",
      primary: true,
    },
  ],
  contractInput: {
    description: "Funding a community-owned charging site with clear milestones and TeslaCoin payouts.",
    goal: "300000000000000000000",
    duration: "2592000",
    milestoneDescriptions: ["Site lease", "Electrical work", "Charger installation"],
    milestoneAmounts: ["100000000000000000000", "120000000000000000000", "80000000000000000000"],
  },
};

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

try {
  await expectCode(
    issueWalletChallenge("0x0000000000000000000000000000000000000000"),
    "invalid-wallet-address",
  );
  const wallet = ethers.Wallet.createRandom();
  const nonce = await issueWalletChallenge(wallet.address);
  assert.ok(nonce.nonce);
  assert.ok(nonce.message.includes(nonce.nonce));
  assert.ok(nonce.message.includes(wallet.address.toLowerCase()));
  assert.ok(Date.parse(nonce.expiresAt) > Date.now());

  const wrongWallet = ethers.Wallet.createRandom();
  const wrongSignature = await wrongWallet.signMessage(nonce.message);
  await expectCode(
    verifyWalletSignature(wallet.address, nonce.nonce, wrongSignature),
    "wallet-address-mismatch",
  );

  const signature = await wallet.signMessage(nonce.message);
  const authenticated = await verifyWalletSignature(wallet.address, nonce.nonce, signature);
  assert.equal(authenticated.authenticated, true);
  assert.equal(authenticated.address, wallet.address.toLowerCase());
  await expectCode(
    verifyWalletSignature(wallet.address, nonce.nonce, signature),
    "invalid-nonce",
  );

  const superseded = await issueWalletChallenge(wallet.address);
  const active = await issueWalletChallenge(wallet.address);
  const supersededSignature = await wallet.signMessage(superseded.message);
  assert.equal((await verifyWalletSignature(wallet.address, superseded.nonce, supersededSignature)).authenticated, true);
  const activeSignature = await wallet.signMessage(active.message);
  assert.equal((await verifyWalletSignature(wallet.address, active.nonce, activeSignature)).authenticated, true);

  assert.throws(
    () => getBackendConfig({ NODE_ENV: "production", STORAGE_DRIVER: "file", CORS_ORIGIN: "https://app.example" }),
    (error) => error.code === "production-durable-storage-required",
  );
  assert.throws(
    () => getBackendConfig({ NODE_ENV: "production", STORAGE_DRIVER: "postgres", CORS_ORIGIN: "*" }),
    (error) => error.code === "database-url-required",
  );
  assert.throws(
    () => getBackendConfig({ NODE_ENV: "development", CORS_ORIGIN: "https://app.example/path" }),
    (error) => error.code === "invalid-cors-origin",
  );
  const productionConfig = getBackendConfig({
    NODE_ENV: "production",
    STORAGE_DRIVER: "postgres",
    DATABASE_URL: "postgresql://example.invalid/backend",
    CORS_ORIGIN: "https://app.example",
    BACKEND_PORT: "8787",
  });
  assert.equal(productionConfig.production, true);
  assert.equal(productionConfig.corsOrigin, "https://app.example");

  const invalid = await createSubmission({ title: "Draft" });
  assert.equal(invalid.status, "draft");
  assert.equal(invalid.readiness.state, READINESS.INCOMPLETE);
  assert.ok(Array.isArray(invalid.readiness.reasons));
  assert.ok(invalid.readiness.reasons.length > 0);
  assert.ok(!Number.isNaN(Date.parse(invalid.readiness.checkedAt)));
  await expectCode(
    updateSubmissionStatus(invalid.id, "pending_review"),
    "submission-not-contract-ready",
  );

  const repaired = await updateSubmission(invalid.id, validPayload);
  assert.equal(repaired.readiness.state, READINESS.CONTRACT_READY);
  assert.equal(repaired.imageUrl, validPayload.media[0].uri);
  assert.deepEqual(repaired.readiness.reasons, []);

  const metadata = await buildSubmissionMetadata(invalid.id);
  assert.equal(metadata.schema, "tes-crowdfund-campaign/v1");
  assert.equal(metadata.image, validPayload.media[0].uri);
  assert.equal(metadata.media.length, 1);

  const pending = await updateSubmissionStatus(invalid.id, "pending_review", {
    submittedAt: new Date().toISOString(),
  });
  assert.equal(pending.status, "pending_review");
  await expectCode(updateSubmission(invalid.id, { title: "Locked" }), "submission-locked");

  const changesRequested = await updateSubmissionStatus(invalid.id, "needs_changes", {
    review: {
      decision: "needs_changes",
      note: "Clarify the delivery plan.",
      reviewerAddress: validPayload.creatorAddress,
      reviewedAt: new Date().toISOString(),
    },
    verification: { state: "unverified" },
  });
  assert.equal(changesRequested.status, "needs_changes");

  const revised = await updateSubmission(invalid.id, {
    shortDescription: "Funding a community-owned charging site with a clarified regional delivery plan.",
  });
  assert.equal(revised.status, "needs_changes");

  await updateSubmissionStatus(invalid.id, "pending_review", { review: null });
  await expectCode(
    updateSubmissionStatus(invalid.id, "approved", { verification: { state: "unverified" } }),
    "manual-verification-required",
  );

  const approved = await updateSubmissionStatus(invalid.id, "approved", {
    review: {
      decision: "approved",
      reviewerAddress: validPayload.creatorAddress,
      reviewedAt: new Date().toISOString(),
    },
    verification: {
      state: "manually_verified",
      reviewerAddress: validPayload.creatorAddress,
      verifiedAt: new Date().toISOString(),
    },
  });
  assert.equal(approved.status, "approved");
  await expectCode(
    updateSubmissionStatus(invalid.id, "rejected"),
    "invalid-status-transition",
  );

  const published = await updateSubmissionStatus(invalid.id, "published", {
    publish: {
      transactionHash: `0x${"a".repeat(64)}`,
      campaignAddress: "0x3333333333333333333333333333333333333333",
      factoryAddress: "0x4444444444444444444444444444444444444444",
      chainId: 97,
      metadataURI: validPayload.metadataURI,
      publisherAddress: validPayload.creatorAddress,
      publishedAt: new Date().toISOString(),
    },
  });
  assert.equal(published.status, "published");
  assert.equal(published.publish.metadataURI, validPayload.metadataURI);

  await expectCode(
    addCampaignUpdate(invalid.id, {
      title: "Wrong author",
      body: "This should not be accepted.",
      publisherAddress: "0x2222222222222222222222222222222222222222",
    }),
    "creator-address-mismatch",
  );
  const campaignUpdate = await addCampaignUpdate(invalid.id, {
    title: "Site lease signed",
    body: "The lease is signed and electrical planning is underway.",
    milestoneIndex: 0,
    publisherAddress: validPayload.creatorAddress,
  });
  assert.equal(campaignUpdate.milestoneIndex, 0);

  const hiddenDraft = await createSubmission({ title: "Hidden draft", media: [null] });
  assert.ok(hiddenDraft.readiness.reasons.some((reason) => reason.includes("media[0]")));
  const publicCampaigns = await listPublishedCampaigns();
  assert.equal(publicCampaigns.length, 1);
  assert.equal(publicCampaigns[0].status, "published");
  assert.equal(publicCampaigns[0].title, validPayload.title);
  assert.equal(publicCampaigns[0].creatorVerification, "manually_verified");
  assert.equal(publicCampaigns[0].campaignAddress, published.publish.campaignAddress);
  assert.equal(publicCampaigns[0].milestones.length, 3);
  assert.equal(publicCampaigns[0].media[0].uri, validPayload.media[0].uri);
  assert.ok(publicCampaigns[0].timeline.some((item) => item.type === "platform_review"));
  assert.ok(publicCampaigns[0].timeline.some((item) => item.type === "contract_published"));
  assert.ok(publicCampaigns[0].timeline.some((item) => item.type === "campaign_update"));
  assert.equal(publicCampaigns[0].timeline.filter((item) => item.type === "milestone").length, 3);

  const badTotals = validateSubmission({
    ...validPayload,
    contractInput: {
      ...validPayload.contractInput,
      milestoneAmounts: ["1", "2", "3"],
    },
  });
  assert.equal(badTotals.state, READINESS.INCOMPLETE);
  assert.ok(badTotals.reasons.some((reason) => reason.includes("add up exactly")));

  const badMedia = validateSubmission({
    ...validPayload,
    media: [{ kind: "video", uri: "file:///private/video.mp4", primary: true }],
  });
  assert.equal(badMedia.state, READINESS.INCOMPLETE);
  assert.ok(badMedia.reasons.some((reason) => reason.includes("media[0].uri")));
  assert.ok(badMedia.reasons.some((reason) => reason.includes("primary")));

  const store = await readStore();
  assert.equal(store.submissions.length, 2);
  assert.ok(store.auditLog.length >= 10);

  const snapshot = validateStoreSnapshot(store);
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.summary.submissions, 2);
  assert.equal(snapshot.summary.published, 1);
  assert.equal(snapshot.summary.publishRecords, 1);
  assert.equal(snapshot.summary.mediaReferences, 2);

  const backup = buildBackupPayload(store, {
    sourceFile: tempDb,
    config: {
      nodeEnv: "test",
      backendDbConfigured: true,
      corsOrigin: "http://localhost:3000",
      adminTokenConfigured: false,
    },
  });
  assert.equal(backup.schema, BACKUP_SCHEMA);
  assert.equal(backup.summary.auditEvents, store.auditLog.length);
  assert.equal(backup.config.adminTokenConfigured, false);

  const restored = unpackBackupPayload(backup);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.store.submissions, store.submissions);
  assert.deepEqual(restored.store.auditLog, store.auditLog);
  console.log("backend:check passed");
} finally {
  fs.rmSync(tempDb, { force: true });
  fs.rmSync(`${tempDb}.tmp`, { force: true });
}
