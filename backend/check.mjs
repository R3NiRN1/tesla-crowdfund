import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDb = path.join(os.tmpdir(), `tesla-crowdfund-backend-check-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = tempDb;

const {
  createSubmission,
  issueNonce,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} = await import("./store.mjs");
const { READINESS, validateSubmission } = await import("./validation.mjs");

const validPayload = {
  creatorAddress: "0x1111111111111111111111111111111111111111",
  title: "Community Tesla charger buildout",
  shortDescription: "Funding a community-owned charging site for a regional Tesla club.",
  metadataURI: "ipfs://bafybeigdyrztcommunitymetadata",
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
  const nonce = issueNonce(validPayload.creatorAddress);
  assert.ok(nonce.nonce);
  assert.ok(nonce.message.includes(nonce.nonce));

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
  assert.deepEqual(repaired.readiness.reasons, []);

  const pending = updateSubmissionStatus(invalid.id, "pending_review", {
    submittedAt: new Date().toISOString(),
  });
  assert.equal(pending.status, "pending_review");
  expectCode(() => updateSubmission(invalid.id, { title: "Locked" }), "submission-locked");

  const approved = updateSubmissionStatus(invalid.id, "approved", {
    review: { decision: "approved", reviewedAt: new Date().toISOString() },
  });
  assert.equal(approved.status, "approved");
  expectCode(
    () => updateSubmissionStatus(invalid.id, "rejected"),
    "invalid-status-transition",
  );

  const published = updateSubmissionStatus(invalid.id, "published", {
    publish: { transactionHash: "0xabc", publishedAt: new Date().toISOString() },
  });
  assert.equal(published.status, "published");

  const badTotals = validateSubmission({
    ...validPayload,
    contractInput: {
      ...validPayload.contractInput,
      milestoneAmounts: ["1", "2", "3"],
    },
  });
  assert.equal(badTotals.state, READINESS.INCOMPLETE);
  assert.ok(badTotals.reasons.some((reason) => reason.includes("add up exactly")));

  const store = readStore();
  assert.equal(store.submissions.length, 1);
  assert.ok(store.auditLog.length >= 6);
  console.log("backend:check passed");
} finally {
  fs.rmSync(tempDb, { force: true });
  fs.rmSync(`${tempDb}.tmp`, { force: true });
}
