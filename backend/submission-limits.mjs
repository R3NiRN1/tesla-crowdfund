export const MAX_SUBMISSIONS_PER_CREATOR = 100;

const TEXT_LIMITS = Object.freeze({
  creatorAddress: 42, title: 120, shortDescription: 280, longDescription: 10_000,
  imageUrl: 1024, metadataURI: 512, metadataUri: 512, submitNote: 2000,
});
const MEDIA_LIMITS = Object.freeze({ id: 128, kind: 16, uri: 1024, label: 120, altText: 280 });
const CONTRACT_KEYS = new Set(["description", "goal", "duration", "milestoneDescriptions", "milestoneAmounts"]);
const REVIEW_LIMITS = Object.freeze({
  decision: 32, note: 2000, reviewerOperatorId: 200, reviewerSubject: 200, reviewerAddress: 42, reviewedAt: 64,
});
const VERIFICATION_LIMITS = Object.freeze({
  state: 32, note: 2000, reviewerOperatorId: 200, reviewerSubject: 200, reviewerAddress: 42, verifiedAt: 64,
});

function reject() {
  throw Object.assign(new Error("submission fields exceed storage limits or contain unsupported nested data"), {
    statusCode: 400, code: "submission-storage-limit",
  });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function boundedText(value, limit) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.length > limit) reject();
}

function boundedUint(value) {
  if (value === undefined || value === null) return;
  if (typeof value === "string") return boundedText(value, 78);
  if (typeof value === "number" && Number.isSafeInteger(value)) return;
  if (typeof value === "bigint" && value.toString().length <= 78) return;
  reject();
}

function boundedArray(value, limit, validate) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value) || value.length > limit) reject();
  for (const item of value) validate(item);
}

function boundedRecord(value, limits) {
  if (value === undefined || value === null) return;
  if (!object(value) || Object.keys(value).some((key) => !Object.hasOwn(limits, key))) reject();
  for (const [key, limit] of Object.entries(limits)) boundedText(value[key], limit);
}

// Storage safety is independent of readiness: missing or semantically invalid fields
// can still be drafts, but no supplied field may retain unbounded or unknown data.
export function assertSubmissionStorageLimits(payload) {
  if (!object(payload)) reject();
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) boundedText(payload[key], limit);
  boundedRecord(payload.review, REVIEW_LIMITS);
  boundedRecord(payload.verification, VERIFICATION_LIMITS);
  boundedArray(payload.media, 8, (item) => {
    if (item === null) return;
    if (!object(item) || Object.keys(item).some((key) => key !== "primary" && !Object.hasOwn(MEDIA_LIMITS, key))) reject();
    for (const [key, limit] of Object.entries(MEDIA_LIMITS)) boundedText(item[key], limit);
    if (item.primary != null && typeof item.primary !== "boolean") reject();
  });
  const input = payload.contractInput;
  if (input === undefined || input === null) return;
  if (!object(input) || Object.keys(input).some((key) => !CONTRACT_KEYS.has(key))) reject();
  boundedText(input.description, 2000);
  boundedUint(input.goal);
  boundedUint(input.duration);
  boundedArray(input.milestoneDescriptions, 64, (value) => boundedText(value, 280));
  boundedArray(input.milestoneAmounts, 64, boundedUint);
}

export function normalizeContractInput(input) {
  if (!input) return input;
  const uint = (value) => typeof value === "bigint" ? value.toString() : value;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key,
    key === "milestoneAmounts" && Array.isArray(value) ? value.map(uint) : uint(value),
  ]));
}

export function boundedAuditDetail(detail) {
  let nodes = 128;
  let characters = 4096;
  const text = (value, limit) => {
    const result = value.slice(0, Math.min(limit, characters));
    characters -= result.length;
    return result;
  };
  function visit(value, depth) {
    if (--nodes < 0 || depth > 4) return null;
    if (typeof value === "string") return text(value, 256);
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value.slice(0, 32)) {
        if (nodes <= 0 || characters <= 0) break;
        result.push(visit(item, depth + 1));
      }
      return result;
    }
    if (!object(value)) return null;
    const entries = [];
    for (const [key, item] of Object.entries(value).slice(0, 32)) {
      if (nodes <= 0 || characters <= 0) break;
      entries.push([text(key, 64), visit(item, depth + 1)]);
    }
    return Object.fromEntries(entries);
  }
  return visit(detail, 0);
}
