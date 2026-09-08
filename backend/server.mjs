import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import {
  activeWalletSessionCount,
  getWalletSession,
  revokeWalletSession,
  verifyWalletSignature,
} from "./auth.mjs";
import { issueWalletChallenge } from "./challenges.mjs";
import { getBackendConfig } from "./config.mjs";
import {
  auditOperatorAction,
  authenticateOperatorCredential,
  requireOperatorRole,
  revokeOperatorSession,
} from "./operator-auth.mjs";
import { resolveClientIp } from "./proxy.mjs";
import { getRepository } from "./repository.mjs";
import {
  getPublicationVerificationConfig,
  verifyCampaignPublication,
} from "./publication-verifier.mjs";

import {
  addCampaignUpdate,
  buildSubmissionMetadata,
  createSubmission,
  listPublishedCampaigns,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} from "./store.mjs";

const {
  port: PORT,
  production: PRODUCTION,
  storageDriver: STORAGE_DRIVER,
  corsOrigin: CORS_ORIGIN,
  trustedProxyIps: TRUSTED_PROXY_IPS,
} = getBackendConfig();
const REPOSITORY = getRepository();
const STARTED_AT = new Date();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_BUCKETS = new Map();
const RATE_LIMITS = {
  default: 120,
  auth: 20,
  admin: 60,
  health: 240,
};

function publicationVerificationStatus() {
  try {
    const config = getPublicationVerificationConfig();
    return {
      ready: true,
      chainId: config.chainId,
      factoryAddress: config.factoryAddress,
      tokenAddress: config.tokenAddress,
      arbitratorAddress: config.arbitratorAddress,
      confirmations: config.confirmations,
    };
  } catch (error) {
    return {
      ready: false,
      error: error.message,
    };
  }
}

function configWarnings() {
  const warnings = [];
  if (!REPOSITORY.durable) warnings.push("File-backed persistence is local-development only; production requires PostgreSQL.");
  if (!PRODUCTION) warnings.push("NODE_ENV is not production; launch guardrails may be relaxed.");
  if (CORS_ORIGIN === "*") warnings.push("CORS_ORIGIN allows all origins; production must pin an app origin.");
  if (TRUSTED_PROXY_IPS.length > 0) warnings.push(`Forwarded client IPs are trusted only through ${TRUSTED_PROXY_IPS.length} explicitly configured proxy IP(s).`);
  const publication = publicationVerificationStatus();
  if (!publication.ready) warnings.push(`Independent publication verification is not ready: ${publication.error}`);
  return warnings;
}

function submissionCounts(submissions) {
  return submissions.reduce(
    (counts, submission) => ({
      ...counts,
      [submission.status]: (counts[submission.status] ?? 0) + 1,
    }),
    { draft: 0, pending_review: 0, needs_changes: 0, approved: 0, rejected: 0, published: 0 },
  );
}

async function diagnosticsSnapshot() {
  const store = await readStore();
  const publicationVerification = publicationVerificationStatus();
  const activeOperators = store.operators.filter((operator) => operator.active !== false).length;
  return {
    service: "tesla-crowdfund-backend-v2",
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    config: {
      production: PRODUCTION,
      corsOrigin: CORS_ORIGIN,
      trustedProxyCount: TRUSTED_PROXY_IPS.length,
      storage: STORAGE_DRIVER,
      durableStorage: REPOSITORY.durable,
      operatorAuthConfigured: activeOperators > 0,
      publicationVerification,
    },
    warnings: configWarnings(),
    counts: {
      submissions: submissionCounts(store.submissions),
      auditEvents: store.auditLog.length,
      authNonces: store.nonces.length,
      walletSessions: await activeWalletSessionCount(),
      activeOperators,
    },
    recentAudit: store.auditLog.slice(0, 25),
  };
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function clientIp(req) {
  return resolveClientIp({
    socketAddress: req.socket.remoteAddress,
    forwardedFor: headerValue(req.headers["x-forwarded-for"]),
    trustedProxyIps: TRUSTED_PROXY_IPS,
  });
}

function rateLimitGroup(pathname) {
  if (pathname === "/health") return "health";
  if (pathname.startsWith("/auth/")) return "auth";
  if (pathname.startsWith("/admin/")) return "admin";
  return "default";
}

function cleanupRateLimitBuckets(now) {
  if (RATE_LIMIT_BUCKETS.size < 5_000) return;
  for (const [key, bucket] of RATE_LIMIT_BUCKETS.entries()) {
    if (bucket.resetAt <= now) RATE_LIMIT_BUCKETS.delete(key);
  }
}

function enforceRateLimit(req, res, pathname) {
  const now = Date.now();
  cleanupRateLimitBuckets(now);
  const group = rateLimitGroup(pathname);
  const limit = RATE_LIMITS[group] ?? RATE_LIMITS.default;
  const key = `${clientIp(req)}:${group}`;
  const current = RATE_LIMIT_BUCKETS.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    : current;

  bucket.count += 1;
  RATE_LIMIT_BUCKETS.set(key, bucket);

  if (bucket.count > limit) {
    sendError(res, 429, "rate-limit-exceeded", "Too many requests; retry after the rate limit window resets.", {
      group,
      limit,
      resetAt: new Date(bucket.resetAt).toISOString(),
    });
    return false;
  }

  return true;
}

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-request-id",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": res.requestId ?? "",
  });
  res.end(`${body}\n`);
}

function sendError(res, statusCode, code, message, detail = {}) {
  send(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      detail,
      requestId: res.requestId ?? null,
      timestamp: new Date().toISOString(),
    },
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        const error = new Error("request body too large");
        error.statusCode = 413;
        error.code = "request-body-too-large";
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error("invalid JSON body");
        error.statusCode = 400;
        error.code = "invalid-json-body";
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function bearerToken(req) {
  const authorization = headerValue(req.headers.authorization).trim();
  const match = authorization.match(/^Bearer\s+([a-fA-F0-9]{64})$/);
  return match?.[1] ?? "";
}

async function requireWalletSession(req) {
  return getWalletSession(bearerToken(req));
}

async function getSubmission(id) {
  return (await readStore()).submissions.find((submission) => submission.id === id);
}

async function requireCreatorSubmission(req, id) {
  const session = await requireWalletSession(req);
  const submission = await getSubmission(id);
  if (!submission) {
    const error = new Error("submission not found");
    error.statusCode = 404;
    error.code = "submission-not-found";
    throw error;
  }
  if (submission.creatorAddress.toLowerCase() !== session.address.toLowerCase()) {
    const error = new Error("wallet session does not own this submission");
    error.statusCode = 403;
    error.code = "creator-session-mismatch";
    throw error;
  }
  return { session, submission };
}

async function requireOperator(req, role) {
  return requireOperatorRole(bearerToken(req), role);
}

function requireBodyCreator(body, session, fallback = "") {
  const claimed = String(body.creatorAddress ?? body.publisherAddress ?? fallback ?? "").trim();
  if (claimed && claimed.toLowerCase() !== session.address.toLowerCase()) {
    const error = new Error("creator address must match the authenticated wallet session");
    error.statusCode = 403;
    error.code = "creator-session-mismatch";
    throw error;
  }
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (!enforceRateLimit(req, res, url.pathname)) return;

  if (req.method === "GET" && url.pathname === "/health") {
    const diagnostics = await diagnosticsSnapshot();
    send(res, 200, {
      ok: true,
      service: diagnostics.service,
      status: "ok",
      productionReady:
        PRODUCTION
        && diagnostics.config.durableStorage
        && diagnostics.config.operatorAuthConfigured
        && CORS_ORIGIN !== "*"
        && diagnostics.config.publicationVerification.ready,
      startedAt: diagnostics.startedAt,
      uptimeSeconds: diagnostics.uptimeSeconds,
      config: diagnostics.config,
      warnings: diagnostics.warnings,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/diagnostics") {
    const operator = await requireOperator(req, "diagnostics.read");
    await auditOperatorAction(operator, "operator.diagnostics_read", { requestId: res.requestId });
    send(res, 200, { ok: true, diagnostics: await diagnosticsSnapshot(), operator });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/submissions") {
    const operator = await requireOperator(req, "submission.read");
    await auditOperatorAction(operator, "operator.submissions_read", { requestId: res.requestId });
    send(res, 200, { submissions: (await readStore()).submissions, operator });
    return;
  }

  if (req.method === "GET" && url.pathname === "/audit") {
    const operator = await requireOperator(req, "audit.read");
    await auditOperatorAction(operator, "operator.audit_read", { requestId: res.requestId });
    send(res, 200, { auditLog: (await readStore()).auditLog, operator });
    return;
  }

  if (req.method === "POST" && url.pathname === "/operator/auth") {
    const body = await readBody(req);
    send(res, 200, await authenticateOperatorCredential(body.credential));
    return;
  }

  if (req.method === "POST" && url.pathname === "/operator/logout") {
    const token = bearerToken(req);
    const operator = await requireOperatorRole(token, "submission.read");
    await revokeOperatorSession(token);
    send(res, 200, { ok: true, operatorId: operator.id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/nonce") {
    const body = await readBody(req);
    send(res, 201, await issueWalletChallenge(body.address));
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/verify") {
    const body = await readBody(req);
    send(res, 200, await verifyWalletSignature(body.address, body.nonce, body.signature));
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const token = bearerToken(req);
    const session = await getWalletSession(token);
    await revokeWalletSession(token);
    send(res, 200, { ok: true, address: session.address });
    return;
  }

  if (req.method === "GET" && url.pathname === "/public/campaigns") {
    send(res, 200, { campaigns: await listPublishedCampaigns() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/submissions") {
    const session = await requireWalletSession(req);
    const submissions = (await readStore()).submissions.filter(
      (submission) => submission.creatorAddress.toLowerCase() === session.address.toLowerCase(),
    );
    send(res, 200, { submissions });
    return;
  }

  if (req.method === "POST" && url.pathname === "/submissions") {
    const session = await requireWalletSession(req);
    const body = await readBody(req);
    requireBodyCreator(body, session);
    send(res, 201, { submission: await createSubmission({ ...body, creatorAddress: session.address }, { kind: "wallet", id: session.address }) });
    return;
  }

  if (req.method === "PATCH" && parts[0] === "submissions" && parts.length === 2) {
    const { session, submission: current } = await requireCreatorSubmission(req, parts[1]);
    const body = await readBody(req);
    requireBodyCreator(body, session, current.creatorAddress);
    send(res, 200, {
      submission: await updateSubmission(parts[1], { ...body, creatorAddress: current.creatorAddress }, { kind: "wallet", id: session.address }),
    });
    return;
  }

  if (req.method === "GET" && parts[0] === "submissions" && parts.length === 2) {
    const { submission } = await requireCreatorSubmission(req, parts[1]);
    send(res, 200, { submission });
    return;
  }

  if (req.method === "GET" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "metadata") {
    await requireCreatorSubmission(req, parts[1]);
    send(res, 200, {
      metadata: await buildSubmissionMetadata(parts[1]),
      storage: "external-reference-only",
      note: "Upload this JSON and referenced media to external storage, then save its resulting metadataURI on the submission.",
    });
    return;
  }

  if (req.method === "POST" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "submit") {
    const { session } = await requireCreatorSubmission(req, parts[1]);
    const body = await readBody(req);
    const submission = await updateSubmissionStatus(parts[1], "pending_review", {
      submittedAt: new Date().toISOString(),
      submitNote: String(body.note || "").trim(),
      review: null,
    }, { kind: "wallet", id: session.address });
    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "submissions" && parts[3] === "review") {
    const operator = await requireOperator(req, "submission.review");
    const body = await readBody(req);
    const decision = String(body.decision || "").trim();

    if (!["approved", "rejected", "needs_changes"].includes(decision)) {
      sendError(res, 400, "invalid-review-decision", "decision must be approved, rejected, or needs_changes", { decision });
      return;
    }

    if (Object.hasOwn(body, "reviewerAddress")) {
      sendError(res, 400, "request-identity-forbidden", "reviewer identity is derived from the authenticated operator session");
      return;
    }

    const manuallyVerified = body.manuallyVerified === true;
    if (decision === "approved" && !manuallyVerified) {
      sendError(res, 422, "manual-verification-required", "manual verification is required before approval");
      return;
    }

    const reviewedAt = new Date().toISOString();
    const submission = await updateSubmissionStatus(parts[2], decision, {
      review: {
        decision,
        note: String(body.note || "").trim(),
        reviewerOperatorId: operator.id,
        reviewerSubject: operator.subject,
        reviewedAt,
      },
      verification: {
        state: manuallyVerified ? "manually_verified" : "unverified",
        note: String(body.verificationNote || "").trim(),
        reviewerOperatorId: operator.id,
        reviewerSubject: operator.subject,
        verifiedAt: manuallyVerified ? reviewedAt : null,
      },
    }, { kind: "operator", id: operator.id });

    send(res, 200, { submission, operator });
    return;
  }

  if (req.method === "POST" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "published") {
    const { session, submission: current } = await requireCreatorSubmission(req, parts[1]);
    const body = await readBody(req);
    requireBodyCreator(body, session, current.creatorAddress);

    if (current.status !== "approved") {
      sendError(res, 409, "submission-not-approved", "submission must be approved before publish record is accepted", {
        submissionId: parts[1],
        status: current.status,
      });
      return;
    }

    const transactionHash = String(body.transactionHash || body.txHash || "").trim();
    const verifiedPublish = await verifyCampaignPublication({
      transactionHash,
      submission: current,
      creatorAddress: session.address,
    });

    const submission = await updateSubmissionStatus(parts[1], "published", {
      publish: {
        ...verifiedPublish,
        publishedAt: verifiedPublish.verifiedAt,
      },
    }, { kind: "wallet", id: session.address });

    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "updates") {
    const { session } = await requireCreatorSubmission(req, parts[1]);
    const body = await readBody(req);
    const update = await addCampaignUpdate(parts[1], { ...body, publisherAddress: session.address }, { kind: "wallet", id: session.address });
    send(res, 201, { update });
    return;
  }

  sendError(res, 404, "route-not-found", "not found", { method: req.method, path: url.pathname });
}

const server = http.createServer(async (req, res) => {
  const incomingRequestId = Array.isArray(req.headers["x-request-id"]) ? req.headers["x-request-id"][0] : req.headers["x-request-id"];
  res.requestId = incomingRequestId || randomUUID();
  try {
    await handler(req, res);
  } catch (error) {
    sendError(
      res,
      error.statusCode || 500,
      error.code || "backend-error",
      error.message || "internal server error",
      { ...(error.detail || {}), method: req.method, path: req.url || "/" },
    );
  }
});

await REPOSITORY.initialize();
if (PRODUCTION) {
  const store = await readStore();
  const releaseOperators = store.operators.filter((operator) => operator.active !== false && operator.roles?.includes("submission.review"));
  if (!releaseOperators.length) {
    throw Object.assign(new Error("production requires at least one active operator with submission.review role"), {
      code: "production-operator-required",
    });
  }
}

server.listen(PORT, () => {
  console.log(`TES Crowdfund backend V2 listening on http://localhost:${PORT}`);
  console.log(`Runtime mode: ${PRODUCTION ? "production guardrails enabled" : "local development"}; storage=${STORAGE_DRIVER}.`);
});
