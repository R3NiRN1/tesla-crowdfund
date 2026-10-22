import { expect, test, vi } from "vitest";
import { clearTransactionRecovery, readTransactionRecovery, saveTransactionRecovery } from "@/lib/transactionRecovery";
import type { TransactionRecoveryHint } from "@/lib/transactionRecovery";

const hint: TransactionRecoveryHint = { hash: `0x${"a".repeat(64)}`, chainId: 97,
  account: "0x1111111111111111111111111111111111111111", target: "0x2222222222222222222222222222222222222222" };
let sequence = 0;
const key = () => `recovery-test:${++sequence}`;
test("stored hints contain public identifiers only, never approval or publication truth", () => {
  const scope = key();
  saveTransactionRecovery(scope, { ...hint, published: true, authToken: "must-not-persist" } as TransactionRecoveryHint);
  expect(JSON.parse(sessionStorage.getItem(`tes-wallet-recovery:v1:${scope}`)!)).toEqual({ version: 1, ...hint });
  const result = readTransactionRecovery(scope)!;
  result.chainId = 56;
  expect(readTransactionRecovery(scope)?.chainId).toBe(97);
});
test.each(["hash", "account", "target", "chainId"])("invalid %s cannot be saved", (field) => {
  expect(() => saveTransactionRecovery(key(), { ...hint, [field]: field === "chainId" ? -1 : "bad" })).toThrow(/Invalid/);
});
test("stale completion cannot clear a newer transaction hint", () => {
  const scope = key();
  const other = `0x${"b".repeat(64)}` as const;
  saveTransactionRecovery(scope, { ...hint, hash: other });
  clearTransactionRecovery(scope, hint.hash);
  expect(readTransactionRecovery(scope)?.hash).toBe(other);
  clearTransactionRecovery(scope, other);
  expect(readTransactionRecovery(scope)).toBeNull();
});
test("unavailable browser storage preserves only the current tab memory fallback", () => {
  const scope = key();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage disabled"); });
  expect(saveTransactionRecovery(scope, hint)).toBe(false);
  expect(readTransactionRecovery(scope)).toEqual(hint);
  clearTransactionRecovery(scope, hint.hash);
  expect(readTransactionRecovery(scope)).toBeNull();
});
test("unknown versions and malformed public hints are not accepted", () => {
  const scope = key();
  sessionStorage.setItem(`tes-wallet-recovery:v1:${scope}`, JSON.stringify({ version: 2, ...hint }));
  expect(readTransactionRecovery(scope)).toBeNull();
  sessionStorage.setItem(`tes-wallet-recovery:v1:${scope}`, JSON.stringify({ version: 1, ...hint, chainId: "97" }));
  expect(readTransactionRecovery(scope)).toBeNull();
});

test("a failed replacement write retains the newer memory hint over stale storage", () => {
  const scope = key();
  const newer = { ...hint, hash: `0x${"b".repeat(64)}` as const };
  saveTransactionRecovery(scope, hint);
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
  expect(saveTransactionRecovery(scope, newer)).toBe(false);
  expect(readTransactionRecovery(scope)).toEqual(newer);
  storage.mockRestore();
  expect(readTransactionRecovery(scope)).toEqual(newer);
  expect(saveTransactionRecovery(scope, newer)).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(`tes-wallet-recovery:v1:${scope}`)!).hash).toBe(newer.hash);
  clearTransactionRecovery(scope, newer.hash);
  expect(readTransactionRecovery(scope)).toBeNull();
});
