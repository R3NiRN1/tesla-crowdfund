"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { campaignFactoryWriteAbi } from "@/lib/campaignFactoryWriteAbi";
import {
  isDraftLocallyPublished,
  recordCampaignDraftPublish,
  type AuditLogEntry,
  type CampaignDraft,
} from "@/lib/localCampaigns";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { usePublicConfig } from "@/lib/usePublicConfig";

type PublishStatus =
  | "ready"
  | "wallet confirmation needed"
  | "transaction pending"
  | "transaction confirmed"
  | "transaction failed/rejected";

type PublishResult = {
  drafts: CampaignDraft[];
  auditLog: AuditLogEntry[];
};

const TESTNET_PUBLISH_NOTICE =
  "wallet-driven testnet alpha path; local record only; not backend verified; not production moderation";

function short(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function buildCreateCampaignArgs(draft: CampaignDraft) {
  return [
    draft.contractInput.description,
    BigInt(draft.contractInput.goal),
    BigInt(draft.contractInput.duration),
    draft.contractInput.milestoneDescriptions,
    draft.contractInput.milestoneAmounts.map((amount) => BigInt(amount)),
  ] as const;
}

export default function TestnetPublishDraft({
  draft,
  onPublished,
}: {
  draft: CampaignDraft;
  onPublished: (result: PublishResult) => void;
}) {
  const publicConfig = usePublicConfig();
  const networkGuard = useNetworkGuard();
  const { isConnected } = useAccount();
  const { writeContract, isPending: walletPending, error: writeError } = useWriteContract();

  const [publishStatus, setPublishStatus] = useState<PublishStatus>("ready");
  const [lastHash, setLastHash] = useState<`0x${string}` | null>(
    draft.publishMetadata?.transactionHash ? (draft.publishMetadata.transactionHash as `0x${string}`) : null
  );
  const [recordedHash, setRecordedHash] = useState<string | null>(draft.publishMetadata?.transactionHash ?? null);
  const [localError, setLocalError] = useState<string | null>(null);

  const receipt = useWaitForTransactionReceipt({
    hash: lastHash ?? undefined,
  });

  const locallyPublished = isDraftLocallyPublished(draft);
  const isContractReady = draft.readiness === "contract-ready";
  const isLocallyApproved = draft.reviewState === "locally approved";
  const factoryMissing = !publicConfig.factoryAddress || publicConfig.factoryAddress.toLowerCase() === ZERO_ADDRESS;
  const testnetConfigured = publicConfig.chainId === 97;
  const transactionBusy = walletPending || receipt.isLoading;

  const disabledReasons = useMemo(() => {
    const reasons: string[] = [];

    if (!isContractReady) reasons.push("Draft is not contract-ready.");
    if (!isLocallyApproved) reasons.push("Draft is not locally approved.");
    if (locallyPublished) reasons.push("Draft has already been locally marked as published-on-testnet.");
    if (!publicConfig.isConfigured) {
      reasons.push("App is in setup/read-only mode; configure BSC testnet before publishing.");
    }
    if (factoryMissing) reasons.push("Factory address is missing or ZERO_ADDRESS.");
    if (!testnetConfigured) reasons.push("Testnet alpha publish only supports BSC testnet (chainId 97).");
    if (!isConnected) reasons.push("Wallet is not connected.");
    if (networkGuard.isWrongNetwork) {
      reasons.push(networkGuard.message || "Wrong network: switch to the configured testnet before publishing.");
    }
    if (networkGuard.isMisconfigured) {
      reasons.push(networkGuard.message || "Missing chain configuration.");
    }
    if (walletPending) reasons.push("Wallet confirmation is already open.");
    if (receipt.isLoading) reasons.push("Transaction is pending confirmation.");

    return reasons;
  }, [
    factoryMissing,
    isConnected,
    isContractReady,
    isLocallyApproved,
    locallyPublished,
    networkGuard.isMisconfigured,
    networkGuard.isWrongNetwork,
    networkGuard.message,
    publicConfig.isConfigured,
    receipt.isLoading,
    testnetConfigured,
    walletPending,
  ]);

  const disabled = disabledReasons.length > 0;
  const displayedStatus: PublishStatus =
    locallyPublished || receipt.data?.status === "success"
      ? "transaction confirmed"
      : receipt.data?.status === "reverted"
      ? "transaction failed/rejected"
      : receipt.isLoading
      ? "transaction pending"
      : walletPending
      ? "wallet confirmation needed"
      : publishStatus;
  const transactionHash = draft.publishMetadata?.transactionHash ?? lastHash;
  const explorerUrl =
    publicConfig.bscscanBase && transactionHash
      ? `${publicConfig.bscscanBase.replace(/\/$/, "")}/tx/${transactionHash}`
      : null;

  useEffect(() => {
    if (receipt.data?.status !== "success" || !lastHash || recordedHash === lastHash) return;

    const chainId = networkGuard.actualChainId ?? publicConfig.chainId ?? 97;
    const result = recordCampaignDraftPublish({
      publishedAt: new Date().toISOString(),
      transactionHash: lastHash,
      factoryAddress: publicConfig.factoryAddress,
      chainId,
      draftId: draft.id,
      draftTitle: draft.title || "Untitled campaign",
    });

    setRecordedHash(lastHash);
    setPublishStatus("transaction confirmed");
    onPublished(result);
  }, [
    draft.id,
    draft.title,
    lastHash,
    networkGuard.actualChainId,
    onPublished,
    publicConfig.chainId,
    publicConfig.factoryAddress,
    receipt.data?.status,
    recordedHash,
  ]);

  useEffect(() => {
    if (receipt.data?.status === "reverted") {
      setPublishStatus("transaction failed/rejected");
    }
  }, [receipt.data?.status]);

  const publish = () => {
    if (disabled || transactionBusy) return;

    setLocalError(null);
    setPublishStatus("wallet confirmation needed");

    try {
      writeContract(
        {
          address: publicConfig.factoryAddress as `0x${string}`,
          abi: campaignFactoryWriteAbi,
          functionName: "createCampaign",
          args: buildCreateCampaignArgs(draft),
        },
        {
          onSuccess(hash) {
            setLastHash(hash);
            setPublishStatus("transaction pending");
          },
          onError(error) {
            setLocalError(error.message);
            setPublishStatus("transaction failed/rejected");
          },
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalError(message);
      setPublishStatus("transaction failed/rejected");
    }
  };

  return (
    <div className="draft-item" style={{ marginTop: 12 }}>
      <div className="split-row">
        <div>
          <strong>Testnet alpha publish</strong>
          <div className="small muted" style={{ marginTop: 4 }}>
            {TESTNET_PUBLISH_NOTICE}. User click and wallet confirmation are required; this never publishes
            automatically.
          </div>
        </div>
        <span className={`badge ${displayedStatus === "transaction confirmed" ? "badge-success" : "badge-muted"}`}>
          {displayedStatus}
        </span>
      </div>

      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={publish}
          disabled={disabled}
          className={disabled ? "button-disabled" : "button-primary"}
        >
          Publish to testnet
        </button>
        <span className="small muted">Factory: {short(publicConfig.factoryAddress)}</span>
        <span className="small muted">Chain: {publicConfig.chainId ?? "not set"}</span>
      </div>

      {disabledReasons.length > 0 && (
        <div className="panel-warning" style={{ marginTop: 10 }}>
          <strong>Publishing disabled</strong>
          <ul style={{ marginBottom: 0 }}>
            {disabledReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {transactionHash && (
        <div className="small muted" style={{ marginTop: 10 }}>
          Transaction:{" "}
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              {short(transactionHash)}
            </a>
          ) : (
            short(transactionHash)
          )}
        </div>
      )}

      {draft.publishMetadata && (
        <div className="panel-success" style={{ marginTop: 10 }}>
          Locally marked as published-on-testnet at {new Date(draft.publishMetadata.publishedAt).toLocaleString()}.
          This is a browser localStorage record only and is not backend verified.
        </div>
      )}

      {(localError || writeError || receipt.error) && (
        <div className="panel-danger" style={{ marginTop: 10 }}>
          Publish error:{" "}
          {localError || writeError?.message || receipt.error?.message || "Transaction failed or was rejected."}
        </div>
      )}
    </div>
  );
}
