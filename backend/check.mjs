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
  issueNonce,
  listPublishedCampaigns,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} = await import("./store.mjs");
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

function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

try {
  expectCode(
    () => issueNonce("0x0000000000000000000000000000000000000000"),
    "invalid-wallet-address",
  );
  const wallet = ethers.Wallet.createRandom();
  const nonce = issueNonce(wallet.address);
  assert.ok(nonce.nonce);
  assert.ok(nonce.message.includes(nonce.nonce));
  assert.ok(nonce.message.includes(wallet.address.toLowerCase()));
  assert.ok(Date.parse(nonce.expiresAt) > Date.now());

  const wrongWallet = ethers.Wallet.createRandom();
  const wrongSignature = await wrongWallet.signMessage(nonce.message);
  expectCode(
    () => verifyWalletSignature(wallet.address, nonce.nonce, wrongSignature),
    "wallet-address-mismatch",
  );

  const signature = await wallet.signMessage(nonce.message);
  const authenticated = verifyWalletSignature(wallet.address, nonce.nonce, signature);
  assert.equal(authenticated.authenticated, true);
  assert.equal(authenticated.address, wallet.address.toLowerCase());
  expectCode(
    () => verifyWalletSignature(wallet.address, nonce.nonce, signature),
    "invalid-nonce",
  );

  const superseded = issueNonce(wallet.address);
  const active = issueNonce(wallet.address);
  const supersededSignature = await wallet.signMessage(superseded.message);
  expectCode(
    () => verifyWalletSignature(wallet.address, superseded.nonce, supersededSignature),
    "invalid-nonce",
  );
  const activeSignature = await wallet.signMessage(active.message);
  assert.equal(verifyWalletSignature(wallet.address, active.nonce, activeSignature).authenticated, true);

  expectCode(
    () => getBackendConfig({ NODE_ENV: "production", ADMIN_TOKEN: "short", CORS_ORIGIN: "*" }),
    "production-admin-token-required",
  );
  expectCode(
    () => getBackendConfig({ NODE_ENV: "production", ADMIN_TOKEN: "a".repeat(24), CORS_ORIGIN: "*" }),
    "production-cors-origin-required",
  );
  expectCode(
    () => getBackendConfig({ NODE_ENV: "development", CORS_ORIGIN: "https://app.example/path" }),
    "invalid-cors-origin",
  );
  const productionConfig = getBackendConfig({
    NODE_ENV: "production",
    ADMIN_TOKEN: "a".repeat(24),
    CORS_ORIGIN: "https://app.example",
    BACKEND_PORT: "8787",
  });
  assert.equal(productionConfig.production, true);
  assert.equal(productionConfig.corsOrigin, "https://app.example");

  const invalid = createSubmission({ title: "Draft" });
  assert.equal(invalid.status, "draft");
  assert.equal(invalid.readiness.state, READINESS.INCOMPLETE);
  assert.ok(Array.isArray(invalid.readiness.reasons));
  assert.ok(invalid.readiness.reasons.length > 0);
  assert.ok(!Number.isNaN(Date.parse(invalid.readiness.checkedAt)));
  expectCode(
    () => updateSubmissionStatus(invalid.id, "pending_review"),
    "submission-not-contract-ready",
  );

  const repaired = updateSubmission(invalid.id, validPayload);
  assert.equal(repaired.readiness.state, READINESS.CONTRACT_READY);
  assert.equal(repaired.imageUrl, validPayload.media[0].uri);
  assert.deepEqual(repaired.readiness.reasons, []);

  const metadata = buildSubmissionMetadata(invalid.id);
  assert.equal(metadata.schema, "tes-crowdfund-campaign/v1");
  assert.equal(metadata.image, validPayload.media[0].uri);
  assert.equal(metadata.media.length, 1);

  const pending = updateSubmissionStatus(invalid.id, "pending_review", {
    submittedAt: new Date().toISOString(),
  });
  assert.equal(pending.status, "pending_review");
  expectCode(() => updateSubmission(invalid.id, { title: "Locked" }), "submission-locked");

  const changesRequested = updateSubmissionStatus(invalid.id, "needs_changes", {
    review: {
      decision: "needs_changes",
      note: "Clarify the delivery plan.",
      reviewerAddress: validPayload.creatorAddress,
      reviewedAt: new Date().toISOString(),
    },
    verification: { state: "unverified" },
  });
  assert.equal(changesRequested.status, "needs_changes");

  const revised = updateSubmission(invalid.id, {
    shortDescription: "Funding a community-owned charging site with a clarified regional delivery plan.",
  });
  assert.equal(revised.status, "needs_changes");

  updateSubmissionStatus(invalid.id, "pending_review", { review: null });
  expectCode(
    () => updateSubmissionStatus(invalid.id, "approved", { verification: { state: "unverified" } }),
    "manual-verification-required",
  );

  const approved = updateSubmissionStatus(invalid.id, "approved", {
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
  expectCode(
    () => updateSubmissionStatus(invalid.id, "rejected"),
    "invalid-status-transition",
  );

  const published = updateSubmissionStatus(invalid.id, "published", {
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

  expectCode(
    () => addCampaignUpdate(invalid.id, {
      title: "Wrong author",
      body: "This should not be accepted.",
      publisherAddress: "0x2222222222222222222222222222222222222222",
    }),
    "creator-address-mismatch",
  );
  const campaignUpdate = addCampaignUpdate(invalid.id, {
    title: "Site lease signed",
    body: "The lease is signed and electrical planning is underway.",
    milestoneIndex: 0,
    publisherAddress: validPayload.creatorAddress,
  });
  assert.equal(campaignUpdate.milestoneIndex, 0);

  const hiddenDraft = createSubmission({ title: "Hidden draft", media: [null] });
  assert.ok(hiddenDraft.readiness.reasons.some((reason) => reason.includes("media[0]")));
  const publicCampaigns = listPublishedCampaigns();
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

  const store = readStore();
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
