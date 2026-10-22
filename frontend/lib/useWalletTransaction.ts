"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";
import { useBlockNumber, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { clearTransactionRecovery, clearTransactionRequest, hasTransactionRequest, markTransactionRequest, readTransactionRecovery, saveTransactionRecovery, type TransactionRecoveryHint } from "./transactionRecovery";

// A tab-local synchronous reservation covers the wallet prompt, including component remounts.
const signing = new Set<string>();
const unknownSubmissions = new Set<string>();
const listeners = new Set<() => void>();
const requestOrigins = new WeakMap<object, { key: string; hint: Omit<TransactionRecoveryHint, "hash"> }>();
function notify() { for (const listener of listeners) listener(); }

function isUserRejection(value: unknown): boolean {
  const seen = new Set<unknown>();
  let current = value;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const error = current as { code?: number; name?: string; cause?: unknown };
    if (error.code === 4001 || error.name === "UserRejectedRequestError") return true;
    current = error.cause;
  }
  return false;
}

export function useWalletTransaction({ recoveryKey, account, chainId, targets, onSuccess }: {
  recoveryKey: string;
  account?: Address;
  chainId: number | null;
  targets: readonly Address[];
  onSuccess: (receipt: TransactionReceipt) => void;
}) {
  const [tracking, setTracking] = useState<{ scope: string; hint: TransactionRecoveryHint } | null>(null);
  const pending = tracking?.scope === recoveryKey ? tracking.hint : null;
  const [ready, setReady] = useState(false);
  const [promptPending, setPromptPending] = useState(false);
  const [needsHash, setNeedsHash] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provenReceipt, setProvenReceipt] = useState<TransactionReceipt | null>(null);
  const completed = useRef(new Set<Hash>());
  const replacement = useRef<{ reason: string; hash: Hash } | null>(null);
  const currentPending = useRef(pending);
  useLayoutEffect(() => { currentPending.current = pending; }, [pending]);
  const allowedTargets = targets.map((target) => target.toLowerCase()).join(",");

  useEffect(() => {
    const refresh = () => {
      const hint = readTransactionRecovery(recoveryKey);
      const valid = hint && hint.chainId === chainId && hint.account.toLowerCase() === account?.toLowerCase()
        && allowedTargets.split(",").includes(hint.target.toLowerCase());
      setTracking(valid ? { scope: recoveryKey, hint } : null);
      if (hint && !valid) {
        // A mismatched hint never becomes authority or a confirmed transaction.
        clearTransactionRecovery(recoveryKey, hint.hash);
        setMessage("An invalid transaction recovery hint was discarded. Check your wallet history before sending.");
      }
      setPromptPending(signing.has(recoveryKey));
      setNeedsHash(unknownSubmissions.has(recoveryKey) || (!hint && !signing.has(recoveryKey) && hasTransactionRequest(recoveryKey)));
      setReady(true);
    };
    refresh();
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, [account, allowedTargets, chainId, recoveryKey]);

  const { writeContract, isPending, error } = useWriteContract({ mutation: {
    onSuccess(hash, input) {
      const origin = requestOrigins.get(input);
      if (!origin) return;
      saveTransactionRecovery(origin.key, { hash, ...origin.hint });
      signing.delete(origin.key);
      unknownSubmissions.delete(origin.key);
      clearTransactionRequest(origin.key);
      notify();
    },
    onError(error, input) {
      const origin = requestOrigins.get(input);
      if (!origin) return;
      if (isUserRejection(error)) { signing.delete(origin.key); unknownSubmissions.delete(origin.key); clearTransactionRequest(origin.key); }
      else unknownSubmissions.add(origin.key);
      notify();
    },
  } });
  const client = usePublicClient({ chainId: pending?.chainId ?? chainId ?? undefined });
  const receipt = useWaitForTransactionReceipt({
    hash: pending?.hash,
    chainId: pending?.chainId ?? chainId ?? undefined,
    // Viem can omit onReplaced with depth > 1. Capture identity first, confirm independently below.
    confirmations: 1,
    query: { enabled: Boolean(pending), retry: 1 },
    onReplaced(value) {
      const current = currentPending.current;
      if (!current || value.replacedTransaction.hash !== current.hash || value.transaction.from.toLowerCase() !== current.account.toLowerCase()) return;
      replacement.current = { reason: value.reason, hash: value.transactionReceipt.transactionHash };
      if (value.reason === "repriced" && value.transaction.to?.toLowerCase() === current.target.toLowerCase()) {
        saveTransactionRecovery(recoveryKey, { ...current, hash: value.transaction.hash });
        notify();
      }
    },
  });
  const { data: head } = useBlockNumber({ chainId: pending?.chainId ?? chainId ?? undefined,
    watch: Boolean(pending), query: { enabled: Boolean(pending) } });

  // Read the canonical receipt again after three confirmations, including reverted receipts.
  useEffect(() => {
    if (!pending || !client || (!receipt.data && !receipt.error)) return;
    let cancelled = false;
    const hash = receipt.data?.transactionHash ?? pending.hash;
    void client.getTransactionReceipt({ hash }).then(async (value) => {
      const latest = await client.getBlockNumber({ cacheTime: 0 });
      if (cancelled || value.transactionHash !== hash || latest < value.blockNumber + 2n) return;
      const canonical = await client.getTransactionReceipt({ hash });
      if (!cancelled && canonical.transactionHash === hash && canonical.blockNumber === value.blockNumber
        && canonical.blockHash === value.blockHash && canonical.status === value.status) setProvenReceipt(canonical);
    }).catch(() => { /* Unknown status must continue to block writes. */ });
    return () => { cancelled = true; };
  }, [client, head, pending, receipt.data, receipt.error]);

  useEffect(() => {
    if (!pending) return;
    if (pending.account.toLowerCase() !== account?.toLowerCase() || pending.chainId !== chainId) return;
    const result = provenReceipt;
    if (!result || completed.current.has(pending.hash)) return;
    const knownHash = result.transactionHash === pending.hash || result.transactionHash === replacement.current?.hash;
    if (!knownHash) return;
    const expected = result.from.toLowerCase() === pending.account.toLowerCase()
      && result.to?.toLowerCase() === pending.target.toLowerCase();
    const replaced = replacement.current && replacement.current.reason !== "repriced";
    if (!expected && !replaced) {
      setMessage("Receipt does not match this wallet action. Sending remains blocked.");
      return;
    }
    completed.current.add(pending.hash);
    clearTransactionRecovery(recoveryKey, pending.hash);
    setTracking(null);
    setProvenReceipt(null);
    setMessage(replaced ? "Transaction was cancelled or replaced. Review your wallet history before another action."
      : result.status === "reverted" ? "Transaction reverted. No success was recorded."
      : "Transaction confirmed on its original network.");
    notify();
    if (expected && !replaced && result.status === "success") onSuccess(result);
  }, [account, chainId, onSuccess, pending, provenReceipt, recoveryKey]);

  const blocked = !ready || promptPending || needsHash || isPending || Boolean(pending);
  const send = (input: Parameters<typeof writeContract>[0]) => {
    if (blocked || signing.has(recoveryKey) || hasTransactionRequest(recoveryKey) || readTransactionRecovery(recoveryKey) || !account || !chainId) return;
    if (!allowedTargets.split(",").includes(input.address.toLowerCase())) return;
    signing.add(recoveryKey);
    const persisted = markTransactionRequest(recoveryKey);
    setPromptPending(true);
    setMessage(persisted ? null : "Recovery storage is unavailable. Keep this tab open and retain the wallet transaction hash.");
    setProvenReceipt(null);
    replacement.current = null;
    const request = { ...input, account, chainId } as Parameters<typeof writeContract>[0];
    requestOrigins.set(request, { key: recoveryKey, hint: { account, chainId, target: input.address } });
    try { writeContract(request); }
    catch {
      unknownSubmissions.add(recoveryKey);
      notify();
    }
  };
  const retry = () => {
    void receipt.refetch();
    if (pending && client) void client.getTransactionReceipt({ hash: pending.hash }).then(async (value) => {
      if (value.status !== "reverted" || await client.getBlockNumber({ cacheTime: 0 }) < value.blockNumber + 2n) return;
      const canonical = await client.getTransactionReceipt({ hash: pending.hash });
      if (currentPending.current?.hash === pending.hash && canonical.transactionHash === pending.hash
        && canonical.blockHash === value.blockHash && canonical.blockNumber === value.blockNumber
        && canonical.status === "reverted") setProvenReceipt(canonical);
    }).catch(() => { /* A lookup failure is not evidence of failure on-chain. */ });
  };
  const recover = (hash: string, target: string) => {
    if (!needsHash || !account || !chainId || !/^0x[a-fA-F0-9]{64}$/.test(hash)
      || !allowedTargets.split(",").includes(target.toLowerCase())) return;
    saveTransactionRecovery(recoveryKey, { hash: hash as Hash, target: target as Address, account, chainId });
    signing.delete(recoveryKey);
    unknownSubmissions.delete(recoveryKey);
    clearTransactionRequest(recoveryKey);
    notify();
  };
  return { send, blocked, pending, promptPending: promptPending || isPending, retry, message,
    needsHash, recover, targets,
    error: error ? "Wallet request failed. Check your wallet before retrying." : null,
    statusUnknown: Boolean(pending && receipt.error),
  };
}
