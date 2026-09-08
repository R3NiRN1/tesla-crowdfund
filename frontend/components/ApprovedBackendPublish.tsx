"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { BackendClientError, recordBackendPublish, type BackendSubmission } from "@/lib/backendClient";
import { campaignFactoryMetadataWriteAbi } from "@/lib/campaignFactoryMetadataWriteAbi";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
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
  const { writeContract, isPending: walletPending, error: writeError } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | null>(
    submission.publish?.transactionHash as `0x${string}` | null ?? null,
  );
  const [recordedHash, setRecordedHash] = useState(submission.publish?.transactionHash ?? null);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const receipt = useWaitForTransactionReceipt({ hash: hash ?? undefined });

  const creatorMatches = Boolean(address) && address?.toLowerCase() === submission.creatorAddress.toLowerCase();
  const factoryReady = publicConfig.factoryAddress.toLowerCase() !== ZERO_ADDRESS;
  const alreadyPublished = submission.status === "published" || Boolean(submission.publish);

  const disabledReasons = useMemo(() => {
    const reasons: string[] = [];
    if (submission.status !== "approved") reasons.push("Submission is not approved for publishing.");
    if (submission.readiness.state !== "contract-ready") reasons.push("Submission is not contract-ready.");
    if (alreadyPublished) reasons.push("Backend already records this submission as published.");
    if (!submission.metadataURI) reasons.push("Approved metadata URI is missing.");
    if (!isConnected) reasons.push("Connect the approved creator wallet.");
    if (isConnected && !creatorMatches) reasons.push("Connected wallet does not match the approved creator address.");
    if (!publicConfig.isConfigured || !factoryReady) reasons.push("Factory configuration is incomplete.");
    if (networkGuard.isWrongNetwork || networkGuard.isMisconfigured) {
      reasons.push(networkGuard.message || "Switch to the configured network.");
    }
    if (walletPending) reasons.push("Wallet confirmation is open.");
    if (receipt.isLoading) reasons.push("Transaction confirmation is pending.");
    if (recording) reasons.push("Backend is independently verifying the transaction.");
    return reasons;
  }, [
    alreadyPublished,
    creatorMatches,
    factoryReady,
    isConnected,
    networkGuard.isMisconfigured,
    networkGuard.isWrongNetwork,
    networkGuard.message,
    publicConfig.isConfigured,
    receipt.isLoading,
    recording,
    submission.metadataURI,
    submission.readiness.state,
    submission.status,
    walletPending,
  ]);

  useEffect(() => {
    if (receipt.data?.status !== "success" || !hash || recordedHash === hash || !address) return;

    const metadataEvents = parseEventLogs({
      abi: campaignFactoryMetadataWriteAbi,
      logs: receipt.data.logs,
      eventName: "CampaignV2Created",
    });
    const campaignAddress = metadataEvents[0]?.args.campaign;
    if (!campaignAddress) {
      setError("Transaction confirmed, but CampaignV2Created was not found. Backend was not asked to publish it.");
      return;
    }

    setRecording(true);
    setError(null);
    void recordBackendPublish(submission.id, {
      transactionHash: hash,
      campaignAddress,
      factoryAddress: publicConfig.factoryAddress as `0x${string}`,
      chainId: networkGuard.actualChainId ?? publicConfig.chainId ?? 0,
      metadataURI: submission.metadataURI,
      publisherAddress: address,
    })
      .then((updated) => {
        setRecordedHash(hash);
        setMessage("Transaction independently verified on-chain and backend publish record saved.");
        onPublished(updated);
      })
      .catch((requestError) => {
        setError(requestError instanceof BackendClientError ? requestError.message : "Backend chain verification failed.");
      })
      .finally(() => setRecording(false));
  }, [
    address,
    hash,
    networkGuard.actualChainId,
    onPublished,
    publicConfig.chainId,
    publicConfig.factoryAddress,
    receipt.data,
    recordedHash,
    submission.id,
    submission.metadataURI,
  ]);

  useEffect(() => {
    if (receipt.data?.status === "reverted") setError("Publish transaction reverted. Backend was not updated.");
  }, [receipt.data?.status]);

  const publish = () => {
    if (disabledReasons.length > 0) return;
    setError(null);
    setMessage(null);
    writeContract(
      {
        address: publicConfig.factoryAddress as `0x${string}`,
        abi: campaignFactoryMetadataWriteAbi,
        functionName: "createCampaignWithMetadata",
        args: createArgs(submission),
      },
      {
        onSuccess: setHash,
        onError: (walletError) => setError(walletError.message),
      },
    );
  };

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
          {alreadyPublished || recordedHash ? "published" : receipt.isLoading ? "confirming" : walletPending ? "wallet confirmation" : "ready"}
        </span>
      </div>

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
      {(error || writeError || receipt.error) && (
        <div className="panel-danger" style={{ marginTop: 10 }}>
          {error || writeError?.message || receipt.error?.message}
        </div>
      )}
    </div>
  );
}
