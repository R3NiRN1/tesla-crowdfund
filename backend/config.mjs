function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getBackendConfig(env = process.env) {
  const port = Number(env.PORT || env.BACKEND_PORT || 8787);
  const production = env.NODE_ENV === "production";
  const adminToken = String(env.ADMIN_TOKEN || "").trim();
  const corsOrigin = String(env.CORS_ORIGIN || "*").trim();

  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    throw configError("invalid-backend-port", "PORT or BACKEND_PORT must be an integer from 1 to 65535");
  }
  if (production && adminToken.length < 24) {
    throw configError("production-admin-token-required", "production requires ADMIN_TOKEN with at least 24 characters");
  }
  if (production && (!corsOrigin || corsOrigin === "*")) {
    throw configError("production-cors-origin-required", "production requires an explicit CORS_ORIGIN");
  }
  if (corsOrigin !== "*") {
    try {
      const parsed = new URL(corsOrigin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== corsOrigin) {
        throw new Error("invalid origin");
      }
    } catch {
      throw configError("invalid-cors-origin", "CORS_ORIGIN must be an http(s) origin without a path");
    }
  }

  return { port, production, adminToken, corsOrigin };
}
