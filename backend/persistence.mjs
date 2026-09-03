import fs from "node:fs";
import path from "node:path";

export const STORE_VERSION = 2;
export const BACKUP_SCHEMA = "tes-crowdfund-backend-backup/v1";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "backend", "data");
const DEFAULT_DB_FILE = path.join(DEFAULT_DATA_DIR, "backend-alpha-store.json");

export function getBackendDbFile(env = process.env) {
  return env.TESLA_CROWDFUND_BACKEND_DB || DEFAULT_DB_FILE;
}

export function emptyStore() {
  return {
    version: STORE_VERSION,
    submissions: [],
    nonces: [],
    walletSessions: [],
    operators: [],
    operatorCredentials: [],
    operatorSessions: [],
    auditLog: [],
  };
}

export function normalizeStore(store = {}) {
  const source = store && typeof store === "object" ? store : {};
  return {
    version: STORE_VERSION,
    submissions: Array.isArray(source.submissions) ? source.submissions : [],
    nonces: Array.isArray(source.nonces) ? source.nonces : [],
    walletSessions: Array.isArray(source.walletSessions) ? source.walletSessions : [],
    operators: Array.isArray(source.operators) ? source.operators : [],
    operatorCredentials: Array.isArray(source.operatorCredentials) ? source.operatorCredentials : [],
    operatorSessions: Array.isArray(source.operatorSessions) ? source.operatorSessions : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog : [],
  };
}

export function readStoreFile(file = getBackendDbFile()) {
  if (!fs.existsSync(file)) {
    return emptyStore();
  }

  try {
    return normalizeStore(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (error) {
    throw new Error(`Failed to read backend alpha store: ${error.message}`);
  }
}

export function writeStoreFile(store, file = getBackendDbFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = normalizeStore(store);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return next;
}

export function summarizeStore(store = {}) {
  const normalized = normalizeStore(store);
  const publishedSubmissions = normalized.submissions.filter((submission) => submission?.status === "published");
  const mediaReferences = normalized.submissions.reduce((total, submission) => {
    return total + (Array.isArray(submission?.media) ? submission.media.length : 0);
  }, 0);
  const creatorUpdates = normalized.submissions.reduce((total, submission) => {
    return total + (Array.isArray(submission?.updates) ? submission.updates.length : 0);
  }, 0);

  return {
    version: normalized.version,
    submissions: normalized.submissions.length,
    published: publishedSubmissions.length,
    publishRecords: publishedSubmissions.filter((submission) => submission?.publish).length,
    mediaReferences,
    creatorUpdates,
    nonces: normalized.nonces.length,
    walletSessions: normalized.walletSessions.length,
    operators: normalized.operators.length,
    auditEvents: normalized.auditLog.length,
  };
}

export function validateStoreSnapshot(store = {}) {
  const normalized = normalizeStore(store);
  const warnings = [];

  if (store?.version && store.version !== STORE_VERSION) {
    warnings.push(`store version ${store.version} will be normalized to version ${STORE_VERSION}`);
  }

  for (const [index, submission] of normalized.submissions.entries()) {
    if (!submission?.id) warnings.push(`submissions[${index}] is missing id`);
    if (!submission?.status) warnings.push(`submissions[${index}] is missing status`);
    if (submission?.status === "published" && !submission.publish) {
      warnings.push(`submissions[${index}] is published without a publish record`);
    }
  }

  return {
    ok: warnings.length === 0,
    store: normalized,
    summary: summarizeStore(normalized),
    warnings,
  };
}

export function safeConfigSnapshot(env = process.env) {
  return {
    nodeEnv: env.NODE_ENV || "development",
    backendDbConfigured: Boolean(env.TESLA_CROWDFUND_BACKEND_DB || env.DATABASE_URL),
    storageDriver: env.STORAGE_DRIVER || (env.DATABASE_URL ? "postgres" : "file"),
    corsOrigin: env.CORS_ORIGIN || "*",
    operatorAuthConfigured: Boolean(env.DATABASE_URL || env.TESLA_CROWDFUND_BACKEND_DB),
  };
}

export function buildBackupPayload(store = {}, options = {}) {
  const normalized = normalizeStore(store);
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: options.exportedAt || new Date().toISOString(),
    sourceFile: options.sourceFile || getBackendDbFile(),
    config: options.config || safeConfigSnapshot(),
    summary: summarizeStore(normalized),
    store: normalized,
  };
}

export function unpackBackupPayload(payload = {}) {
  const source = payload?.schema === BACKUP_SCHEMA && payload.store ? payload.store : payload;
  return validateStoreSnapshot(source);
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
