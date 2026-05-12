export const CAMPAIGN_DRAFTS_KEY = "teslaCrowdfundDrafts:v1";
export const AUDIT_LOG_KEY = "teslaCrowdfundAudit:v1";

export type CampaignDraftStatus = "draft" | "published";
export type CampaignDraftReadiness = "incomplete" | "contract-ready";

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
  status: CampaignDraftStatus;
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
  detail?: string;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_DECIMALS = 18;
const TOKEN_UNIT = 10n ** BigInt(TOKEN_DECIMALS);

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Failed to parse local storage", error);
    return fallback;
  }
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

function normalizeDraft(draft: CampaignDraft): CampaignDraft {
  const normalized = {
    ...draft,
    title: draft.title ?? "",
    shortDescription: draft.shortDescription ?? "",
    longDescription: draft.longDescription ?? "",
    goalAmount: draft.goalAmount ?? "",
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    imageUrl: draft.imageUrl ?? "",
    beneficiaryAddress: draft.beneficiaryAddress ?? "",
    tokenSymbol: draft.tokenSymbol ?? "",
    milestones: normalizeMilestones((draft as CampaignDraft).milestones),
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

export function getCampaignDrafts(): CampaignDraft[] {
  if (typeof window === "undefined") return [];
  return safeParse<CampaignDraft[]>(window.localStorage.getItem(CAMPAIGN_DRAFTS_KEY), []).map(normalizeDraft);
}

export function saveCampaignDrafts(drafts: CampaignDraft[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CAMPAIGN_DRAFTS_KEY, JSON.stringify(drafts));
}

export function upsertCampaignDraft(draft: CampaignDraft): CampaignDraft[] {
  const drafts = getCampaignDrafts();
  const index = drafts.findIndex((item) => item.id === draft.id);
  if (index === -1) {
    drafts.unshift(draft);
  } else {
    drafts[index] = draft;
  }
  saveCampaignDrafts(drafts);
  return drafts;
}

export function markDraftPublished(id: string): CampaignDraft[] {
  const drafts = getCampaignDrafts();
  const next = drafts.map((draft) =>
    draft.id === id
      ? {
          ...draft,
          status: "published" as CampaignDraftStatus,
          updatedAt: new Date().toISOString(),
        }
      : draft
  );
  saveCampaignDrafts(next);
  return next;
}

export function getAuditLog(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse<AuditLogEntry[]>(window.localStorage.getItem(AUDIT_LOG_KEY), []);
}

export function appendAuditLog(entry: AuditLogEntry): AuditLogEntry[] {
  const log = getAuditLog();
  const next = [entry, ...log];
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(next));
  }
  return next;
}
