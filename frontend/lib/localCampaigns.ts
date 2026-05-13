export const CAMPAIGN_DRAFTS_KEY = "teslaCrowdfundDrafts:v1";
export const AUDIT_LOG_KEY = "teslaCrowdfundAudit:v1";

export type CampaignDraftReviewState = "draft" | "needs changes" | "locally approved" | "rejected locally";
export type CampaignDraftPublishState = "not published" | "published-on-testnet locally";
export type CampaignDraftReadiness = "incomplete" | "contract-ready";
export type CampaignDraftReviewAction =
  | "mark needs changes"
  | "approve locally"
  | "reject locally"
  | "reset to draft";

export type CampaignDraftPublishMetadata = {
  publishedAt: string;
  transactionHash: string;
  factoryAddress: string;
  chainId: number;
  draftId: string;
  draftTitle: string;
};

export type CampaignMilestoneDraft = {
  id: string;
  description: string;
  amount: string;
};

export type CampaignContractInput = {
  description: string;
  goal: string;
  duration: string;
  milestoneDescriptions: string[];
  milestoneAmounts: string[];
};

export type CampaignDraft = {
  id: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  goalAmount: string;
  startDate: string;
  endDate: string;
  imageUrl: string;
  beneficiaryAddress: string;
  tokenSymbol: string;
  milestones: CampaignMilestoneDraft[];
  readiness: CampaignDraftReadiness;
  readinessReasons: string[];
  contractInput: CampaignContractInput;
  durationSeconds: number | null;
  milestoneTotal: string;
  reviewState?: CampaignDraftReviewState;
  adminNote?: string;
  publishState?: CampaignDraftPublishState;
  publishMetadata?: CampaignDraftPublishMetadata | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignDraftReadinessReport = {
  readiness: CampaignDraftReadiness;
  reasons: string[];
  contractInput: CampaignContractInput;
  durationSeconds: number | null;
  milestoneTotal: string;
  goalAmount: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  timestamp: string;
  draftId?: string;
  draftTitle?: string;
  note?: string;
  detail?: string;
};

type StoredCampaignDraft = Partial<CampaignDraft> & {
  milestones?: unknown;
  reviewState?: unknown;
  publishState?: unknown;
  publishMetadata?: unknown;
  status?: unknown;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_DECIMALS = 18;
const TOKEN_UNIT = 10n ** BigInt(TOKEN_DECIMALS);
const REVIEW_STATES: CampaignDraftReviewState[] = ["draft", "needs changes", "locally approved", "rejected locally"];
const PUBLISH_STATES: CampaignDraftPublishState[] = ["not published", "published-on-testnet locally"];

function createLocalId(prefix: string): string {
  if (typeof window !== "undefined" && "crypto" in window && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Failed to parse local storage", error);
    return fallback;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeReviewState(value: unknown): CampaignDraftReviewState {
  return REVIEW_STATES.includes(value as CampaignDraftReviewState) ? (value as CampaignDraftReviewState) : "draft";
}

function normalizePublishState(
  value: unknown,
  publishMetadata: CampaignDraftPublishMetadata | null
): CampaignDraftPublishState {
  if (PUBLISH_STATES.includes(value as CampaignDraftPublishState)) return value as CampaignDraftPublishState;
  return publishMetadata ? "published-on-testnet locally" : "not published";
}

function normalizePublishMetadata(value: unknown): CampaignDraftPublishMetadata | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Partial<CampaignDraftPublishMetadata>;
  const publishedAt = text(metadata.publishedAt);
  const transactionHash = text(metadata.transactionHash);
  const factoryAddress = text(metadata.factoryAddress);
  const chainId = Number(metadata.chainId);
  const draftId = text(metadata.draftId);
  const draftTitle = text(metadata.draftTitle);

  if (!publishedAt || !transactionHash || !factoryAddress || !Number.isFinite(chainId) || !draftId || !draftTitle) {
    return null;
  }

  return {
    publishedAt,
    transactionHash,
    factoryAddress,
    chainId,
    draftId,
    draftTitle,
  };
}

function parseDateMs(value: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseTokenUnits(value: string): { ok: true; units: bigint } | { ok: false; units: null } {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return { ok: false, units: null };
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false, units: null };

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > TOKEN_DECIMALS) return { ok: false, units: null };

  const units = BigInt(whole) * TOKEN_UNIT + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
  if (units <= 0n) return { ok: false, units: null };

  return { ok: true, units };
}

export function formatTokenUnits(units: bigint): string {
  const whole = units / TOKEN_UNIT;
  const fraction = (units % TOKEN_UNIT).toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export function buildDraftReadiness(
  draft: Pick<
    CampaignDraft,
    | "title"
    | "shortDescription"
    | "goalAmount"
    | "startDate"
    | "endDate"
    | "beneficiaryAddress"
    | "milestones"
  >
): CampaignDraftReadinessReport {
  const reasons: string[] = [];
  const title = draft.title.trim();
  const description = draft.shortDescription.trim();
  const goal = parseTokenUnits(draft.goalAmount);
  const startMs = parseDateMs(draft.startDate);
  const endMs = parseDateMs(draft.endDate);
  const durationSeconds =
    startMs !== null && endMs !== null && endMs > startMs ? Math.floor((endMs - startMs) / 1000) : null;
  const milestones = Array.isArray(draft.milestones) ? draft.milestones : [];

  if (!title) reasons.push("Title is required.");
  if (!description) reasons.push("Short description is required; it becomes the contract description.");
  if (!goal.ok) reasons.push("Goal amount must be positive and use at most 18 decimals.");
  if (!draft.startDate) reasons.push("Start date is required.");
  if (!draft.endDate) reasons.push("End date is required.");
  if (draft.startDate && draft.endDate && durationSeconds === null) {
    reasons.push("End date must be after start date.");
  }
  if (milestones.length === 0) reasons.push("At least one milestone is required.");

  let milestoneTotal = 0n;
  let allMilestoneAmountsValid = milestones.length > 0;
  const milestoneDescriptions = milestones.map((milestone) => milestone.description.trim());
  const milestoneAmounts = milestones.map((milestone, index) => {
    const parsed = parseTokenUnits(milestone.amount);
    if (!milestone.description.trim()) {
      reasons.push(`Milestone ${index + 1} description is required.`);
    }
    if (!parsed.ok) {
      reasons.push(`Milestone ${index + 1} amount must be positive and use at most 18 decimals.`);
      allMilestoneAmountsValid = false;
      return "";
    }
    milestoneTotal += parsed.units;
    return parsed.units.toString();
  });

  if (goal.ok && allMilestoneAmountsValid && milestoneTotal !== goal.units) {
    reasons.push("Milestone amounts must sum exactly to the goal amount.");
  }

  const beneficiaryAddress = draft.beneficiaryAddress.trim();
  if (beneficiaryAddress && !ADDRESS_REGEX.test(beneficiaryAddress)) {
    reasons.push("Beneficiary address must be a valid 0x address when provided.");
  }

  const contractInput = {
    description,
    goal: goal.ok ? goal.units.toString() : "",
    duration: durationSeconds !== null ? durationSeconds.toString() : "",
    milestoneDescriptions,
    milestoneAmounts,
  };

  return {
    readiness: reasons.length === 0 ? "contract-ready" : "incomplete",
    reasons,
    contractInput,
    durationSeconds,
    milestoneTotal: formatTokenUnits(milestoneTotal),
    goalAmount: goal.ok ? formatTokenUnits(goal.units) : draft.goalAmount.trim(),
  };
}

function normalizeMilestones(value: unknown): CampaignMilestoneDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const milestone = item as Partial<CampaignMilestoneDraft>;
    return {
      id: typeof milestone.id === "string" && milestone.id ? milestone.id : `milestone-${index + 1}`,
      description: typeof milestone.description === "string" ? milestone.description : "",
      amount: typeof milestone.amount === "string" ? milestone.amount : "",
    };
  });
}

function normalizeDraft(draft: StoredCampaignDraft): CampaignDraft {
  const now = new Date().toISOString();
  const publishMetadata = normalizePublishMetadata(draft.publishMetadata);
  const normalized = {
    id: text(draft.id) || createLocalId("draft"),
    title: text(draft.title),
    shortDescription: text(draft.shortDescription),
    longDescription: text(draft.longDescription),
    goalAmount: text(draft.goalAmount),
    startDate: text(draft.startDate),
    endDate: text(draft.endDate),
    imageUrl: text(draft.imageUrl),
    beneficiaryAddress: text(draft.beneficiaryAddress),
    tokenSymbol: text(draft.tokenSymbol),
    milestones: normalizeMilestones(draft.milestones),
    reviewState: normalizeReviewState(draft.reviewState ?? draft.status),
    adminNote: text(draft.adminNote),
    publishState: normalizePublishState(draft.publishState, publishMetadata),
    publishMetadata,
    createdAt: text(draft.createdAt) || now,
    updatedAt: text(draft.updatedAt) || text(draft.createdAt) || now,
  };
  const report = buildDraftReadiness(normalized);

  return {
    ...normalized,
    readiness: report.readiness,
    readinessReasons: report.reasons,
    contractInput: report.contractInput,
    durationSeconds: report.durationSeconds,
    milestoneTotal: report.milestoneTotal,
  };
}

function normalizeAuditLogEntry(entry: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id: text(entry.id) || createLocalId("log"),
    action: text(entry.action) || "local admin action",
    timestamp: text(entry.timestamp) || new Date().toISOString(),
    draftId: text(entry.draftId) || undefined,
    draftTitle: text(entry.draftTitle) || undefined,
    note: text(entry.note) || undefined,
    detail: text(entry.detail) || undefined,
  };
}

export function getCampaignDrafts(): CampaignDraft[] {
  if (typeof window === "undefined") return [];
  return safeParse<StoredCampaignDraft[]>(window.localStorage.getItem(CAMPAIGN_DRAFTS_KEY), []).map(normalizeDraft);
}

export function saveCampaignDrafts(drafts: CampaignDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CAMPAIGN_DRAFTS_KEY, JSON.stringify(drafts.map(normalizeDraft)));
}

export function upsertCampaignDraft(draft: CampaignDraft): CampaignDraft[] {
  const drafts = getCampaignDrafts();
  const normalizedDraft = normalizeDraft(draft);
  const index = drafts.findIndex((item) => item.id === normalizedDraft.id);
  if (index === -1) {
    drafts.unshift(normalizedDraft);
  } else {
    drafts[index] = normalizedDraft;
  }
  saveCampaignDrafts(drafts);
  return drafts;
}

export function getAuditLog(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<Partial<AuditLogEntry>[]>(window.localStorage.getItem(AUDIT_LOG_KEY), []).map(normalizeAuditLogEntry);
}

export function appendAuditLog(entry: AuditLogEntry): AuditLogEntry[] {
  const log = getAuditLog();
  const next = [normalizeAuditLogEntry(entry), ...log];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(next));
  }
  return next;
}

export function isDraftLocallyPublished(
  draft: Pick<CampaignDraft, "publishState" | "publishMetadata">
): boolean {
  return draft.publishState === "published-on-testnet locally" || !!draft.publishMetadata;
}

export function updateCampaignDraftReview(
  id: string,
  reviewState: CampaignDraftReviewState,
  action: CampaignDraftReviewAction,
  note: string
): { drafts: CampaignDraft[]; auditLog: AuditLogEntry[] } {
  const timestamp = new Date().toISOString();
  const adminNote = note.trim();
  const storedDrafts = getCampaignDrafts();
  const currentDraft = storedDrafts.find((draft) => draft.id === id);

  if (!currentDraft) {
    return { drafts: storedDrafts, auditLog: getAuditLog() };
  }

  const reviewedDraft: CampaignDraft = {
    ...currentDraft,
    reviewState,
    adminNote,
    updatedAt: timestamp,
  };
  const drafts = storedDrafts.map((draft) => (draft.id === id ? reviewedDraft : draft));
  saveCampaignDrafts(drafts);

  const auditLog = appendAuditLog({
    id: createLocalId("log"),
    action,
    timestamp,
    draftId: reviewedDraft.id,
    draftTitle: reviewedDraft.title,
    note: adminNote || undefined,
  });

  return { drafts, auditLog };
}

export function updateCampaignDraftAdminNote(
  id: string,
  note: string
): { drafts: CampaignDraft[]; auditLog: AuditLogEntry[] } {
  const timestamp = new Date().toISOString();
  const adminNote = note.trim();
  const storedDrafts = getCampaignDrafts();
  const currentDraft = storedDrafts.find((draft) => draft.id === id);

  if (!currentDraft) {
    return { drafts: storedDrafts, auditLog: getAuditLog() };
  }

  const notedDraft: CampaignDraft = {
    ...currentDraft,
    adminNote,
    updatedAt: timestamp,
  };
  const drafts = storedDrafts.map((draft) => (draft.id === id ? notedDraft : draft));
  saveCampaignDrafts(drafts);

  const auditLog = appendAuditLog({
    id: createLocalId("log"),
    action: "save admin note",
    timestamp,
    draftId: notedDraft.id,
    draftTitle: notedDraft.title,
    note: adminNote || undefined,
  });

  return { drafts, auditLog };
}

export function recordCampaignDraftPublish(
  metadata: CampaignDraftPublishMetadata
): { drafts: CampaignDraft[]; auditLog: AuditLogEntry[] } {
  const storedDrafts = getCampaignDrafts();
  const currentDraft = storedDrafts.find((draft) => draft.id === metadata.draftId);

  if (!currentDraft) {
    return { drafts: storedDrafts, auditLog: getAuditLog() };
  }

  const publishedDraft: CampaignDraft = {
    ...currentDraft,
    publishState: "published-on-testnet locally",
    publishMetadata: metadata,
    updatedAt: metadata.publishedAt,
  };
  const drafts = storedDrafts.map((draft) => (draft.id === metadata.draftId ? publishedDraft : draft));
  saveCampaignDrafts(drafts);

  const auditLog = appendAuditLog({
    id: createLocalId("log"),
    action: "publish to testnet confirmed",
    timestamp: metadata.publishedAt,
    draftId: metadata.draftId,
    draftTitle: metadata.draftTitle,
    note: `Transaction ${metadata.transactionHash}`,
    detail: `Factory ${metadata.factoryAddress} on chain ${metadata.chainId}. Local record only; not backend verified.`,
  });

  return { drafts, auditLog };
}
