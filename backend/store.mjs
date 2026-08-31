import { randomUUID } from "node:crypto";

import { READINESS, withReadiness } from "./validation.mjs";
import { getRepository } from "./repository.mjs";
const ALLOWED_TRANSITIONS = Object.freeze({
  draft: new Set(["pending_review"]),
  pending_review: new Set(["needs_changes", "approved", "rejected"]),
  needs_changes: new Set(["pending_review"]),
  approved: new Set(["published"]),
  rejected: new Set(),
  published: new Set(),
});

function backendError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function readStore() {
  return getRepository().read();
}

export async function writeStore(store) {
  return getRepository().transaction((current) => {
    Object.assign(current, structuredClone(store));
    return structuredClone(current);
  });
}

export function appendAudit(store, action, detail = {}, actor = { kind: "system", id: null }) {
  const entry = {
    id: randomUUID(),
    action,
    actor,
    detail,
    timestamp: new Date().toISOString(),
  };
  store.auditLog.unshift(entry);
  return entry;
}

function normalizeSubmission(payload, existing = {}) {
  const metadataURI = String(payload.metadataURI ?? payload.metadataUri ?? existing.metadataURI ?? "").trim();
  const mediaInput = payload.media ?? existing.media ?? [];
  const media = Array.isArray(mediaInput)
    ? mediaInput.map((value) => {
        const item = value && typeof value === "object" ? value : {};
        return {
          id: String(item.id || randomUUID()).trim(),
          kind: String(item.kind || "").trim(),
          uri: String(item.uri || "").trim(),
          label: String(item.label || "").trim(),
          altText: String(item.altText || "").trim(),
          primary: item.primary === true,
        };
      })
    : mediaInput;
  const primaryImage = Array.isArray(media) ? media.find((item) => item.primary === true && item.kind === "image") : null;
  return withReadiness({
    ...existing,
    creatorAddress: String(payload.creatorAddress ?? existing.creatorAddress ?? "").trim(),
    title: String(payload.title ?? existing.title ?? "").trim(),
    shortDescription: String(payload.shortDescription ?? existing.shortDescription ?? "").trim(),
    longDescription: String(payload.longDescription ?? existing.longDescription ?? "").trim(),
    imageUrl: primaryImage?.uri ?? String(payload.imageUrl ?? existing.imageUrl ?? "").trim(),
    media,
    metadataURI,
    contractInput: payload.contractInput ?? existing.contractInput ?? null,
  });
}

export async function buildSubmissionMetadata(id) {
  const submission = (await readStore()).submissions.find((item) => item.id === id);
  if (!submission) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const media = Array.isArray(submission.media) ? submission.media : [];
  const primaryImage = media.find((item) => item.primary === true && item.kind === "image") ?? null;
  return {
    schema: "tes-crowdfund-campaign/v1",
    submissionId: submission.id,
    name: submission.title,
    description: submission.longDescription || submission.shortDescription,
    shortDescription: submission.shortDescription,
    image: primaryImage?.uri ?? null,
    media: media.map(({ kind, uri, label, altText, primary }) => ({ kind, uri, label, altText, primary })),
    creator: submission.creatorAddress,
    campaign: {
      goal: submission.contractInput?.goal ?? null,
      duration: submission.contractInput?.duration ?? null,
      milestones: (submission.contractInput?.milestoneDescriptions ?? []).map((description, index) => ({
        description,
        amount: submission.contractInput?.milestoneAmounts?.[index] ?? null,
      })),
    },
  };
}

export async function createSubmission(payload = {}, actor) {
  return getRepository().transaction((store) => {
    const now = new Date().toISOString();
    const submission = normalizeSubmission(payload, {
      id: randomUUID(),
      status: "draft",
      review: null,
      publish: null,
      updates: [],
      createdAt: now,
      updatedAt: now,
    });
    store.submissions.unshift(submission);
    appendAudit(store, "submission.created", {
      submissionId: submission.id,
      title: submission.title,
      readiness: submission.readiness.state,
    }, actor);
    return structuredClone(submission);
  });
}

function publicCampaign(submission) {
  const publishedSeconds = BigInt(Math.floor(Date.parse(submission.publish.publishedAt) / 1000));
  const deadline = (publishedSeconds + BigInt(submission.contractInput.duration)).toString();
  const timeline = [];

  if (submission.verification?.state === "manually_verified") {
    timeline.push({
      id: `${submission.id}-platform-review`,
      type: "platform_review",
      source: "platform",
      title: "Manual platform review completed",
      detail: "Submitted campaign and creator details passed the alpha manual review. This is not production KYC.",
      timestamp: submission.verification.verifiedAt ?? submission.review?.reviewedAt ?? null,
      milestoneIndex: null,
    });
  }

  timeline.push({
    id: `${submission.id}-contract-published`,
    type: "contract_published",
    source: "chain",
    title: "Campaign contract published",
    detail: "The creator wallet published the approved campaign contract and the backend recorded its transaction.",
    timestamp: submission.publish.publishedAt,
    milestoneIndex: null,
  });

  for (const update of submission.updates ?? []) {
    timeline.push({
      id: update.id,
      type: "campaign_update",
      source: "creator",
      title: update.title,
      detail: update.body,
      timestamp: update.createdAt,
      milestoneIndex: update.milestoneIndex,
    });
  }

  submission.contractInput.milestoneDescriptions.forEach((description, index) => {
    timeline.push({
      id: `${submission.id}-milestone-${index}`,
      type: "milestone",
      source: "chain",
      title: description,
      detail: "Planned campaign milestone. Claim status is read from the campaign contract.",
      timestamp: null,
      milestoneIndex: index,
    });
  });

  return {
    id: submission.id,
    title: submission.title,
    shortDescription: submission.shortDescription,
    creatorAddress: submission.creatorAddress,
    creatorVerification: submission.verification?.state ?? "unverified",
    media: Array.isArray(submission.media) ? submission.media : [],
    status: "published",
    goal: submission.contractInput.goal,
    deadline,
    milestones: submission.contractInput.milestoneDescriptions.map((description, index) => ({
      description,
      amount: submission.contractInput.milestoneAmounts[index],
    })),
    campaignAddress: submission.publish.campaignAddress,
    transactionHash: submission.publish.transactionHash,
    factoryAddress: submission.publish.factoryAddress,
    chainId: submission.publish.chainId,
    metadataURI: submission.publish.metadataURI,
    publishedAt: submission.publish.publishedAt,
    timeline,
  };
}

export async function listPublishedCampaigns() {
  return (await readStore()).submissions
    .filter((submission) => submission.status === "published" && submission.publish)
    .map(publicCampaign);
}

export async function addCampaignUpdate(id, payload = {}, actor) {
  return getRepository().transaction((store) => {
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const submission = store.submissions[index];
  if (submission.status !== "published" || !submission.publish) {
    throw backendError(409, "campaign-not-published", "campaign updates require a published campaign");
  }

  const publisherAddress = String(payload.publisherAddress || "").trim();
  if (publisherAddress.toLowerCase() !== submission.creatorAddress.toLowerCase()) {
    throw backendError(403, "creator-address-mismatch", "update publisher must match the campaign creator address");
  }

  const title = String(payload.title || "").trim();
  const body = String(payload.body || "").trim();
  if (!title || title.length > 120) {
    throw backendError(400, "invalid-update-title", "update title must be between 1 and 120 characters");
  }
  if (!body || body.length > 2000) {
    throw backendError(400, "invalid-update-body", "update body must be between 1 and 2000 characters");
  }

  const milestoneIndex = payload.milestoneIndex === null || payload.milestoneIndex === undefined
    ? null
    : Number(payload.milestoneIndex);
  if (
    milestoneIndex !== null
    && (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex >= submission.contractInput.milestoneDescriptions.length)
  ) {
    throw backendError(400, "invalid-milestone-index", "milestoneIndex must identify a campaign milestone");
  }

  const update = {
    id: randomUUID(),
    title,
    body,
    milestoneIndex,
    publisherAddress,
    createdAt: new Date().toISOString(),
  };

  store.submissions[index] = {
    ...submission,
    updates: [...(submission.updates ?? []), update],
    updatedAt: update.createdAt,
  };
    appendAudit(store, "campaign.update_added", {
    submissionId: id,
    updateId: update.id,
    publisherAddress,
    milestoneIndex,
    }, actor);
    return structuredClone(update);
  });
}

export async function updateSubmission(id, patch = {}, actor) {
  return getRepository().transaction((store) => {
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const previous = store.submissions[index];
  if (!["draft", "needs_changes"].includes(previous.status)) {
    throw backendError(409, "submission-locked", "only draft or needs-changes submissions can be edited");
  }

  const next = normalizeSubmission(patch, {
    ...previous,
    id: previous.id,
    status: previous.status,
    review: previous.review,
    publish: previous.publish,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.submissions[index] = next;
    appendAudit(store, "submission.updated", {
    submissionId: id,
    readiness: next.readiness.state,
    }, actor);
    return structuredClone(next);
  });
}

export async function updateSubmissionStatus(id, status, patch = {}, actor) {
  if (!Object.hasOwn(ALLOWED_TRANSITIONS, status)) {
    throw backendError(400, "invalid-submission-status", `invalid submission status: ${status}`);
  }

  return getRepository().transaction((store) => {
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const previous = withReadiness(store.submissions[index]);
  if (!ALLOWED_TRANSITIONS[previous.status]?.has(status)) {
    throw backendError(409, "invalid-status-transition", `cannot move submission from ${previous.status} to ${status}`);
  }

  if (status === "pending_review" && previous.readiness.state !== READINESS.CONTRACT_READY) {
    throw backendError(422, "submission-not-contract-ready", "submission must be contract-ready before it can be submitted");
  }

  if (status === "approved" && patch.verification?.state !== "manually_verified") {
    throw backendError(422, "manual-verification-required", "manual verification is required before approval");
  }

  const next = withReadiness({
    ...previous,
    ...patch,
    id: previous.id,
    status,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.submissions[index] = next;
    appendAudit(store, `submission.${status}`, {
    submissionId: id,
    previousStatus: previous.status,
    reviewDecision: next.review?.decision ?? null,
    verificationState: next.verification?.state ?? "unverified",
    reviewerOperatorId: next.review?.reviewerOperatorId ?? null,
    reviewerSubject: next.review?.reviewerSubject ?? null,
    }, actor);
    return structuredClone(next);
  });
}
