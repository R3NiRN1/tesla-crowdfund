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
    reviewerOperatorId: string;
    reviewerSubject: string;
    reviewedAt: string;
  } | null;
  verification?: {
    state: "unverified" | "manually_verified";
    note: string;
    reviewerOperatorId: string;
    reviewerSubject: string;
    verifiedAt: string | null;
  } | null;
  publish?: {
    transactionHash: string;
    campaignAddress: string;
    factoryAddress: string;
    chainId: number;
    metadataURI: string;
    publisherAddress: string;
    tokenAddress: string;
    arbitratorAddress: string;
    factoryVersion: string;
    campaignVersion: string;
    blockNumber: number;
    confirmations: number;
    verifiedOnChain: boolean;
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

export type BackendStructuredError = {
  code?: string;
  message?: string;
  detail?: unknown;
  requestId?: string | null;
  timestamp?: string;
};

type ErrorResponse = {
  code?: string;
  error?: string | BackendStructuredError;
};

export type BackendAuditEntry = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  actor?: { kind: "wallet" | "operator" | "system"; id: string | null };
  timestamp: string;
};

export type BackendHealthStatus = {
  ok: boolean;
  service: string;
  status: string;
  productionReady: boolean;
  startedAt: string;
  uptimeSeconds: number;
  config: {
    production: boolean;
    corsOrigin: string;
    storage: string;
    durableStorage: boolean;
    operatorAuthConfigured: boolean;
  };
  warnings: string[];
};

export type BackendDiagnostics = {
  service: string;
  startedAt: string;
  uptimeSeconds: number;
  config: BackendHealthStatus["config"];
  warnings: string[];
  counts: {
    submissions: Record<BackendSubmission["status"], number>;
    auditEvents: number;
    authNonces: number;
    walletSessions?: number;
    activeOperators?: number;
  };
  recentAudit: BackendAuditEntry[];
};

export type BackendModerationDecision = "needs_changes" | "approved" | "rejected";

export type BackendModerationInput = {
  decision: BackendModerationDecision;
  note: string;
  manuallyVerified: boolean;
  verificationNote: string;
};

export type BackendOperatorSession = {
  sessionToken: string;
  expiresAt: string;
  operator: { id: string; subject: string; displayName: string; roles: string[] };
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
  sessionToken: string;
  expiresAt: string;
};

export type StoredBackendAuthSession = {
  address: string;
  sessionToken: string;
  expiresAt: string;
};

const BACKEND_AUTH_SESSION_KEY = "teslastarter.backendWalletSession.v2";

function browserSessionStorage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function clearBackendAuthSession() {
  browserSessionStorage()?.removeItem(BACKEND_AUTH_SESSION_KEY);
}

export function getBackendAuthSession(address?: string | null): StoredBackendAuthSession | null {
  const storage = browserSessionStorage();
  if (!storage) return null;
  const raw = storage.getItem(BACKEND_AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBackendAuthSession;
    if (!parsed.address || !/^[a-fA-F0-9]{64}$/.test(parsed.sessionToken || "")) {
      storage.removeItem(BACKEND_AUTH_SESSION_KEY);
      return null;
    }
    if (!parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      storage.removeItem(BACKEND_AUTH_SESSION_KEY);
      return null;
    }
    if (address && parsed.address.toLowerCase() !== address.toLowerCase()) return null;
    return parsed;
  } catch {
    storage.removeItem(BACKEND_AUTH_SESSION_KEY);
    return null;
  }
}

function storeBackendAuthSession(result: BackendAuthResult) {
  const session: StoredBackendAuthSession = {
    address: result.address,
    sessionToken: result.sessionToken,
    expiresAt: result.expiresAt,
  };
  browserSessionStorage()?.setItem(BACKEND_AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

function responseErrorCode(payload: ErrorResponse) {
  if (payload.error && typeof payload.error === "object" && payload.error.code) return payload.error.code;
  return payload.code ?? "backend-request-failed";
}

function responseErrorMessage(payload: ErrorResponse, status: number) {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object") {
    const requestId = payload.error.requestId ? ` Request ID: ${payload.error.requestId}.` : "";
    return `${payload.error.message ?? `Backend request failed with status ${status}.`}${requestId}`;
  }
  return `Backend request failed with status ${status}.`;
}

function walletAuthorizationHeaders(): Record<string, string> {
  const session = getBackendAuthSession();
  if (!session) {
    throw new BackendClientError(401, "wallet-session-required", "Authenticate the connected creator wallet before using private backend actions.");
  }
  return { authorization: `Bearer ${session.sessionToken}` };
}

async function requestSubmission(path: string, init: RequestInit, walletAuth = true): Promise<BackendSubmission> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    throw new BackendClientError(0, "backend-not-configured", "NEXT_PUBLIC_BACKEND_URL is not configured.");
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(walletAuth ? walletAuthorizationHeaders() : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as SubmissionResponse & ErrorResponse;

  if (!response.ok || !payload.submission) {
    if (response.status === 401 && ["wallet-session-invalid", "wallet-session-expired"].includes(responseErrorCode(payload))) {
      clearBackendAuthSession();
    }
    throw new BackendClientError(
      response.status,
      responseErrorCode(payload),
      responseErrorMessage(payload, response.status),
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
      responseErrorCode(payload),
      responseErrorMessage(payload, response.status),
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

export async function verifyBackendAuthSignature(
  address: string,
  nonce: string,
  signature: string,
): Promise<BackendAuthResult> {
  const result = await requestJson<BackendAuthResult>("/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, nonce, signature }),
  });
  storeBackendAuthSession(result);
  return result;
}

export async function ensureBackendAuthSession(
  address: string,
  signMessage: (message: string) => Promise<string>,
): Promise<StoredBackendAuthSession> {
  const existing = getBackendAuthSession(address);
  if (existing) return existing;
  const challenge = await requestBackendAuthNonce(address);
  const signature = await signMessage(challenge.message);
  const verified = await verifyBackendAuthSignature(address, challenge.nonce, signature);
  return storeBackendAuthSession(verified);
}

export async function logoutBackendAuthSession(): Promise<void> {
  const session = getBackendAuthSession();
  if (!session) return;
  try {
    await requestJson<{ ok: true }>("/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
  } finally {
    clearBackendAuthSession();
  }
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

export function getBackendHealth(): Promise<BackendHealthStatus> {
  return requestJson<BackendHealthStatus>("/health");
}

function operatorAuthorizationHeaders(sessionToken: string): Record<string, string> {
  return sessionToken ? { authorization: `Bearer ${sessionToken}` } : {};
}

export function authenticateBackendOperator(credential: string): Promise<BackendOperatorSession> {
  return requestJson<BackendOperatorSession>("/operator/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
}

export function getBackendDiagnostics(operatorSession: string): Promise<{ diagnostics: BackendDiagnostics; operator: BackendOperatorSession["operator"] }> {
  return requestJson<{ diagnostics: BackendDiagnostics; operator: BackendOperatorSession["operator"] }>("/admin/diagnostics", {
    headers: operatorAuthorizationHeaders(operatorSession),
  });
}

export async function listBackendSubmissions(operatorSession?: string): Promise<BackendSubmission[]> {
  if (operatorSession !== undefined) {
    const payload = await requestJson<{ submissions: BackendSubmission[] }>("/admin/submissions", {
      headers: operatorAuthorizationHeaders(operatorSession),
    });
    return payload.submissions;
  }
  const payload = await requestJson<{ submissions: BackendSubmission[] }>("/submissions", {
    headers: walletAuthorizationHeaders(),
  });
  return payload.submissions;
}

export async function listBackendAudit(operatorSession = ""): Promise<BackendAuditEntry[]> {
  const payload = await requestJson<{ auditLog: BackendAuditEntry[] }>("/audit", {
    headers: operatorAuthorizationHeaders(operatorSession),
  });
  return payload.auditLog;
}

export function moderateBackendSubmission(
  id: string,
  input: BackendModerationInput,
  operatorSession: string,
): Promise<BackendSubmission> {
  return requestSubmission(`/admin/submissions/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: operatorAuthorizationHeaders(operatorSession),
    body: JSON.stringify(input),
  }, false);
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
    { headers: walletAuthorizationHeaders() },
  );
  return payload.metadata;
}
