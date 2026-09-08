"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type ContractFunctionParameters } from "viem";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import { erc20Abi } from "@/lib/erc20Abi";

function short(addr?: string) {
  if (!addr || typeof addr !== "string") return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatToken(value: bigint, decimals: number, symbol: string) {
  const text = formatUnits(value, decimals);
  const numeric = Number(text);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}` : `${text} ${symbol}`;
}

export default function FundCampaign({
  token,
  campaignAddress,
  remainingToGoal,
  onContributed,
  disabled = false,
  disabledReason,
}: {
  token: `0x${string}`;
  campaignAddress: `0x${string}`;
  remainingToGoal: bigint;
  onContributed?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { address, isConnected } = useAccount();
  const [amountText, setAmountText] = useState("10");
  const [approvedOnce, setApprovedOnce] = useState(false);
  const [lastApproveHash, setLastApproveHash] = useState<`0x${string}` | null>(null);
  const [lastContribHash, setLastContribHash] = useState<`0x${string}` | null>(null);

  const readConfig = useMemo(() => {
    const contracts: ContractFunctionParameters[] = [];
    const indices: { balance: number | null; allowance: number | null; decimals: number; symbol: number } = {
      balance: null,
      allowance: null,
      decimals: 0,
      symbol: 0,
    };

    if (address) {
      indices.balance = contracts.length;
      contracts.push({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      indices.allowance = contracts.length;
      contracts.push({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, campaignAddress] });
    }
    indices.decimals = contracts.length;
    contracts.push({ address: token, abi: erc20Abi, functionName: "decimals" });
    indices.symbol = contracts.length;
    contracts.push({ address: token, abi: erc20Abi, functionName: "symbol" });
    return { contracts, indices };
  }, [address, campaignAddress, token]);

  const { data: reads, refetch, isLoading: readsLoading, error: readsError } = useReadContracts({
    allowFailure: true,
    contracts: readConfig.contracts,
  });

  const balanceResult = readConfig.indices.balance !== null ? reads?.[readConfig.indices.balance]?.result : undefined;
  const allowanceResult = readConfig.indices.allowance !== null ? reads?.[readConfig.indices.allowance]?.result : undefined;
  const decimalsResult = reads?.[readConfig.indices.decimals]?.result;
  const symbolResult = reads?.[readConfig.indices.symbol]?.result;

  const balance = typeof balanceResult === "bigint" ? balanceResult : undefined;
  const allowance = typeof allowanceResult === "bigint" ? allowanceResult : undefined;
  const decimals = typeof decimalsResult === "number"
    ? decimalsResult
    : typeof decimalsResult === "bigint"
      ? Number(decimalsResult)
      : 18;
  const symbol = typeof symbolResult === "string" && symbolResult ? symbolResult : "TES";

  const requestedAmount = useMemo(() => {
    try {
      if (!amountText.trim() || Number(amountText) <= 0) return 0n;
      return parseUnits(amountText, decimals);
    } catch {
      return 0n;
    }
  }, [amountText, decimals]);

  const expectedAccepted = requestedAmount > remainingToGoal ? remainingToGoal : requestedAmount;
  const needsApproval = expectedAccepted <= 0n
    ? true
    : typeof allowance === "bigint"
      ? allowance < expectedAccepted
      : !approvedOnce;

  const { writeContract, error: writeError, isPending } = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: lastApproveHash ?? undefined });
  const contributionReceipt = useWaitForTransactionReceipt({ hash: lastContribHash ?? undefined });

  useEffect(() => {
    if (approveReceipt.data?.status === "success") {
      setApprovedOnce(true);
      void refetch();
    }
  }, [approveReceipt.data?.status, refetch]);

  useEffect(() => {
    if (contributionReceipt.data?.status === "success") {
      void refetch();
      onContributed?.();
    }
  }, [contributionReceipt.data?.status, onContributed, refetch]);

  const actionDisabled = disabled || !isConnected || !address || requestedAmount <= 0n || remainingToGoal <= 0n || isPending;

  const approve = () => {
    if (actionDisabled || expectedAccepted <= 0n) return;
    writeContract(
      { address: token, abi: erc20Abi, functionName: "approve", args: [campaignAddress, expectedAccepted] },
      { onSuccess: (hash) => setLastApproveHash(hash) },
    );
  };

  const contribute = () => {
    if (actionDisabled || needsApproval) return;
    writeContract(
      { address: campaignAddress, abi: campaignWriteAbi, functionName: "contribute", args: [requestedAmount] },
      { onSuccess: (hash) => setLastContribHash(hash) },
    );
  };

  if (disabled || remainingToGoal <= 0n) {
    return (
      <div className="panel-warning" style={{ marginTop: 12 }}>
        <strong>Funding disabled</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {remainingToGoal <= 0n ? "Campaign hard cap has been reached." : disabledReason || "Setup or campaign state does not permit funding."}
        </div>
      </div>
    );
  }

  return (
    <div className="draft-item" style={{ marginTop: 12 }}>
      <div className="split-row">
        <div>
          <strong>Fund this campaign</strong>
          <div className="small muted">Token {short(token)} ({symbol})</div>
        </div>
        <span className="badge badge-muted">V2 hard cap</span>
      </div>

      <div className="small muted" style={{ marginTop: 8 }}>
        Remaining capacity: {formatToken(remainingToGoal, decimals, symbol)}. The contract can never accept more than this amount.
      </div>

      {requestedAmount > remainingToGoal && remainingToGoal > 0n && (
        <div className="panel-warning" style={{ marginTop: 10 }}>
          You requested {formatToken(requestedAmount, decimals, symbol)}, but only {formatToken(remainingToGoal, decimals, symbol)} remains. V2 will transfer only the remaining amount; the excess stays in your wallet. The approval below is capped to that remaining amount.
        </div>
      )}

      <div className="button-row" style={{ marginTop: 10 }}>
        <label className="form-field" style={{ minWidth: 180 }}>
          Amount ({symbol})
          <input value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" />
        </label>
        <button type="button" className={actionDisabled ? "button-disabled" : "button-primary"} disabled={actionDisabled} onClick={approve}>
          {approveReceipt.isLoading ? "Approving..." : `1. Approve ${expectedAccepted > 0n ? formatToken(expectedAccepted, decimals, symbol) : "amount"}`}
        </button>
        <button
          type="button"
          className={actionDisabled || needsApproval ? "button-disabled" : "button-primary"}
          disabled={actionDisabled || needsApproval}
          onClick={contribute}
        >
          {contributionReceipt.isLoading ? "Contributing..." : "2. Contribute"}
        </button>
      </div>

      <div className="small muted" style={{ marginTop: 8 }}>
        Balance: {typeof balance === "bigint" ? formatToken(balance, decimals, symbol) : readsLoading ? "loading" : "unavailable"}. Allowance: {typeof allowance === "bigint" ? formatToken(allowance, decimals, symbol) : "unavailable"}.
      </div>
      {lastApproveHash && <div className="small muted">Approve tx: {short(lastApproveHash)} {approveReceipt.data?.status ?? (approveReceipt.isLoading ? "pending" : "")}</div>}
      {lastContribHash && <div className="small muted">Contribution tx: {short(lastContribHash)} {contributionReceipt.data?.status ?? (contributionReceipt.isLoading ? "pending" : "")}</div>}
      {(readsError || writeError) && (
        <div className="panel-danger" style={{ marginTop: 10 }}>
          {readsError instanceof Error ? readsError.message : writeError?.message}
        </div>
      )}
    </div>
  );
}
