export const CAMPAIGN_DRAFTS_KEY = "teslaCrowdfundDrafts:v1";
export const AUDIT_LOG_KEY = "teslaCrowdfundAudit:v1";

export type CampaignDraftStatus = "draft" | "published";

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
  status: CampaignDraftStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  timestamp: string;
  detail?: string;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Failed to parse local storage", error);
    return fallback;
  }
}

export function getCampaignDrafts(): CampaignDraft[] {
  if (typeof window === "undefined") return [];
  return safeParse<CampaignDraft[]>(window.localStorage.getItem(CAMPAIGN_DRAFTS_KEY), []);
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
