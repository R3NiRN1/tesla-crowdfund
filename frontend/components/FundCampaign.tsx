"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, type ContractFunctionParameters } from "viem";

import { erc20Abi } from "@/lib/erc20Abi";
import { campaignWriteAbi } from "@/lib/campaignWriteAbi";

function short(addr?: string) {
  if (!addr || typeof addr !== "string") return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function FundCampaign({
  token,
  campaignAddress,
  onContributed,
  disabled = false,
  disabledReason,
}: {
  token: `0x${string}`;
  campaignAddress: `0x${string}`;
  onContributed?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { address, isConnected } = useAccount();
  const [amountText, setAmountText] = useState("10");

  // If allowance reads fail (RPC/CORS/ABI/metadata issues), keep UI usable
  const [approvedOnce, setApprovedOnce] = useState(false);

  const decimalsFallback = 18;
  const symbolFallback = "TES";

  const readConfig = useMemo(() => {
    const contracts: ContractFunctionParameters[] = [];
    const indices: {
      balance: number | null;
      allowance: number | null;
      decimals: number;
      symbol: number;
    } = {
      balance: null,
      allowance: null,
      decimals: 0,
      symbol: 0,
    };

    if (address) {
      indices.balance = contracts.length;
      contracts.push({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });

      indices.allowance = contracts.length;
      contracts.push({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, campaignAddress],
      });
    }

    indices.decimals = contracts.length;
    contracts.push({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    });

    indices.symbol = contracts.length;
    contracts.push({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    });

    return { contracts, indices };
  }, [address, token, campaignAddress]);

  const {
    data: reads,
    refetch,
    isLoading: readsLoading,
    error: readsError,
  } = useReadContracts({
    allowFailure: true,
    contracts: readConfig.contracts,
  });

  const balanceResult =
    readConfig.indices.balance !== null ? reads?.[readConfig.indices.balance]?.result : undefined;
  const allowanceResult =
    readConfig.indices.allowance !== null ? reads?.[readConfig.indices.allowance]?.result : undefined;
  const decimalsResult = reads?.[readConfig.indices.decimals]?.result;
  const symbolResult = reads?.[readConfig.indices.symbol]?.result;

  const balance = typeof balanceResult === "bigint" ? balanceResult : undefined;
  const allowance = typeof allowanceResult === "bigint" ? allowanceResult : undefined;
  const decimals = Number.isFinite(decimalsResult)
    ? Number(decimalsResult)
    : typeof decimalsResult === "bigint"
    ? Number(decimalsResult)
    : decimalsFallback;
  const symbol = typeof symbolResult === "string" && symbolResult.length ? symbolResult : symbolFallback;

  const parsedAmount = useMemo(() => {
    const n = Number(amountText);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    try {
      return parseUnits(amountText, decimals);
    } catch {
      return 0n;
    }
  }, [amountText, decimals]);

  const needsApproval = useMemo(() => {
    if (parsedAmount <= 0n) return true;
    if (typeof allowance === "bigint") return allowance < parsedAmount;
    // If allowance can't be read, don't brick the UI after a confirmed approve.
    return !approvedOnce;
  }, [allowance, parsedAmount, approvedOnce]);

  const { writeContract, data: txHash, error: writeError, isPending } = useWriteContract();

  // NOTE: txHash can be approve OR contribute depending on last action; keep as-is.
  const { data: receipt, isLoading: waiting } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // if a tx confirms, refresh reads (token-side)
  useEffect(() => {
    if (receipt?.status === "success") {
      refetch();
    }
  }, [receipt, refetch]);

  const [lastApproveHash, setLastApproveHash] = useState<`0x${string}` | null>(null);
  const [lastContribHash, setLastContribHash] = useState<`0x${string}` | null>(null);

  const approveReceipt = useWaitForTransactionReceipt({
    hash: lastApproveHash ?? undefined,
  });

  const contribReceipt = useWaitForTransactionReceipt({
    hash: lastContribHash ?? undefined,
  });

  useEffect(() => {
    if (approveReceipt.data?.status === "success") {
      setApprovedOnce(true);
      refetch();
    }
  }, [approveReceipt.data, refetch]);

  // ✅ THE KEY FIX: notify parent after contribute confirms
  useEffect(() => {
    if (contribReceipt.data?.status === "success") {
      refetch(); // refresh token reads in this component
      onContributed?.(); // refresh campaign reads in parent (Raised/goal/milestones)
    }
  }, [contribReceipt.data, refetch, onContributed]);

  const onApprove = async () => {
    if (disabled || !isConnected || !address) return;
    if (parsedAmount <= 0n) return;

    try {
      writeContract(
        {
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [campaignAddress, parsedAmount],
        },
        {
          onSuccess(hash) {
            setLastApproveHash(hash as `0x${string}`);
          },
        }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const onContribute = async () => {
    if (disabled || !isConnected || !address) return;
    if (parsedAmount <= 0n) return;

    try {
      writeContract(
        {
          address: campaignAddress,
          abi: campaignWriteAbi,
          functionName: "contribute",
          args: [parsedAmount],
        },
        {
          onSuccess(hash) {
            setLastContribHash(hash as `0x${string}`);
          },
        }
      );
    } catch (e) {
      console.error(e);
    }
  };

  if (disabled) {
    return (
      <div
        style={{
          border: "1px solid #f59e0b",
          borderRadius: 12,
          padding: 12,
          marginTop: 12,
          background: "#fffbeb",
        }}
      >
        <b>Funding disabled</b>
        <div style={{ marginTop: 6, fontSize: 13, color: "#92400e" }}>
          {disabledReason || "Setup required to enable funding actions."}
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <b>Fund this campaign</b>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Token: {short(token)} ({symbol})
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>Amount ({symbol}):</span>
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            style={{ width: 120, padding: "6px 8px", borderRadius: 8, border: "1px solid #ccc" }}
            inputMode="decimal"
          />
        </label>

        <button
          onClick={onApprove}
          disabled={!isConnected || parsedAmount <= 0n || isPending || waiting}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            cursor: "pointer",
            opacity: !isConnected || parsedAmount <= 0n || isPending || waiting ? 0.6 : 1,
          }}
        >
          {approveReceipt.isLoading ? "Approving…" : "1) Approve"}
        </button>

        <button
          onClick={onContribute}
          disabled={!isConnected || parsedAmount <= 0n || needsApproval || isPending || waiting}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #777",
            background: "white",
            cursor: "pointer",
            opacity: !isConnected || parsedAmount <= 0n || needsApproval || isPending || waiting ? 0.6 : 1,
          }}
          title={needsApproval ? "Approve first (or allowance couldn't be read yet)." : "Send contribute() tx"}
        >
          {contribReceipt.isLoading ? "Contributing…" : "2) Contribute"}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, lineHeight: 1.6 }}>
        <div>
          Balance:{" "}
          {typeof balance === "bigint"
            ? `${Number(formatUnits(balance, decimals)).toLocaleString()} ${symbol}`
            : "—"}
        </div>
        <div>
          Allowance:{" "}
          {typeof allowance === "bigint"
            ? `${Number(formatUnits(allowance, decimals)).toLocaleString()} ${symbol}`
            : "—"}
        </div>

        <div style={{ marginTop: 6, opacity: 0.8 }}>Step 1: Approve the campaign to spend your tokens.</div>

        {lastApproveHash && (
          <div>
            Approve tx: {short(lastApproveHash)}{" "}
            {approveReceipt.data?.status === "success"
              ? "✅ confirmed"
              : approveReceipt.isLoading
              ? "⏳ pending"
              : ""}
          </div>
        )}

        {lastContribHash && (
          <div>
            Contribute tx: {short(lastContribHash)}{" "}
            {contribReceipt.data?.status === "success"
              ? "✅ confirmed"
              : contribReceipt.isLoading
              ? "⏳ pending"
              : ""}
          </div>
        )}

        {(readsError || writeError) && (
          <div style={{ marginTop: 6, color: "crimson" }}>
            {readsError instanceof Error
              ? readsError.message
              : writeError instanceof Error
              ? writeError.message
              : readsError
              ? String(readsError)
              : writeError
              ? String(writeError)
              : "Unknown error"}
          </div>
        )}

        {/* helpful debug */}
        {!readsLoading && typeof allowance !== "bigint" && approvedOnce && (
          <div style={{ marginTop: 6, color: "#b45309" }}>
            Note: token metadata/allowance reads may be failing (RPC/CORS or token missing ERC20Metadata). Contribute is
            still enabled after a confirmed approve.
          </div>
        )}
      </div>
    </div>
  );
}
