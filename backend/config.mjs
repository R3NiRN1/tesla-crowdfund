import { parseTrustedProxyIps } from "./proxy.mjs";

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getBackendConfig(env = process.env) {
  const port = Number(env.PORT || env.BACKEND_PORT || 8787);
  const production = env.NODE_ENV === "production";
  const storageDriver = String(env.STORAGE_DRIVER || (env.DATABASE_URL ? "postgres" : "file")).trim();
  const databaseUrl = String(env.DATABASE_URL || "").trim();
  const corsOrigin = String(env.CORS_ORIGIN || "*").trim();
  const trustedProxyInput = String(env.TRUSTED_PROXY_IPS || "").trim();
  const trustedProxyIps = parseTrustedProxyIps(trustedProxyInput);
  const suppliedProxyEntries = trustedProxyInput
    ? trustedProxyInput.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    throw configError("invalid-backend-port", "PORT or BACKEND_PORT must be an integer from 1 to 65535");
  }
  if (!['file', 'postgres'].includes(storageDriver)) {
    throw configError("invalid-storage-driver", "STORAGE_DRIVER must be file or postgres");
  }
  if (storageDriver === "postgres" && !databaseUrl) {
    throw configError("database-url-required", "PostgreSQL storage requires DATABASE_URL");
  }
  if (production && (storageDriver !== "postgres" || !databaseUrl)) {
    throw configError("production-durable-storage-required", "production requires PostgreSQL durable storage configured through DATABASE_URL");
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
  if (trustedProxyIps.length !== suppliedProxyEntries.length) {
    throw configError(
      "invalid-trusted-proxy-ips",
      "TRUSTED_PROXY_IPS must be a comma-separated list of exact IPv4 or IPv6 addresses",
    );
  }

  return { port, production, storageDriver, databaseUrl, corsOrigin, trustedProxyIps };
}
