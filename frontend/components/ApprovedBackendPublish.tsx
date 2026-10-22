"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { encodeFunctionData, parseEventLogs, UserRejectedRequestError, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { BackendClientError, recordBackendPublish, type BackendSubmission } from "@/lib/backendClient";
import { campaignFactoryMetadataWriteAbi } from "@/lib/campaignFactoryMetadataWriteAbi";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { clearTransactionRecovery, clearTransactionRequest, hasTransactionRequest, markTransactionRequest,
  readTransactionRecovery, saveTransactionRecovery, type TransactionRecoveryHint } from "@/lib/transactionRecovery";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { usePublicConfig } from "@/lib/usePublicConfig";

function chainLabel(chainId?: number | null) {
  if (chainId === 97) return "BSC testnet";
  if (chainId === 56) return "BSC mainnet";
  return chainId ? `chain ${chainId}` : "not set";
}

function short(value?: string | null) {
  if (!value) return "-";
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function createArgs(submission: BackendSubmission) {
  return [
    submission.contractInput.description,
    submission.metadataURI,
    BigInt(submission.contractInput.goal),
    BigInt(submission.contractInput.duration),
    submission.contractInput.milestoneDescriptions,
    submission.contractInput.milestoneAmounts.map((amount) => BigInt(amount)),
  ] as const;
}

// These tab-local locks bridge wallet prompts and component remounts, not publication truth.
const walletRequests = new Set<string>();
type WalletIntent = Omit<TransactionRecoveryHint, "hash">;
const walletIntents = new Map<string, WalletIntent>();
const unavailableStorageKeys = new Set<string>();
const intentScopeKey = (key: string, intent: WalletIntent) => `${key}:scope:${intent.chainId}:${intent.target.toLowerCase()}`;
function readWalletIntent(key: string, expected: WalletIntent): { blocked: boolean; intent: WalletIntent | null } {
  if (!hasTransactionRequest(key)) return { blocked: false, intent: null };
  const known = walletIntents.get(key);
  return { blocked: true, intent: known ?? (hasTransactionRequest(intentScopeKey(key, expected)) ? expected : null) };
}
function saveWalletIntent(key: string, intent: WalletIntent) {
  walletIntents.set(key, intent);
  const reserved = markTransactionRequest(key);
  const scoped = markTransactionRequest(intentScopeKey(key, intent));
  if (!reserved || !scoped) unavailableStorageKeys.add(key);
  return reserved && scoped;
}
function clearWalletIntent(key: string, intent: WalletIntent | null) {
  walletIntents.delete(key);
  clearTransactionRequest(key);
  if (intent) clearTransactionRequest(intentScopeKey(key, intent));
}
function isUserRejection(error: unknown) {
  let cause = error;
  for (let depth = 0; depth < 10 && cause && typeof cause === "object"; depth++) {
    if (cause instanceof UserRejectedRequestError || (cause as { code?: unknown }).code === 4001) return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}
const recoveryListeners = new Set<() => void>();
const verificationRequests = new Map<string, Promise<BackendSubmission>>();
const notifyRecovery = () => recoveryListeners.forEach((listener) => listener());
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
function matchesReceipt(receipt: TransactionReceipt | undefined, hint: TransactionRecoveryHint | null) {
  return Boolean(receipt && hint && same(receipt.transactionHash, hint.hash)
    && same(receipt.from, hint.account) && same(receipt.to, hint.target));
}

export default function ApprovedBackendPublish({
  submission,
  onPublished,
}: {
  submission: BackendSubmission;
  onPublished: (submission: BackendSubmission) => void;
}) {
  const publicConfig = usePublicConfig();
  const networkGuard = useNetworkGuard();
  const { address, isConnected } = useAccount();
  const scope = JSON.stringify([submission.id, submission.creatorAddress.toLowerCase(), submission.metadataURI,
    submission.contractInput, publicConfig.chainId, publicConfig.factoryAddress.toLowerCase(), address?.toLowerCase(),
    isConnected, networkGuard.actualChainId, networkGuard.blockWrites, publicConfig.isConfigured,
    submission.status, submission.readiness.state]);
  return <PublishScope key={scope} {...{ submission, onPublished, publicConfig, networkGuard, address, isConnected }} />;
}

function PublishScope({ submission, onPublished, publicConfig, networkGuard, address, isConnected }: {
  submission: BackendSubmission;
  onPublished: (submission: BackendSubmission) => void;
  publicConfig: ReturnType<typeof usePublicConfig>;
  networkGuard: ReturnType<typeof useNetworkGuard>;
  address: `0x${string}` | undefined;
  isConnected: boolean;
}) {
  const recoveryKey = `creator-publish:${submission.id}:${submission.creatorAddress.toLowerCase()}`;
  const [transaction, setTransaction] = useState<TransactionRecoveryHint | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletContext, setWalletContext] = useState<WalletIntent | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [manualHash, setManualHash] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [recordedHash, setRecordedHash] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [lookupVersion, setLookupVersion] = useState(0);
  const [rpcReceipt, setRpcReceipt] = useState<TransactionReceipt>();
  const [replacementBlocked, setReplacementBlocked] = useState(false);
  const alive = useRef(false);
  const currentTransaction = useRef(transaction);
  const callback = useRef(onPublished);
  const attempted = useRef<string | null>(null);
  const recordingRef = useRef(false);
  const verified = useRef(false);
  const intent = useRef<WalletIntent | null>(null);
  useLayoutEffect(() => { callback.current = onPublished; currentTransaction.current = transaction; });
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const sync = () => {
      const pending = readWalletIntent(recoveryKey, {
        account: submission.creatorAddress as `0x${string}`, target: publicConfig.factoryAddress as `0x${string}`,
        chainId: publicConfig.chainId ?? 0,
      });
      setWalletBusy(pending.blocked);
      setWalletContext(pending.intent);
      setPromptOpen(walletRequests.has(recoveryKey));
      setStorageUnavailable(unavailableStorageKeys.has(recoveryKey));
      const next = readTransactionRecovery(recoveryKey);
      setTransaction((current) => current && next && same(current.hash, next.hash)
        && current.chainId === next.chainId && same(current.account, next.account)
        && same(current.target, next.target) ? current : next);
      setRecoveryReady(true);
    };
    recoveryListeners.add(sync);
    sync();
    return () => { recoveryListeners.delete(sync); };
  }, [recoveryKey, publicConfig.chainId, publicConfig.factoryAddress, submission.creatorAddress]);

  const walletFailed = (walletError: Error) => {
    walletRequests.delete(recoveryKey);
    const rejected = isUserRejection(walletError);
    if (rejected) {
      clearWalletIntent(recoveryKey, intent.current);
      intent.current = null;
    }
    notifyRecovery();
    if (alive.current) setError(rejected ? walletError.message
      : "Wallet response is uncertain. Recover the existing transaction hash; deployment remains locked.");
  };
  const { writeContract, isPending: walletPending, error: writeError } = useWriteContract({
    mutation: {
      // Mutation-level callbacks survive unmount while the wallet prompt is open.
      onSuccess: (hash) => {
        if (!intent.current) return;
        const saved = saveTransactionRecovery(recoveryKey, { ...intent.current, hash });
        walletRequests.delete(recoveryKey);
        if (saved) {
          clearWalletIntent(recoveryKey, intent.current);
          unavailableStorageKeys.delete(recoveryKey);
        } else unavailableStorageKeys.add(recoveryKey);
        intent.current = null;
        notifyRecovery();
      },
      onError: walletFailed,
    },
  });
  const validHint = Boolean(transaction && same(transaction.account, submission.creatorAddress)
    && same(transaction.target, publicConfig.factoryAddress) && transaction.chainId === publicConfig.chainId);
  const receipt = useWaitForTransactionReceipt({
    hash: validHint ? transaction?.hash : undefined,
    chainId: transaction?.chainId ?? publicConfig.chainId ?? undefined,
    // Viem can skip onReplaced when resolving a cached receipt at a larger depth.
    confirmations: 1,
    onReplaced: ({ reason, transaction: replacement, replacedTransaction, transactionReceipt }) => {
      const previous = currentTransaction.current;
      if (!alive.current || !previous || !same(replacedTransaction?.hash, previous.hash)) return;
      let input: `0x${string}`;
      try {
        input = encodeFunctionData({ abi: campaignFactoryMetadataWriteAbi,
          functionName: "createCampaignWithMetadata", args: createArgs(submission) });
      } catch {
        setReplacementBlocked(true);
        setError("Replacement cannot be matched to the approved contract input. Deployment remains locked.");
        return;
      }
      if (reason !== "repriced" || !same(replacement.from, previous.account)
        || !same(replacement.to, previous.target) || replacement.input !== input
        || !matchesReceipt(transactionReceipt, { ...previous, hash: replacement.hash })) {
        setReplacementBlocked(true);
        setError("Transaction was cancelled or replaced. Publication remains locked pending independent resolution.");
        return;
      }
      const next = { ...previous, hash: replacement.hash };
      currentTransaction.current = next;
      if (!saveTransactionRecovery(recoveryKey, next)) {
        saveWalletIntent(recoveryKey, next);
        unavailableStorageKeys.add(recoveryKey);
      }
      setRpcReceipt(undefined);
      notifyRecovery();
    },
  });
  const publicClient = usePublicClient({ chainId: transaction?.chainId ?? publicConfig.chainId ?? undefined });

  // Wagmi throws for reverted receipts. Only a separately fetched, matching receipt can unlock a retry.
  useEffect(() => {
    if (!validHint || !transaction || !receipt.error || !publicClient || replacementBlocked) return;
    const hint = transaction;
    let active = true;
    void publicClient.getTransactionReceipt({ hash: hint.hash }).then((proof) => {
      if (active && alive.current && same(currentTransaction.current?.hash, hint.hash)) setRpcReceipt(proof);
    }).catch(() => { /* Unknown receipt state must retain the deployment lock. */ });
    return () => { active = false; };
  }, [validHint, transaction, receipt.error, publicClient, replacementBlocked, lookupVersion]);

  const evidence = receipt.data ?? rpcReceipt;
  const receiptMatches = validHint && matchesReceipt(evidence, transaction);
  let campaignAddress: `0x${string}` | undefined;
  if (receiptMatches && evidence?.status === "success") {
    try {
      const events = parseEventLogs({ abi: campaignFactoryMetadataWriteAbi, logs: evidence.logs,
        eventName: "CampaignV2Created" });
      campaignAddress = events.find((event) => same(event.address, transaction?.target)
        && same(event.args.owner, transaction?.account) && event.args.metadataURI === submission.metadataURI)?.args.campaign;
    } catch { /* Malformed or unrelated logs are not publication evidence. */ }
  }

  const creatorMatches = Boolean(address) && address?.toLowerCase() === submission.creatorAddress.toLowerCase();
  const factoryReady = /^0x[a-fA-F0-9]{40}$/.test(publicConfig.factoryAddress)
    && publicConfig.factoryAddress.toLowerCase() !== ZERO_ADDRESS;
  const alreadyPublished = submission.status === "published" || Boolean(submission.publish);
  const canVerify = validHint && receiptMatches && evidence?.status === "success" && Boolean(campaignAddress)
    && creatorMatches && isConnected && networkGuard.blockWrites === false && publicConfig.isConfigured
    && submission.status === "approved" && !alreadyPublished && !replacementBlocked && !recordedHash;
  const disabledReasons = (() => {
    const reasons: string[] = [];
    if (!recoveryReady) reasons.push("Loading transaction recovery state.");
    if (submission.status !== "approved") reasons.push("Submission is not approved for publishing.");
    if (submission.readiness.state !== "contract-ready") reasons.push("Submission is not contract-ready.");
    if (alreadyPublished) reasons.push("Backend already records this submission as published.");
    if (!submission.metadataURI) reasons.push("Approved metadata URI is missing.");
    if (!isConnected) reasons.push("Connect the approved creator wallet.");
    if (isConnected && !creatorMatches) reasons.push("Connected wallet does not match the approved creator address.");
    if (!publicConfig.isConfigured || !factoryReady) reasons.push("Factory configuration is incomplete.");
    if (networkGuard.blockWrites !== false) {
      reasons.push(networkGuard.message || "Switch to the configured network.");
    }
    if (walletPending) reasons.push("Wallet confirmation is open.");
    if (walletBusy) reasons.push("Wallet publication is already in progress.");
    if (transaction) reasons.push(validHint ? "A publication transaction is awaiting independent resolution."
      : "Saved transaction context does not match this approved publication. Deployment remains locked.");
    if (recordedHash) reasons.push("Backend publication has been independently verified.");
    if (recording) reasons.push("Backend is independently verifying the transaction.");
    return reasons;
  })();

  useEffect(() => {
    if (!canVerify || !transaction || !campaignAddress || recordingRef.current || verified.current) return;
    const attemptKey = JSON.stringify([submission.id, submission.metadataURI, submission.contractInput, transaction]);
    const attempt = `${attemptKey}:${retryVersion}`;
    if (attempted.current === attempt) return;
    attempted.current = attempt;
    recordingRef.current = true;
    setRecording(true);
    setError(null);
    let request = verificationRequests.get(attemptKey);
    if (!request) {
      request = recordBackendPublish(submission.id, {
        transactionHash: transaction.hash,
        campaignAddress,
        factoryAddress: transaction.target,
        chainId: transaction.chainId,
        metadataURI: submission.metadataURI,
        publisherAddress: transaction.account,
      });
      verificationRequests.set(attemptKey, request);
      const release = () => { if (verificationRequests.get(attemptKey) === request) verificationRequests.delete(attemptKey); };
      void request.then(release, release);
    }
    void request
      .then((updated) => {
        if (!alive.current || verified.current || !same(currentTransaction.current?.hash, transaction.hash)) return;
        const proof = updated.publish;
        if (updated.id !== submission.id || !same(updated.creatorAddress, transaction.account)
          || updated.status !== "published" || updated.metadataURI !== submission.metadataURI
          || proof?.verifiedOnChain !== true || !same(proof.transactionHash, transaction.hash)
          || !same(proof.campaignAddress, campaignAddress) || !same(proof.factoryAddress, transaction.target)
          || !same(proof.publisherAddress, transaction.account) || proof.chainId !== transaction.chainId
          || proof.metadataURI !== submission.metadataURI) {
          throw new Error("Backend publication response did not match the pending approved transaction.");
        }
        verified.current = true;
        // Retain the public hint so a remount with stale approved props cannot deploy again.
        setRecordedHash(transaction.hash);
        if (hasTransactionRequest(recoveryKey)) {
          if (saveTransactionRecovery(recoveryKey, transaction)) {
            clearWalletIntent(recoveryKey, transaction);
            unavailableStorageKeys.delete(recoveryKey);
          } else unavailableStorageKeys.add(recoveryKey);
          notifyRecovery();
        }
        setMessage("Transaction independently verified on-chain and backend publish record saved.");
        try { callback.current(updated); }
        catch { setError("Publication verified, but the campaign view could not refresh."); }
      })
      .catch((requestError) => {
        if (alive.current && same(currentTransaction.current?.hash, transaction.hash)) setError(requestError instanceof BackendClientError || requestError instanceof Error
          ? requestError.message : "Backend chain verification failed.");
      })
      .finally(() => {
        recordingRef.current = false;
        if (alive.current) setRecording(false);
      });
  }, [canVerify, transaction, campaignAddress, submission, retryVersion, recoveryKey, recording]);

  useEffect(() => {
    if (!receiptMatches || evidence?.status !== "reverted" || !transaction || replacementBlocked || !publicClient
      || typeof evidence.blockNumber !== "bigint") return;
    // A candidate hash cannot prove the outcome of a different, uncertain wallet request.
    if (hasTransactionRequest(recoveryKey)) return;
    let active = true;
    void publicClient.getBlockNumber({ cacheTime: 0 }).then(async (latestBlock) => {
      if (!active || !alive.current || !same(currentTransaction.current?.hash, transaction.hash)) return;
      if (latestBlock < evidence.blockNumber + 2n) {
        setError("Reverted transaction is awaiting three confirmations. Deployment remains locked.");
        return;
      }
      const canonical = await publicClient.getTransactionReceipt({ hash: transaction.hash });
      if (!active || !alive.current || !same(currentTransaction.current?.hash, transaction.hash)) return;
      if (!matchesReceipt(canonical, transaction) || canonical.status !== "reverted"
        || canonical.blockNumber !== evidence.blockNumber || !same(canonical.blockHash, evidence.blockHash)) {
        setError("Reverted receipt is no longer canonical. Deployment remains locked.");
        return;
      }
      if (hasTransactionRequest(recoveryKey)) return;
      clearTransactionRecovery(recoveryKey, transaction.hash);
      setRpcReceipt(undefined);
      setError("Publish transaction reverted. Backend was not updated.");
      notifyRecovery();
    }).catch(() => { /* Unknown confirmation depth must retain the deployment lock. */ });
    return () => { active = false; };
  }, [receiptMatches, evidence, transaction, replacementBlocked, recoveryKey, publicClient, lookupVersion]);

  const publish = () => {
    if (disabledReasons.length > 0 || hasTransactionRequest(recoveryKey) || readTransactionRecovery(recoveryKey)
      || !address || !publicConfig.chainId) return;
    let args: ReturnType<typeof createArgs>;
    try {
      args = createArgs(submission);
      encodeFunctionData({ abi: campaignFactoryMetadataWriteAbi, functionName: "createCampaignWithMetadata", args });
    } catch {
      setError("Approved contract input is invalid. No wallet request was sent.");
      return;
    }
    setError(null);
    setMessage(null);
    intent.current = { account: address, chainId: publicConfig.chainId,
      target: publicConfig.factoryAddress as `0x${string}` };
    saveWalletIntent(recoveryKey, intent.current);
    walletRequests.add(recoveryKey);
    notifyRecovery();
    try { writeContract(
      {
        account: address,
        chainId: publicConfig.chainId,
        address: publicConfig.factoryAddress as `0x${string}`,
        abi: campaignFactoryMetadataWriteAbi,
        functionName: "createCampaignWithMetadata",
        args,
      },
    ); } catch (walletError) { walletFailed(walletError instanceof Error ? walletError : new Error("Wallet publication failed.")); }
  };

  const canRecover = !transaction && walletBusy && !promptOpen && creatorMatches && isConnected
    && Boolean(walletContext && same(walletContext.account, submission.creatorAddress)
      && same(walletContext.target, publicConfig.factoryAddress) && walletContext.chainId === publicConfig.chainId)
    && /^0x[a-fA-F0-9]{64}$/.test(manualHash);
  const recoverHash = () => {
    if (!canRecover || !walletContext) return;
    if (!saveWalletIntent(recoveryKey, walletContext)) {
      setError("Transaction hint was not saved because the unresolved wallet request could not be retained.");
      notifyRecovery();
      return;
    }
    const saved = saveTransactionRecovery(recoveryKey, { ...walletContext, hash: manualHash as `0x${string}` });
    if (saved) unavailableStorageKeys.delete(recoveryKey);
    else unavailableStorageKeys.add(recoveryKey);
    setError(null);
    notifyRecovery();
  };

  const hash = transaction?.hash ?? recordedHash ?? submission.publish?.transactionHash;
  const explorerUrl = publicConfig.bscscanBase && hash
    ? `${publicConfig.bscscanBase.replace(/\/$/, "")}/tx/${hash}`
    : null;

  return (
    <div className="draft-item" style={{ marginTop: 12 }}>
      <div className="split-row">
        <div>
          <strong>Approved creator publish</strong>
          <div className="small muted">Creator wallet calls CampaignFactoryV2. The backend independently verifies the resulting chain evidence before recording publication.</div>
        </div>
        <span className={`badge ${alreadyPublished || recordedHash ? "badge-success" : "badge-muted"}`}>
          {alreadyPublished || recordedHash ? "published" : recording ? "verifying" : transaction ? "awaiting verification" : walletBusy ? "wallet recovery pending" : "ready"}
        </span>
      </div>

      {walletBusy && !transaction && !alreadyPublished && (
        <div style={{ marginTop: 12 }}>
          <label>Publication transaction hash
            <input aria-label="Publication transaction hash" type="text" value={manualHash}
              onChange={(event) => setManualHash(event.target.value.trim())} autoComplete="off" spellCheck={false} />
          </label>
          <button type="button" className="button-secondary" disabled={!canRecover} onClick={recoverHash}>
            Track existing transaction
          </button>
        </div>
      )}
      {walletBusy && !alreadyPublished && !recordedHash && (
        <div className="panel-warning" style={{ marginTop: 10 }}>
          A manually supplied hash is a recovery hint, not proof of the original wallet request&apos;s outcome.
          Deployment remains locked pending independent reconciliation.
        </div>
      )}

      <div className="trust-grid" style={{ marginTop: 12 }}>
        <div className="trust-note">
          <strong>Publish steps</strong>
          <span>Confirm the approved creator wallet, send createCampaignWithMetadata, then wait while the backend independently verifies the BSC transaction.</span>
        </div>
        <div className="trust-note">
          <strong>Verification boundary</strong>
          <span>The browser may display transaction details, but backend publication authority comes from its own configured RPC, V2 factory, token and arbitrator checks.</span>
        </div>
        <div className="trust-note">
          <strong>Creator consent</strong>
          <span>Publishing makes the campaign address, creator wallet, metadata URI, media references, and transaction hash public.</span>
        </div>
        <div className="trust-note">
          <strong>Network mode</strong>
          <span>{publicConfig.chainId === 56 ? "Mainnet publish uses real assets and permanent public records." : "Testnet publish is a rehearsal transaction and may be redeployed before mainnet."}</span>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-item"><strong>Creator</strong>{short(submission.creatorAddress)}</div>
        <div className="detail-item"><strong>Factory</strong>{short(publicConfig.factoryAddress)}</div>
        <div className="detail-item"><strong>Network</strong>{chainLabel(publicConfig.chainId)}</div>
        <div className="detail-item"><strong>Metadata</strong>{submission.metadataURI}</div>
      </div>

      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={publish}
          disabled={disabledReasons.length > 0}
          className={disabledReasons.length > 0 ? "button-disabled" : "button-primary"}
        >
          Publish from creator wallet
        </button>
        {transaction && !alreadyPublished && !recordedHash && (
          <button type="button" className="button-secondary" disabled={!canVerify || recording}
            onClick={() => { if (!recordingRef.current) setRetryVersion((version) => version + 1); }}>
            Retry backend verification
          </button>
        )}
        {transaction && validHint && !recordedHash && !alreadyPublished && (
          <button type="button" className="button-secondary" disabled={recording || receipt.isFetching}
            onClick={() => { setLookupVersion((version) => version + 1); void receipt.refetch().catch(() => {}); }}>
            Retry transaction tracking
          </button>
        )}
        {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction</a>}
      </div>

      {disabledReasons.length > 0 && !alreadyPublished && (
        <div className="panel-warning" style={{ marginTop: 10 }}>
          <strong>Publishing disabled</strong>
          <ul style={{ marginBottom: 0 }}>{disabledReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>
      )}
      {submission.publish && (
        <div className="panel-success" style={{ marginTop: 10 }}>
          Verified backend record: campaign {short(submission.publish.campaignAddress)}, transaction {short(submission.publish.transactionHash)}.
        </div>
      )}
      {message && <div className="panel-success" style={{ marginTop: 10 }}>{message}</div>}
      {storageUnavailable && (
        <div className="panel-warning" style={{ marginTop: 10 }}>Session recovery is unavailable. Keep this tab open and retain the transaction hash.</div>
      )}
      {transaction && evidence && (!receiptMatches || (evidence.status === "success" && !campaignAddress)) && (
        <div className="panel-danger" style={{ marginTop: 10 }}>Receipt does not establish the approved factory publication. Deployment remains locked.</div>
      )}
      {(error || writeError || receipt.error) && (
        <div className="panel-danger" style={{ marginTop: 10 }}>
          {error || writeError?.message || receipt.error?.message}
        </div>
      )}
    </div>
  );
}
