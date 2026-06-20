import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { verifyWalletSignature } from "./auth.mjs";
import { getBackendConfig } from "./config.mjs";

import {
  addCampaignUpdate,
  buildSubmissionMetadata,
  createSubmission,
  issueNonce,
  listPublishedCampaigns,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} from "./store.mjs";

const { port: PORT, production: PRODUCTION, adminToken: ADMIN_TOKEN, corsOrigin: CORS_ORIGIN } = getBackendConfig();
const STARTED_AT = new Date();

function configWarnings() {
  const warnings = ["File-backed persistence is for alpha operations only; configure backup/restore before launch."];
  if (!PRODUCTION) warnings.push("NODE_ENV is not production; launch guardrails may be relaxed.");
  if (!ADMIN_TOKEN) warnings.push("ADMIN_TOKEN is unset; admin routes are open for local alpha only.");
  if (CORS_ORIGIN === "*") warnings.push("CORS_ORIGIN allows all origins; production must pin an app origin.");
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

function diagnosticsSnapshot() {
  const store = readStore();
  return {
    service: "tesla-crowdfund-backend-alpha",
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    config: {
      production: PRODUCTION,
      corsOrigin: CORS_ORIGIN,
      adminTokenConfigured: Boolean(ADMIN_TOKEN),
      storage: "file-backed-json",
    },
    warnings: configWarnings(),
    counts: {
      submissions: submissionCounts(store.submissions),
      auditEvents: store.auditLog.length,
      authNonces: store.authNonces.length,
    },
    recentAudit: store.auditLog.slice(0, 25),
  };
}

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token,x-request-id",
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

function requireAdmin(req) {
  if (!ADMIN_TOKEN) {
    return {
      alphaBypass: true,
      note: "ADMIN_TOKEN is not set; admin route is open for local alpha only.",
    };
  }

  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    const error = new Error("admin token required");
    error.statusCode = 401;
    error.code = "admin-token-required";
    throw error;
  }

  return { alphaBypass: false };
}

function getSubmission(id) {
  return readStore().submissions.find((submission) => submission.id === id);
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/health") {
    const diagnostics = diagnosticsSnapshot();
    send(res, 200, {
      ok: true,
      service: diagnostics.service,
      status: "ok",
      productionReady: PRODUCTION && Boolean(ADMIN_TOKEN) && CORS_ORIGIN !== "*",
      startedAt: diagnostics.startedAt,
      uptimeSeconds: diagnostics.uptimeSeconds,
      config: diagnostics.config,
      warnings: diagnostics.warnings,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/diagnostics") {
    const admin = requireAdmin(req);
    send(res, 200, { ok: true, diagnostics: diagnosticsSnapshot(), admin });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/nonce") {
    const body = await readBody(req);
    send(res, 201, issueNonce(body.address));
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/verify") {
    const body = await readBody(req);
    send(res, 200, verifyWalletSignature(body.address, body.nonce, body.signature));
    return;
  }

  if (req.method === "GET" && url.pathname === "/submissions") {
    send(res, 200, { submissions: readStore().submissions });
    return;
  }

  if (req.method === "GET" && url.pathname === "/public/campaigns") {
    send(res, 200, { campaigns: listPublishedCampaigns() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/submissions") {
    const body = await readBody(req);
    send(res, 201, { submission: createSubmission(body) });
    return;
  }

  if (req.method === "PATCH" && parts[0] === "submissions" && parts.length === 2) {
    const body = await readBody(req);
    send(res, 200, { submission: updateSubmission(parts[1], body) });
    return;
  }

  if (req.method === "GET" && parts[0] === "submissions" && parts.length === 2) {
    const submission = getSubmission(parts[1]);
    if (!submission) {
      sendError(res, 404, "submission-not-found", "submission not found", { submissionId: parts[1] });
      return;
    }
    send(res, 200, { submission });
    return;
  }

  if (req.method === "GET" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "metadata") {
    send(res, 200, {
      metadata: buildSubmissionMetadata(parts[1]),
      storage: "external-reference-only",
      note: "Upload this JSON and referenced media to external storage, then save its resulting metadataURI on the submission.",
    });
    return;
  }

  if (req.method === "POST" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "submit") {
    const body = await readBody(req);
    const submission = updateSubmissionStatus(parts[1], "pending_review", {
      submittedAt: new Date().toISOString(),
      submitNote: String(body.note || "").trim(),
      review: null,
    });
    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "submissions" && parts[3] === "review") {
    const admin = requireAdmin(req);
    const body = await readBody(req);
    const decision = String(body.decision || "").trim();

    if (!["approved", "rejected", "needs_changes"].includes(decision)) {
      sendError(res, 400, "invalid-review-decision", "decision must be approved, rejected, or needs_changes", { decision });
      return;
    }

    const reviewerAddress = String(body.reviewerAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(reviewerAddress)) {
      sendError(res, 400, "invalid-reviewer-address", "valid reviewerAddress is required");
      return;
    }

    const manuallyVerified = body.manuallyVerified === true;
    if (decision === "approved" && !manuallyVerified) {
      sendError(res, 422, "manual-verification-required", "manual verification is required before approval");
      return;
    }

    const reviewedAt = new Date().toISOString();

    const submission = updateSubmissionStatus(parts[2], decision, {
      review: {
        decision,
        note: String(body.note || "").trim(),
        reviewerAddress,
        reviewedAt,
        alphaAdminBypass: admin.alphaBypass,
      },
      verification: {
        state: manuallyVerified ? "manually_verified" : "unverified",
        note: String(body.verificationNote || "").trim(),
        reviewerAddress,
        verifiedAt: manuallyVerified ? reviewedAt : null,
      },
    });

    send(res, 200, { submission, admin });
    return;
  }

  if (req.method === "POST" && parts.length === 3 && parts[0] === "submissions" && parts[2] === "published") {
    const body = await readBody(req);
    const current = getSubmission(parts[1]);

    if (!current) {
      sendError(res, 404, "submission-not-found", "submission not found", { submissionId: parts[1] });
      return;
    }

    if (current.status !== "approved") {
      sendError(res, 409, "submission-not-approved", "submission must be approved before publish record is accepted", {
        submissionId: parts[1],
        status: current.status,
      });
      return;
    }

    const publisherAddress = String(body.publisherAddress || "").trim();
    const transactionHash = String(body.transactionHash || body.txHash || "").trim();
    const campaignAddress = String(body.campaignAddress || "").trim();
    const factoryAddress = String(body.factoryAddress || "").trim();
    const chainId = Number(body.chainId || 0);
    const metadataURI = String(body.metadataURI || body.metadataUri || "").trim();
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;

    if (publisherAddress.toLowerCase() !== current.creatorAddress.toLowerCase()) {
      sendError(res, 403, "creator-address-mismatch", "connected publisher must match the approved creator address");
      return;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      sendError(res, 400, "invalid-transaction-hash", "valid transactionHash is required");
      return;
    }
    if (!addressPattern.test(campaignAddress) || !addressPattern.test(factoryAddress)) {
      sendError(res, 400, "invalid-publish-addresses", "valid campaignAddress and factoryAddress are required");
      return;
    }
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      sendError(res, 400, "invalid-chain-id", "valid chainId is required");
      return;
    }
    if (!metadataURI || metadataURI !== current.metadataURI) {
      sendError(res, 400, "metadata-uri-mismatch", "metadataURI must match the approved submission");
      return;
    }

    const submission = updateSubmissionStatus(parts[1], "published", {
      publish: {
        transactionHash,
        campaignAddress,
        factoryAddress,
        chainId,
        metadataURI,
        publisherAddress,
        publishedAt: new Date().toISOString(),
      },
    });

    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts.length === 4 && parts[0] === "admin" && parts[1] === "submissions" && parts[3] === "updates") {
    const admin = requireAdmin(req);
    const body = await readBody(req);
    const update = addCampaignUpdate(parts[2], body);
    send(res, 201, { update, admin });
    return;
  }

  if (req.method === "GET" && url.pathname === "/audit") {
    send(res, 200, { auditLog: readStore().auditLog });
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
      { method: req.method, path: req.url || "/" },
    );
  }
});

server.listen(PORT, () => {
  console.log(`TES Crowdfund backend alpha listening on http://localhost:${PORT}`);
  console.log(`Runtime mode: ${PRODUCTION ? "production guardrails enabled" : "local alpha"}.`);
  console.log("File-backed persistence remains unsuitable for production or mainnet launch.");
});
