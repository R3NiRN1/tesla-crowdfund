import assert from "node:assert/strict";

import { Wallet } from "ethers";

type JsonObject = Record<string, any>;

type ApprovedSubmission = {
  id: string;
  sessionToken: string;
};

function backendUrl(): string {
  const raw = String(process.env.TESTNET_BACKEND_URL || "").trim();
  if (!raw) throw new Error("TESTNET_BACKEND_URL is required for publication-verification evidence.");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("TESTNET_BACKEND_URL must use HTTPS except for an explicit localhost rehearsal.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function request(
  pathname: string,
  options: { method?: string; token?: string; body?: JsonObject } = {},
): Promise<JsonObject> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  const response = await fetch(`${backendUrl()}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json()) as JsonObject;
  if (!response.ok) {
    const code = payload?.error?.code || "backend-request-failed";
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${pathname}: ${code}: ${message}`);
  }
  return payload;
}

let cachedOperatorSession = "";

async function operatorSession(): Promise<string> {
  if (cachedOperatorSession) return cachedOperatorSession;
  const credential = String(process.env.TESTNET_OPERATOR_CREDENTIAL || "").trim();
  if (!credential) {
    throw new Error("TESTNET_OPERATOR_CREDENTIAL is required for explicit operator review.");
  }
  const authenticated = await request("/operator/auth", {
    method: "POST",
    body: { credential },
  });
  cachedOperatorSession = String(authenticated.sessionToken || "");
  assert.match(cachedOperatorSession, /^[a-f0-9]{64}$/i, "backend returned an invalid operator session");
  return cachedOperatorSession;
}

async function creatorSession(wallet: Wallet): Promise<string> {
  const challenge = await request("/auth/nonce", {
    method: "POST",
    body: { address: wallet.address },
  });
  const signature = await wallet.signMessage(String(challenge.message));
  const verified = await request("/auth/verify", {
    method: "POST",
    body: { address: wallet.address, nonce: challenge.nonce, signature },
  });
  assert.equal(String(verified.address).toLowerCase(), wallet.address.toLowerCase());
  return String(verified.sessionToken);
}

export async function prepareApprovedSubmission(
  creator: Wallet,
  input: {
    title: string;
    description: string;
    metadataURI: string;
    goal: string;
    duration: number;
    milestoneDescriptions: string[];
    milestoneAmounts: string[];
  },
): Promise<ApprovedSubmission> {
  const sessionToken = await creatorSession(creator);
  const created = await request("/submissions", {
    method: "POST",
    token: sessionToken,
    body: {
      creatorAddress: creator.address,
      title: input.title,
      shortDescription: "BSC testnet publication-verification campaign for the V2 release candidate.",
      longDescription: input.description,
      metadataURI: input.metadataURI,
      media: [],
      contractInput: {
        description: input.description,
        goal: input.goal,
        duration: String(input.duration),
        milestoneDescriptions: input.milestoneDescriptions,
        milestoneAmounts: input.milestoneAmounts,
      },
    },
  });
  const id = String(created.submission.id);
  await request(`/submissions/${id}/submit`, { method: "POST", token: sessionToken, body: {} });
  await request(`/admin/submissions/${id}/review`, {
    method: "POST",
    token: await operatorSession(),
    body: {
      decision: "approved",
      manuallyVerified: true,
      note: "Approved only for the documented BSC testnet harness.",
      verificationNote: "Testnet fixture review; not production KYC or mainnet approval.",
    },
  });
  return { id, sessionToken };
}

export async function recordVerifiedPublication(
  approved: ApprovedSubmission,
  transactionHash: string,
): Promise<{ campaignAddress: string; verifiedAt: string }> {
  const payload = await request(`/submissions/${approved.id}/published`, {
    method: "POST",
    token: approved.sessionToken,
    body: { transactionHash },
  });
  const publish = payload.submission.publish;
  assert.equal(String(publish.transactionHash).toLowerCase(), transactionHash.toLowerCase());
  assert.equal(Number(publish.chainId), 97);
  return {
    campaignAddress: String(publish.campaignAddress),
    verifiedAt: String(publish.verifiedAt || publish.publishedAt),
  };
}

export async function assertPublicPublication(
  submissionId: string,
  campaignAddress: string,
  transactionHash: string,
): Promise<void> {
  const payload = await request("/public/campaigns");
  const campaign = (payload.campaigns || []).find((entry: JsonObject) => String(entry.id) === submissionId);
  assert.ok(campaign, `published submission ${submissionId} is absent from the public backend`);
  assert.equal(String(campaign.campaignAddress).toLowerCase(), campaignAddress.toLowerCase());
  assert.equal(String(campaign.transactionHash).toLowerCase(), transactionHash.toLowerCase());
  assert.equal(Number(campaign.chainId), 97);
}
