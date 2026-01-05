"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits, formatUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { erc20Abi } from "@/lib/erc20Abi";
import { campaignWriteAbi } from "@/lib/campaignWriteAbi";

// Minimal campaign read ABI for gating + claim UI
const campaignReadAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "goal", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalContributed", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "milestones",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ type: "string" }, { type: "uint256" }, { type: "bool" }],
  },
] as const;

export default function FundPanel({
  campaignAddress,
  tokenAddress,
  onAfterTx,
}: {
  campaignAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  onAfterTx?: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [amountStr, setAmountStr] = useState("1");

  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [contributeHash, setContributeHash] = useState<`0x${string}` | undefined>();
  const [claimHash, setClaimHash] = useState<`0x${string}` | undefined>();

  const approveReceipt = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: !!approveHash },
  });

  const contributeReceipt = useWaitForTransactionReceipt({
    hash: contributeHash,
    query: { enabled: !!contributeHash },
  });

  const claimReceipt = useWaitForTransactionReceipt({
    hash: claimHash,
    query: { enabled: !!claimHash },
  });

  const amount = useMemo(() => {
    try {
      return parseUnits(amountStr || "0", 18);
    } catch {
      return 0n;
    }
  }, [amountStr]);

  // Token reads
  const allowance = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "allowance",
    args: address ? [address, campaignAddress] : undefined,
    query: { enabled: !!address },
  });

  const balance = useReadContract({
    abi: erc20Abi,
    address: tokenAddress,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Campaign reads for claim gating (milestone 0 as starter)
  const owner = useReadContract({
    abi: campaignReadAbi,
    address: campaignAddress,
    functionName: "owner",
    query: { enabled: true },
  });

  const goal = useReadContract({
    abi: campaignReadAbi,
    address: campaignAddress,
    functionName: "goal",
    query: { enabled: true },
  });

  const totalContributed = useReadContract({
    abi: campaignReadAbi,
    address: campaignAddress,
    functionName: "totalContributed",
    query: { enabled: true },
  });

  const milestone0 = useReadContract({
    abi: campaignReadAbi,
    address: campaignAddress,
    functionName: "milestones",
    args: [0n],
    query: { enabled: true },
  });

  const needsApprove = useMemo(() => {
    const a = allowance.data ?? 0n;
    return amount > 0n && a < amount;
  }, [allowance.data, amount]);

  const isOwner =
    !!address && !!owner.data && address.toLowerCase() === (owner.data as string).toLowerCase();

  const goalReached = (totalContributed.data ?? 0n) >= (goal.data ?? 0n);

  const milestone0Claimed =
    Array.isArray(milestone0.data) ? (milestone0.data[2] as boolean) : false;

  // After approve confirms
  useEffect(() => {
    if (approveReceipt.isSuccess) {
      allowance.refetch();
      balance.refetch();
      setApproveHash(undefined);
      onAfterTx?.();
    }
  }, [approveReceipt.isSuccess, allowance, balance, onAfterTx]);

  // After contribute confirms
  useEffect(() => {
    if (contributeReceipt.isSuccess) {
      allowance.refetch();
      balance.refetch();
      totalContributed.refetch();
      setContributeHash(undefined);
      onAfterTx?.();
    }
  }, [contributeReceipt.isSuccess, allowance, balance, totalContributed, onAfterTx]);

  // After claim confirms
  useEffect(() => {
    if (claimReceipt.isSuccess) {
      milestone0.refetch();
      balance.refetch();
      setClaimHash(undefined);
      onAfterTx?.();
    }
  }, [claimReceipt.isSuccess, milestone0, balance, onAfterTx]);

  async function approve() {
    if (!address) return;
    const hash = await writeContractAsync({
      abi: erc20Abi,
      address: tokenAddress,
      functionName: "approve",
      args: [campaignAddress, amount],
    });
    setApproveHash(hash);
  }

  async function contribute() {
    const hash = await writeContractAsync({
      abi: campaignWriteAbi,
      address: campaignAddress,
      functionName: "contribute",
      args: [amount],
    });
    setContributeHash(hash);
  }

  async function claimMilestone0() {
    const hash = await writeContractAsync({
      abi: campaignWriteAbi,
      address: campaignAddress,
      functionName: "claimMilestone",
      args: [0n],
    });
    setClaimHash(hash);
  }

  const busy = approveReceipt.isLoading || contributeReceipt.isLoading || claimReceipt.isLoading;

  if (!isConnected) {
    return <div style={{ opacity: 0.7 }}>Connect wallet to fund this campaign.</div>;
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <b>Fund this campaign (MockTES)</b>

      <div style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
        Balance:{" "}
        {balance.data !== undefined ? Number(formatUnits(balance.data, 18)).toLocaleString() : "…"} TES
      </div>

      <div style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
        Allowance:{" "}
        {allowance.data !== undefined ? Number(formatUnits(allowance.data, 18)).toLocaleString() : "…"} TES
      </div>

      <div style={{ marginTop: 6, fontSize: 14, opacity: 0.8 }}>
        Raised (panel):{" "}
        {totalContributed.data !== undefined ? Number(formatUnits(totalContributed.data, 18)).toLocaleString() : "…"} /{" "}
        {goal.data !== undefined ? Number(formatUnits(goal.data, 18)).toLocaleString() : "…"} TES
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="Amount"
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 140 }}
        />

        {needsApprove ? (
          <button
            onClick={approve}
            disabled={amount <= 0n || busy}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white", opacity: amount <= 0n || busy ? 0.6 : 1 }}
          >
            {approveReceipt.isLoading ? "Approving..." : "Approve"}
          </button>
        ) : (
          <button
            onClick={contribute}
            disabled={amount <= 0n || busy}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white", opacity: amount <= 0n || busy ? 0.6 : 1 }}
          >
            {contributeReceipt.isLoading ? "Contributing..." : "Contribute"}
          </button>
        )}

        <button
          onClick={claimMilestone0}
          disabled={!isOwner || !goalReached || milestone0Claimed || busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "white",
            color: "#111",
            opacity: !isOwner || !goalReached || milestone0Claimed || busy ? 0.5 : 1,
          }}
          title={
            !isOwner
              ? "Only campaign owner can claim"
              : !goalReached
              ? "Goal not reached"
              : milestone0Claimed
              ? "Already claimed"
              : "Claim milestone 0"
          }
        >
          {claimReceipt.isLoading ? "Claiming..." : "Claim milestone 0"}
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
        {needsApprove
          ? "Step 1: approve the campaign to spend your MockTES."
          : "Step 2: contribute tokens into the campaign contract."}
      </div>
    </div>
  );
}
