"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Address, Hash, PublicClient, TransactionReceipt } from "viem";
import { useBlockNumber, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { clearTransactionRecovery, clearTransactionRequest, hasTransactionRequest, markTransactionRequest, readTransactionRecovery, saveTransactionRecovery, type TransactionRecoveryHint } from "./transactionRecovery";

// A tab-local synchronous reservation covers the wallet prompt, including component remounts.
const signing = new Set<string>();
const unknownSubmissions = new Set<string>();
const listeners = new Set<() => void>();
const requestOrigins = new WeakMap<object, { key: string; hint: Omit<TransactionRecoveryHint, "hash"> }>();
function notify() { for (const listener of listeners) listener(); }

type TransactionScope = { scope: string; hint: TransactionRecoveryHint };
type ReceiptProof = { context: TransactionScope; receipt: TransactionReceipt };
type Replacement = { context: TransactionScope; reason: string; hash: Hash };

function sameScope(left: TransactionScope | null | undefined, right: TransactionScope | null | undefined) {
  return Boolean(left && right && left.scope === right.scope && left.hint.chainId === right.hint.chainId
    && left.hint.hash.toLowerCase() === right.hint.hash.toLowerCase()
    && left.hint.account.toLowerCase() === right.hint.account.toLowerCase()
    && left.hint.target.toLowerCase() === right.hint.target.toLowerCase());
}

async function readCanonicalReceipt(client: Pick<PublicClient, "getTransactionReceipt" | "getBlockNumber">, hash: Hash) {
  const value = await client.getTransactionReceipt({ hash });
  if (value.transactionHash !== hash || await client.getBlockNumber({ cacheTime: 0 }) < value.blockNumber + 2n) return null;
  const canonical = await client.getTransactionReceipt({ hash });
  return canonical.transactionHash === hash && canonical.blockNumber === value.blockNumber
    && canonical.blockHash === value.blockHash && canonical.status === value.status ? canonical : null;
}

function receiptProof(previous: ReceiptProof | null, context: TransactionScope, receipt: TransactionReceipt): ReceiptProof {
  return previous && sameScope(previous.context, context) && previous.receipt.transactionHash === receipt.transactionHash
    && previous.receipt.blockHash === receipt.blockHash && previous.receipt.blockNumber === receipt.blockNumber
    && previous.receipt.status === receipt.status && previous.receipt.from === receipt.from && previous.receipt.to === receipt.to
    ? previous : { context, receipt };
}

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
  const [tracking, setTracking] = useState<TransactionScope | null>(null);
  const context = tracking?.scope === recoveryKey && tracking.hint.chainId === chainId
    && tracking.hint.account.toLowerCase() === account?.toLowerCase()
    && targets.some((target) => target.toLowerCase() === tracking.hint.target.toLowerCase()) ? tracking : null;
  const pending = context?.hint ?? null;
  const [ready, setReady] = useState(false);
  const [promptPending, setPromptPending] = useState(false);
  const [needsHash, setNeedsHash] = useState(false);
  const [unresolvedRequest, setUnresolvedRequest] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provenReceipt, setProvenReceipt] = useState<ReceiptProof | null>(null);
  const completed = useRef(new Set<string>());
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const activeReplacement = sameScope(replacement?.context, context) ? replacement : null;
  const currentContext = useRef(context);
  useLayoutEffect(() => { currentContext.current = context; }, [context]);
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
      const unresolved = hasTransactionRequest(recoveryKey);
      setUnresolvedRequest(unresolved);
      setPromptPending(signing.has(recoveryKey) && !unknownSubmissions.has(recoveryKey));
      setNeedsHash(!valid && (unknownSubmissions.has(recoveryKey) || (!signing.has(recoveryKey) && unresolved)));
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
      const persisted = saveTransactionRecovery(origin.key, { hash, ...origin.hint });
      signing.delete(origin.key);
      unknownSubmissions.delete(origin.key);
      if (persisted) clearTransactionRequest(origin.key);
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
      if (!context || !sameScope(context, currentContext.current)) return;
      const current = context.hint;
      if (value.replacedTransaction.hash !== current.hash || value.transaction.from.toLowerCase() !== current.account.toLowerCase()
        || value.transactionReceipt.transactionHash !== value.transaction.hash) return;
      setReplacement({ context, reason: value.reason, hash: value.transactionReceipt.transactionHash });
      if (value.reason === "repriced" && value.transaction.to?.toLowerCase() === current.target.toLowerCase()) {
        if (!saveTransactionRecovery(context.scope, { ...current, hash: value.transaction.hash })) {
          markTransactionRequest(context.scope);
          setMessage("Replacement recovery storage is unavailable. Keep this tab open and retain the replacement hash; another send remains blocked.");
        }
        notify();
      }
    },
  });
  const { data: head } = useBlockNumber({ chainId: pending?.chainId ?? chainId ?? undefined,
    watch: Boolean(pending), query: { enabled: Boolean(pending) } });

  // Read the canonical receipt again after three confirmations, including reverted receipts.
  useEffect(() => {
    if (!context || !client || (!receipt.data && !receipt.error && !activeReplacement)) return;
    let cancelled = false;
    const hash = activeReplacement?.hash ?? context.hint.hash;
    void readCanonicalReceipt(client, hash).then((canonical) => {
      if (!cancelled && canonical && sameScope(currentContext.current, context)) {
        setProvenReceipt((previous) => receiptProof(previous, context, canonical));
      }
    }).catch(() => { /* Unknown status must continue to block writes. */ });
    return () => { cancelled = true; };
  }, [activeReplacement, client, context, head, receipt.data, receipt.error]);

  useEffect(() => {
    if (!pending || !context || !sameScope(provenReceipt?.context, context)) return;
    if (pending.account.toLowerCase() !== account?.toLowerCase() || pending.chainId !== chainId) return;
    const result = provenReceipt?.receipt;
    const completionKey = JSON.stringify([recoveryKey, pending.chainId, pending.hash, pending.account, pending.target]);
    if (!result || completed.current.has(completionKey)) return;
    const knownHash = result.transactionHash === pending.hash || result.transactionHash === activeReplacement?.hash;
    if (!knownHash) return;
    const sameSender = result.from.toLowerCase() === pending.account.toLowerCase();
    const expected = sameSender
      && result.to?.toLowerCase() === pending.target.toLowerCase();
    const replaced = activeReplacement && activeReplacement.reason !== "repriced";
    if (!sameSender || (!expected && !replaced)) {
      setMessage("Receipt does not match this wallet action. Sending remains blocked.");
      return;
    }
    if (hasTransactionRequest(recoveryKey)) {
      setMessage("Receipt found, but this hash does not resolve the uncertain wallet request. Sending remains blocked pending independent reconciliation.");
      return;
    }
    completed.current.add(completionKey);
    clearTransactionRecovery(recoveryKey, pending.hash);
    setTracking(null);
    setProvenReceipt(null);
    setMessage(replaced ? "Transaction was cancelled or replaced. Review your wallet history before another action."
      : result.status === "reverted" ? "Transaction reverted. No success was recorded."
      : "Transaction confirmed on its original network.");
    notify();
    if (expected && !replaced && result.status === "success") onSuccess(result);
  }, [account, activeReplacement, chainId, context, onSuccess, pending, provenReceipt, recoveryKey]);

  const blocked = !ready || unresolvedRequest || promptPending || needsHash || isPending || Boolean(pending);
  const send = (input: Parameters<typeof writeContract>[0]) => {
    if (blocked || signing.has(recoveryKey) || hasTransactionRequest(recoveryKey) || readTransactionRecovery(recoveryKey) || !account || !chainId) return;
    if (!allowedTargets.split(",").includes(input.address.toLowerCase())) return;
    signing.add(recoveryKey);
    const persisted = markTransactionRequest(recoveryKey);
    setPromptPending(true);
    setMessage(persisted ? null : "Recovery storage is unavailable. Keep this tab open and retain the wallet transaction hash.");
    setProvenReceipt(null);
    setReplacement(null);
    const request = { ...input, account, chainId } as Parameters<typeof writeContract>[0];
    requestOrigins.set(request, { key: recoveryKey, hint: { account, chainId, target: input.address } });
    try { writeContract(request); }
    catch {
      unknownSubmissions.add(recoveryKey);
      notify();
    }
  };
  const retry = () => {
    void receipt.refetch().catch(() => {});
    if (context && client) void readCanonicalReceipt(client, activeReplacement?.hash ?? context.hint.hash).then((canonical) => {
      if (canonical && sameScope(currentContext.current, context)) {
        setProvenReceipt((previous) => receiptProof(previous, context, canonical));
      }
    }).catch(() => { /* A lookup failure is not evidence of failure on-chain. */ });
  };
  const recover = (hash: string, target: string) => {
    if (!needsHash || !account || !chainId || !/^0x[a-fA-F0-9]{64}$/.test(hash)
      || !allowedTargets.split(",").includes(target.toLowerCase())) return;
    if (!markTransactionRequest(recoveryKey)) {
      setMessage("Recovery hint was not saved because its safety lock could not be retained. Keep this tab open and reconcile the original wallet request independently.");
      notify();
      return;
    }
    saveTransactionRecovery(recoveryKey, { hash: hash as Hash, target: target as Address, account, chainId });
    signing.delete(recoveryKey);
    // A supplied hash cannot prove which transaction the uncertain request produced.
    notify();
  };
  return { send, blocked, pending, promptPending: promptPending || isPending, retry, message,
    needsHash, recover, targets,
    error: error ? "Wallet request failed. Check your wallet before retrying." : null,
    statusUnknown: Boolean(pending && receipt.error),
    unresolvedReceipt: Boolean(context && unresolvedRequest && sameScope(provenReceipt?.context, context)),
  };
}
