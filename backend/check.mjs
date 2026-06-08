import os from "node:os";
import path from "node:path";

const tempDb = path.join(os.tmpdir(), `tesla-crowdfund-backend-check-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = tempDb;

const {
  createSubmission,
  issueNonce,
  readStore,
  updateSubmissionStatus,
} = await import("./store.mjs");

const nonce = issueNonce("0x0000000000000000000000000000000000000001");
if (!nonce.nonce || !nonce.message.includes(nonce.nonce)) {
  throw new Error("nonce check failed");
}

const created = createSubmission({
  creatorAddress: "0x0000000000000000000000000000000000000001",
  title: "Backend foundation check",
  shortDescription: "Check submission",
  contractInput: {
    description: "Check submission",
    goal: "1000000000000000000",
    duration: "86400",
    milestoneDescriptions: ["first"],
    milestoneAmounts: ["1000000000000000000"],
  },
});

const pending = updateSubmissionStatus(created.id, "pending_review", {});
const approved = updateSubmissionStatus(created.id, "approved", {
  review: {
    decision: "approved",
    note: "check",
    reviewedAt: new Date().toISOString(),
  },
});

const store = readStore();
if (store.submissions.length !== 1) throw new Error("submission was not persisted");
if (pending.status !== "pending_review") throw new Error("pending status failed");
if (approved.status !== "approved") throw new Error("approved status failed");
if (store.auditLog.length < 3) throw new Error("audit log was not written");

console.log("backend:check passed");
