import type { CampaignContractInput } from "./localCampaigns";

export type BackendReadiness = {
  state: "incomplete" | "contract-ready";
  reasons: string[];
  checkedAt: string;
};

export type BackendSubmission = {
  id: string;
  status: "draft" | "pending_review" | "approved" | "rejected" | "published";
  creatorAddress: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  metadataURI: string;
  contractInput: CampaignContractInput;
  readiness: BackendReadiness;
  createdAt: string;
  updatedAt: string;
};

export type BackendSubmissionInput = {
  creatorAddress: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
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
