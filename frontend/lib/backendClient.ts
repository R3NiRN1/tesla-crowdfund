import type { CampaignContractInput, CampaignMediaReference } from "./localCampaigns";

export type BackendReadiness = {
  state: "incomplete" | "contract-ready";
  reasons: string[];
  checkedAt: string;
};

export type BackendSubmission = {
  id: string;
  status: "draft" | "pending_review" | "needs_changes" | "approved" | "rejected" | "published";
  creatorAddress: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  media: CampaignMediaReference[];
  metadataURI: string;
  contractInput: CampaignContractInput;
  readiness: BackendReadiness;
  review?: {
    decision: "needs_changes" | "approved" | "rejected";
    note: string;
    reviewerAddress: string;
    reviewedAt: string;
    alphaAdminBypass: boolean;
  } | null;
  verification?: {
    state: "unverified" | "manually_verified";
    note: string;
    reviewerAddress: string;
    verifiedAt: string | null;
  } | null;
  publish?: {
    transactionHash: string;
    campaignAddress: string;
    factoryAddress: string;
    chainId: number;
    metadataURI: string;
    publisherAddress: string;
    publishedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type BackendSubmissionInput = {
  creatorAddress: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  media: CampaignMediaReference[];
  metadataURI: string;
  contractInput: CampaignContractInput;
};

type SubmissionResponse = {
  submission: BackendSubmission;
};

type ErrorResponse = {
  code?: string;
  error?: string;
};

export type BackendAuditEntry = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export type BackendModerationDecision = "needs_changes" | "approved" | "rejected";

export type BackendModerationInput = {
  decision: BackendModerationDecision;
  note: string;
  reviewerAddress: string;
  manuallyVerified: boolean;
  verificationNote: string;
};

export type BackendPublishInput = {
  transactionHash: `0x${string}`;
  campaignAddress: `0x${string}`;
  factoryAddress: `0x${string}`;
  chainId: number;
  metadataURI: string;
  publisherAddress: `0x${string}`;
};

export type PublicCampaign = {
  id: string;
  title: string;
  shortDescription: string;
  creatorAddress: string;
  creatorVerification: "unverified" | "manually_verified";
  media: CampaignMediaReference[];
  status: "published";
  goal: string;
  deadline: string;
  milestones: Array<{ description: string; amount: string }>;
  campaignAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  factoryAddress: `0x${string}`;
  chainId: number;
  metadataURI: string;
  publishedAt: string;
  timeline: Array<{
    id: string;
    type: "platform_review" | "contract_published" | "campaign_update" | "milestone";
    source: "platform" | "chain" | "creator";
    title: string;
    detail: string;
    timestamp: string | null;
    milestoneIndex: number | null;
  }>;
};

export class BackendClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BackendClientError";
    this.status = status;
    this.code = code;
  }
}

export function getBackendUrl(): string {
  return (process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ?? "").replace(/\/+$/, "");
}

export type BackendAuthNonce = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: string;
};

export type BackendAuthResult = {
  authenticated: true;
  address: string;
  authenticatedAt: string;
};

async function requestSubmission(path: string, init: RequestInit): Promise<BackendSubmission> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new BackendClientError(0, "backend-not-configured", "NEXT_PUBLIC_BACKEND_URL is not configured.");
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as SubmissionResponse & ErrorResponse;

  if (!response.ok || !payload.submission) {
    throw new BackendClientError(
      response.status,
      payload.code ?? "backend-request-failed",
      payload.error ?? `Backend request failed with status ${response.status}.`,
    );
  }

  return payload.submission;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new BackendClientError(0, "backend-not-configured", "NEXT_PUBLIC_BACKEND_URL is not configured.");
  }

  const response = await fetch(`${backendUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as T & ErrorResponse;
  if (!response.ok) {
    throw new BackendClientError(
      response.status,
      payload.code ?? "backend-request-failed",
      payload.error ?? `Backend request failed with status ${response.status}.`,
    );
  }
  return payload;
}

export function requestBackendAuthNonce(address: string): Promise<BackendAuthNonce> {
  return requestJson<BackendAuthNonce>("/auth/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
}

export function verifyBackendAuthSignature(
  address: string,
  nonce: string,
  signature: string,
): Promise<BackendAuthResult> {
  return requestJson<BackendAuthResult>("/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce, signature }),
  });
}

export function createBackendSubmission(input: BackendSubmissionInput): Promise<BackendSubmission> {
  return requestSubmission("/submissions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBackendSubmission(id: string, input: BackendSubmissionInput): Promise<BackendSubmission> {
  return requestSubmission(`/submissions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function submitBackendSubmission(id: string): Promise<BackendSubmission> {
  return requestSubmission(`/submissions/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listBackendSubmissions(): Promise<BackendSubmission[]> {
  const payload = await requestJson<{ submissions: BackendSubmission[] }>("/submissions");
  return payload.submissions;
}

export async function listBackendAudit(): Promise<BackendAuditEntry[]> {
  const payload = await requestJson<{ auditLog: BackendAuditEntry[] }>("/audit");
  return payload.auditLog;
}

export function moderateBackendSubmission(
  id: string,
  input: BackendModerationInput,
  adminToken: string,
): Promise<BackendSubmission> {
  return requestSubmission(`/admin/submissions/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: adminToken ? { "x-admin-token": adminToken } : {},
    body: JSON.stringify(input),
  });
}

export function recordBackendPublish(id: string, input: BackendPublishInput): Promise<BackendSubmission> {
  return requestSubmission(`/submissions/${encodeURIComponent(id)}/published`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPublicCampaigns(): Promise<PublicCampaign[]> {
  const payload = await requestJson<{ campaigns: PublicCampaign[] }>("/public/campaigns");
  return payload.campaigns;
}

export type BackendMetadataDocument = {
  schema: "tes-crowdfund-campaign/v1";
  submissionId: string;
  name: string;
  description: string;
  shortDescription: string;
  image: string | null;
  media: Array<Omit<CampaignMediaReference, "id">>;
  creator: string;
  campaign: {
    goal: string | null;
    duration: string | null;
    milestones: Array<{ description: string; amount: string | null }>;
  };
};

export async function getBackendSubmissionMetadata(id: string): Promise<BackendMetadataDocument> {
  const payload = await requestJson<{ metadata: BackendMetadataDocument }>(
    `/submissions/${encodeURIComponent(id)}/metadata`,
  );
  return payload.metadata;
}
