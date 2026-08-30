"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import {
  MILESTONE_STATUS_LABELS,
  readCampaignParticipant,
  type CampaignParticipantView,
  type CampaignView,
} from "@/lib/readCampaign";

function formatTes(value: bigint) {
  const valueText = formatUnits(value, 18);
  const numeric = Number(valueText);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })} TES` : `${valueText} TES`;
}

function formatTime(value: bigint) {
  if (value === 0n) return "not set";
  const milliseconds = Number(value * 1000n);
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toLocaleString() : value.toString();
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function ActionButton({
  label,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={disabled ? "button-disabled" : danger ? "button-secondary" : "button-primary"}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default function CampaignV2Actions({
  campaign,
  disabledReason,
  onChanged,
}: {
  campaign: CampaignView;
  disabledReason?: string | null;
  onChanged: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { writeContract, data: transactionHash, isPending, error: writeError } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: transactionHash });
  const [participant, setParticipant] = useState<CampaignParticipantView | null>(null);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [evidenceURI, setEvidenceURI] = useState("");
  const [evidenceHash, setEvidenceHash] = useState("");

  const nextIndex = Number(campaign.nextMilestone);
  const currentMilestone = nextIndex >= 0 && nextIndex < campaign.milestones.length
    ? campaign.milestones[nextIndex]
    : null;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isOwner = sameAddress(address, campaign.owner);
  const isArbitrator = sameAddress(address, campaign.arbitrator);
  const walletBlocked = !isConnected || !address || Boolean(disabledReason) || isPending || receipt.isLoading;
  const validEvidenceHash = /^0x[a-fA-F0-9]{64}$/.test(evidenceHash.trim()) && !/^0x0{64}$/i.test(evidenceHash.trim());

  const refreshParticipant = useCallback(async () => {
    if (!address) {
      setParticipant(null);
      setParticipantError(null);
      return;
    }
    try {
      const next = await readCampaignParticipant(campaign.address, address, currentMilestone ? nextIndex : -1);
      setParticipant(next);
      setParticipantError(null);
    } catch (error) {
      setParticipant(null);
      setParticipantError(error instanceof Error ? error.message : "Could not read wallet campaign state.");
    }
  }, [address, campaign.address, currentMilestone, nextIndex]);

  useEffect(() => {
    void refreshParticipant();
  }, [refreshParticipant]);

  useEffect(() => {
    if (receipt.data?.status === "success") {
      void refreshParticipant();
      onChanged();
    }
  }, [onChanged, receipt.data?.status, refreshParticipant]);

  const send = (
    functionName:
      | "activateFundingFailure"
      | "submitMilestoneEvidence"
      | "voteMilestone"
      | "finalizeMilestone"
      | "resolveDispute"
      | "expireDispute"
      | "cancelForMissingMilestone"
      | "refund",
    args?: readonly unknown[],
  ) => {
    if (walletBlocked) return;
    writeContract({
      address: campaign.address,
      abi: campaignWriteAbi,
      functionName,
      ...(args ? { args } : {}),
    } as Parameters<typeof writeContract>[0]);
  };

  const walletStatus = useMemo(() => {
    if (!isConnected || !address) return "Connect a wallet to see contributor/creator actions.";
    if (disabledReason) return disabledReason;
    if (participantError) return `Wallet state read failed: ${participantError}`;
    if (!participant) return "Loading wallet campaign state...";
    const role = isOwner ? "creator" : isArbitrator ? "configured arbitrator" : participant.contribution > 0n ? "contributor" : "observer";
    return `${role}; contribution weight ${formatTes(participant.contribution)}.`;
  }, [address, disabledReason, isArbitrator, isConnected, isOwner, participant, participantError]);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="trust-grid">
        <div className="trust-note">
          <strong>V2 escrow state</strong>
          <span>{campaign.state === 0 ? "Funding" : campaign.state === 1 ? "Milestone escrow" : campaign.state === 2 ? "Refunds" : "Complete"}</span>
        </div>
        <div className="trust-note">
          <strong>Your on-chain role</strong>
          <span>{walletStatus}</span>
        </div>
        <div className="trust-note">
          <strong>Released / remaining escrow</strong>
          <span>{formatTes(campaign.totalReleased)} released; {campaign.state === 2 ? formatTes(campaign.refundPoolRemaining) : "contract balance governs remaining escrow"}.</span>
        </div>
      </div>

      {campaign.state === 0 && (
        <div className="draft-item" style={{ marginTop: 12 }}>
          <strong>Funding phase</strong>
          <div className="small muted" style={{ marginTop: 4 }}>
            Remaining to hard cap: {formatTes(campaign.remainingToGoal)}. Funding deadline: {formatTime(campaign.deadline)}.
          </div>
          {now > campaign.deadline && campaign.totalContributed < campaign.goal && (
            <div className="button-row" style={{ marginTop: 10 }}>
              {participant && participant.contribution > 0n ? (
                <ActionButton label="Claim failed-campaign refund" onClick={() => send("refund")} disabled={walletBlocked || participant.refundClaimed} />
              ) : (
                <ActionButton label="Activate failed-campaign refunds" onClick={() => send("activateFundingFailure")} disabled={walletBlocked} />
              )}
              <span className="small muted">This transition is permissionless after the immutable deadline.</span>
            </div>
          )}
        </div>
      )}

      {campaign.state === 1 && currentMilestone && (
        <div className="draft-item" style={{ marginTop: 12 }}>
          <div className="split-row">
            <div>
              <strong>Current gate #{nextIndex + 1}: {currentMilestone.description}</strong>
              <div className="small muted">{formatTes(currentMilestone.amount)}</div>
            </div>
            <span className={`badge ${currentMilestone.status === 3 ? "badge-success" : currentMilestone.status === 2 ? "badge-warning" : "badge-muted"}`}>
              {MILESTONE_STATUS_LABELS[currentMilestone.status]}
            </span>
          </div>

          {currentMilestone.status === 0 && (
            <>
              <div className="small muted" style={{ marginTop: 8 }}>
                Creator evidence due by {formatTime(campaign.milestoneSubmissionDeadline)}. The evidence hash must be a non-zero bytes32 commitment to the evidence; the UI does not invent or weaken that commitment.
              </div>
              {isOwner && now <= campaign.milestoneSubmissionDeadline && (
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <label className="form-field">
                    Evidence URI
                    <input value={evidenceURI} onChange={(event) => setEvidenceURI(event.target.value)} placeholder="ipfs://... or https://..." />
                  </label>
                  <label className="form-field">
                    Evidence bytes32 hash
                    <input value={evidenceHash} onChange={(event) => setEvidenceHash(event.target.value)} placeholder="0x + 64 hex characters" />
                  </label>
                  <div className="button-row">
                    <ActionButton
                      label="Commit milestone evidence"
                      onClick={() => send("submitMilestoneEvidence", [BigInt(nextIndex), evidenceURI.trim(), evidenceHash.trim() as `0x${string}`])}
                      disabled={walletBlocked || !evidenceURI.trim() || !validEvidenceHash}
                    />
                  </div>
                </div>
              )}
              {now > campaign.milestoneSubmissionDeadline && (
                <div className="button-row" style={{ marginTop: 10 }}>
                  <ActionButton label="Cancel for missing milestone" onClick={() => send("cancelForMissingMilestone")} disabled={walletBlocked} danger />
                  <span className="small muted">Creator inactivity now fails safe to the refund state.</span>
                </div>
              )}
            </>
          )}

          {currentMilestone.status === 1 && (
            <>
              <div className="detail-grid" style={{ marginTop: 10 }}>
                <div className="detail-item"><strong>Evidence URI</strong>{currentMilestone.evidenceURI || "missing"}</div>
                <div className="detail-item"><strong>Evidence hash</strong>{currentMilestone.evidenceHash}</div>
                <div className="detail-item"><strong>Review closes</strong>{formatTime(currentMilestone.challengeDeadline)}</div>
                <div className="detail-item"><strong>Challenge threshold</strong>{formatTes(campaign.challengeThresholdWeight)}</div>
                <div className="detail-item"><strong>Approve weight</strong>{formatTes(currentMilestone.approvalWeight)}</div>
                <div className="detail-item"><strong>Challenge weight</strong>{formatTes(currentMilestone.challengeWeight)}</div>
              </div>
              {now <= currentMilestone.challengeDeadline ? (
                <div className="button-row" style={{ marginTop: 10 }}>
                  <ActionButton
                    label="Approve evidence"
                    onClick={() => send("voteMilestone", [BigInt(nextIndex), 1])}
                    disabled={walletBlocked || !participant || participant.contribution === 0n || participant.vote !== 0}
                  />
                  <ActionButton
                    label="Challenge evidence"
                    onClick={() => send("voteMilestone", [BigInt(nextIndex), 2])}
                    disabled={walletBlocked || !participant || participant.contribution === 0n || participant.vote !== 0}
                    danger
                  />
                  {participant?.vote === 1 && <span className="small muted">Your vote: approve.</span>}
                  {participant?.vote === 2 && <span className="small muted">Your vote: challenge.</span>}
                </div>
              ) : (
                <div className="button-row" style={{ marginTop: 10 }}>
                  <ActionButton label="Finalize review window" onClick={() => send("finalizeMilestone", [BigInt(nextIndex)])} disabled={walletBlocked} />
                  <span className="small muted">Permissionless. The contract either releases or enters dispute according to challenge weight.</span>
                </div>
              )}
            </>
          )}

          {currentMilestone.status === 2 && (
            <>
              <div className="small muted" style={{ marginTop: 8 }}>
                Contributor challenge threshold was met. Arbitration deadline: {formatTime(currentMilestone.disputeDeadline)}.
              </div>
              {now <= currentMilestone.disputeDeadline && isArbitrator && (
                <div className="button-row" style={{ marginTop: 10 }}>
                  <ActionButton label="Resolve: approve milestone" onClick={() => send("resolveDispute", [BigInt(nextIndex), true])} disabled={walletBlocked} />
                  <ActionButton label="Resolve: reject → refunds" onClick={() => send("resolveDispute", [BigInt(nextIndex), false])} disabled={walletBlocked} danger />
                </div>
              )}
              {now > currentMilestone.disputeDeadline && (
                <div className="button-row" style={{ marginTop: 10 }}>
                  <ActionButton label="Expire stalled dispute → refunds" onClick={() => send("expireDispute", [BigInt(nextIndex)])} disabled={walletBlocked} danger />
                  <span className="small muted">Arbitrator inactivity cannot freeze escrow indefinitely.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {campaign.state === 2 && (
        <div className="draft-item" style={{ marginTop: 12 }}>
          <strong>Refund state</strong>
          <div className="small muted" style={{ marginTop: 4 }}>
            Refund pool remaining: {formatTes(campaign.refundPoolRemaining)} across {campaign.refundableBackersRemaining.toString()} unclaimed backer record(s).
          </div>
          <div className="button-row" style={{ marginTop: 10 }}>
            <ActionButton
              label={participant?.refundClaimed ? "Refund already claimed" : "Claim pro-rata refund"}
              onClick={() => send("refund")}
              disabled={walletBlocked || !participant || participant.contribution === 0n || participant.refundClaimed}
            />
          </div>
        </div>
      )}

      {campaign.state === 3 && (
        <div className="panel-success" style={{ marginTop: 12 }}>
          Campaign complete. All scheduled milestone escrow has been released through V2 gates.
        </div>
      )}

      {transactionHash && (
        <div className="small muted" style={{ marginTop: 10 }}>
          Last action: {transactionHash.slice(0, 10)}... {receipt.isLoading ? "pending" : receipt.data?.status ?? "submitted"}
        </div>
      )}
      {writeError && <div className="panel-danger" style={{ marginTop: 10 }}>{writeError.message}</div>}
    </div>
  );
}
