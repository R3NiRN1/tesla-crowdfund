import type { Address, Hash } from "viem";

export type TransactionRecoveryHint = {
  hash: Hash;
  chainId: number;
  account: Address;
  target: Address;
};

const PREFIX = "tes-wallet-recovery:v1:";
const volatileHints = new Map<string, TransactionRecoveryHint>();
const dirtyHints = new Set<string>();
const reservedRequests = new Set<string>();
const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

// A non-authoritative safety lock, not proof that a transaction was sent.
export function markTransactionRequest(key: string): boolean {
  reservedRequests.add(key);
  if (typeof window === "undefined") return false;
  try { window.sessionStorage.setItem(PREFIX + "request:" + key, "1"); return true; }
  catch { return false; }
}

export function hasTransactionRequest(key: string): boolean {
  if (reservedRequests.has(key)) return true;
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(PREFIX + "request:" + key) !== null; }
  catch { return false; }
}

export function clearTransactionRequest(key: string): void {
  reservedRequests.delete(key);
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(PREFIX + "request:" + key); } catch { /* No authoritative state is stored. */ }
}

function parseHint(value: unknown): TransactionRecoveryHint | null {
  if (!value || typeof value !== "object") return null;
  const hint = value as Partial<TransactionRecoveryHint>;
  if (typeof hint.hash !== "string" || !hashPattern.test(hint.hash)
    || !Number.isSafeInteger(hint.chainId) || Number(hint.chainId) <= 0
    || typeof hint.account !== "string" || !addressPattern.test(hint.account)
    || typeof hint.target !== "string" || !addressPattern.test(hint.target)) return null;
  return { hash: hint.hash, chainId: hint.chainId as number, account: hint.account, target: hint.target };
}

// Public transaction hints only. RPC receipts and backend proof remain authoritative.
export function readTransactionRecovery(key: string): TransactionRecoveryHint | null {
  if (typeof window === "undefined") return null;
  const unsaved = dirtyHints.has(key) && volatileHints.get(key);
  if (unsaved) return { ...unsaved };
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw) {
      const record = JSON.parse(raw);
      const hint = record.version === 1 ? parseHint(record) : null;
      if (hint) {
        volatileHints.set(key, hint);
        return { ...hint };
      }
      window.sessionStorage.removeItem(PREFIX + key);
      volatileHints.delete(key);
      return null;
    }
  } catch { /* Storage may be unavailable; retain only this tab's in-memory hint. */ }
  const hint = volatileHints.get(key);
  return hint ? { ...hint } : null;
}

export function saveTransactionRecovery(key: string, value: TransactionRecoveryHint): boolean {
  if (typeof window === "undefined") return false;
  const hint = parseHint(value);
  if (!hint) throw new Error("Invalid wallet transaction recovery hint");
  volatileHints.set(key, hint);
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ version: 1, ...hint }));
    dirtyHints.delete(key);
    return true;
  } catch { dirtyHints.add(key); return false; }
}

export function clearTransactionRecovery(key: string, expectedHash?: Hash): void {
  if (typeof window === "undefined") return;
  if (expectedHash && readTransactionRecovery(key)?.hash.toLowerCase() !== expectedHash.toLowerCase()) return;
  volatileHints.delete(key);
  dirtyHints.delete(key);
  try { window.sessionStorage.removeItem(PREFIX + key); } catch { /* No authority is stored here. */ }
}
