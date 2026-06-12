import http from "node:http";
import { URL } from "node:url";

import {
  consumeNonce,
  createSubmission,
  issueNonce,
  readStore,
  updateSubmission,
  updateSubmissionStatus,
} from "./store.mjs";

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

function send(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-admin-token",
  });
  res.end(`${body}\n`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("request body too large"));
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
    send(res, 200, {
      ok: true,
      service: "tesla-crowdfund-backend-alpha",
      productionReady: false,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/nonce") {
    const body = await readBody(req);
    send(res, 201, issueNonce(body.address));
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/verify") {
    const body = await readBody(req);
    consumeNonce(body.address, body.nonce);

    send(res, 200, {
      authenticated: false,
      address: String(body.address || "").trim().toLowerCase(),
      note: "Nonce lifecycle is implemented. Cryptographic signature verification is the next auth PR step.",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/submissions") {
    send(res, 200, { submissions: readStore().submissions });
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
      send(res, 404, { error: "submission not found" });
      return;
    }
    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts[0] === "submissions" && parts[2] === "submit") {
    const body = await readBody(req);
    const submission = updateSubmissionStatus(parts[1], "pending_review", {
      submittedAt: new Date().toISOString(),
      submitNote: String(body.note || "").trim(),
      review: null,
    });
    send(res, 200, { submission });
    return;
  }

  if (req.method === "POST" && parts[0] === "admin" && parts[1] === "submissions" && parts[3] === "review") {
    const admin = requireAdmin(req);
    const body = await readBody(req);
    const decision = String(body.decision || "").trim();

    if (!["approved", "rejected", "needs_changes"].includes(decision)) {
      send(res, 400, { error: "decision must be approved, rejected, or needs_changes" });
      return;
    }

    const reviewerAddress = String(body.reviewerAddress || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(reviewerAddress)) {
      send(res, 400, { error: "valid reviewerAddress is required" });
      return;
    }

    const manuallyVerified = body.manuallyVerified === true;
    if (decision === "approved" && !manuallyVerified) {
      send(res, 422, { error: "manual verification is required before approval" });
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

  if (req.method === "POST" && parts[0] === "submissions" && parts[2] === "published") {
    const body = await readBody(req);
    const current = getSubmission(parts[1]);

    if (!current) {
      send(res, 404, { error: "submission not found" });
      return;
    }

    if (current.status !== "approved") {
      send(res, 409, { error: "submission must be approved before publish record is accepted" });
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
      send(res, 403, { error: "connected publisher must match the approved creator address" });
      return;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      send(res, 400, { error: "valid transactionHash is required" });
      return;
    }
    if (!addressPattern.test(campaignAddress) || !addressPattern.test(factoryAddress)) {
      send(res, 400, { error: "valid campaignAddress and factoryAddress are required" });
      return;
    }
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      send(res, 400, { error: "valid chainId is required" });
      return;
    }
    if (!metadataURI || metadataURI !== current.metadataURI) {
      send(res, 400, { error: "metadataURI must match the approved submission" });
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

  if (req.method === "GET" && url.pathname === "/audit") {
    send(res, 200, { auditLog: readStore().auditLog });
    return;
  }

  send(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    send(res, error.statusCode || 500, {
      code: error.code || "backend-error",
      error: error.message || "internal server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`TES Crowdfund backend alpha listening on http://localhost:${PORT}`);
  console.log("File-backed alpha persistence is local only and not production storage.");
});
