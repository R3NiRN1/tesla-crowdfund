"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits, type ContractFunctionParameters } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import { erc20Abi } from "@/lib/erc20Abi";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { useWalletTransaction } from "@/lib/useWalletTransaction";
import WalletTransactionStatus from "./WalletTransactionStatus";

function short(addr?: string) {
  if (!addr || typeof addr !== "string") return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatToken(value: bigint, decimals: number, symbol: string) {
  const text = formatUnits(value, decimals);
  const numeric = Number(text);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}` : `${text} ${symbol}`;
}

type FundingProps = {
  token: `0x${string}`;
  campaignAddress: `0x${string}`;
  remainingToGoal: bigint;
  onContributed?: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export default function FundCampaign(props: FundingProps) {
  const { address, chainId } = useAccount();
  const network = useNetworkGuard();
  return <FundingControls key={`${address}:${chainId}:${network.expectedChainId}:${props.token}:${props.campaignAddress}`} {...props} />;
}

function FundingControls({
  token,
  campaignAddress,
  remainingToGoal,
  onContributed,
  disabled = false,
  disabledReason,
}: FundingProps) {
  const { address, isConnected } = useAccount();
  const network = useNetworkGuard();
  const [amountText, setAmountText] = useState("10");

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

  const { data: reads, refetch, isLoading: readsLoading, isFetching, error: readsError } = useReadContracts({
    allowFailure: true,
    contracts: readConfig.contracts.map((contract) => ({ ...contract, chainId: network.expectedChainId ?? undefined })),
    query: { enabled: network.expectedChainId !== null },
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
      : NaN;
  const symbol = typeof symbolResult === "string" && symbolResult ? symbolResult : "TES";
  const readsValid = !readsError && !readsLoading && !isFetching && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
    && typeof balance === "bigint" && balance >= 0n && typeof allowance === "bigint" && allowance >= 0n
    && [readConfig.indices.balance, readConfig.indices.allowance, readConfig.indices.decimals]
      .every((index) => index !== null && reads?.[index]?.status !== "failure");
  const displayDecimals = Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null;
  const formatAmount = (value: bigint) => displayDecimals === null ? "unavailable (token decimals unknown)" : formatToken(value, displayDecimals, symbol);

  const requestedAmount = useMemo(() => {
    try {
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255 || !/^\d+(\.\d+)?$/.test(amountText)) return 0n;
      if ((amountText.split(".")[1]?.length ?? 0) > decimals || amountText.length > 340) return 0n;
      const amount = parseUnits(amountText, decimals);
      return amount > 0n && amount < 2n ** 256n ? amount : 0n;
    } catch {
      return 0n;
    }
  }, [amountText, decimals]);

  const expectedAccepted = requestedAmount > remainingToGoal ? remainingToGoal : requestedAmount;
  const needsApproval = expectedAccepted <= 0n
    ? true
    : typeof allowance === "bigint"
      ? allowance < expectedAccepted
      : true;

  const transaction = useWalletTransaction({
    recoveryKey: `fund:${network.expectedChainId}:${address?.toLowerCase()}:${token.toLowerCase()}:${campaignAddress.toLowerCase()}`,
    account: address,
    chainId: network.expectedChainId,
    targets: [token, campaignAddress],
    onSuccess(receipt) {
      void refetch();
      if (receipt.to?.toLowerCase() === campaignAddress.toLowerCase()) onContributed?.();
    },
  });

  const actionDisabled = disabled || network.blockWrites || !isConnected || !address || !readsValid
    || requestedAmount <= 0n || remainingToGoal <= 0n || transaction.blocked || balance === undefined || balance < expectedAccepted;

  const approve = () => {
    if (actionDisabled || expectedAccepted <= 0n) return;
    transaction.send({ address: token, abi: erc20Abi, functionName: "approve", args: [campaignAddress, expectedAccepted] });
  };

  const contribute = () => {
    if (actionDisabled || needsApproval) return;
    transaction.send({ address: campaignAddress, abi: campaignWriteAbi, functionName: "contribute", args: [requestedAmount] });
  };

  if (disabled || remainingToGoal <= 0n) {
    return (
      <div className="panel-warning" style={{ marginTop: 12 }}>
        <strong>Funding disabled</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {remainingToGoal <= 0n ? "Campaign hard cap has been reached." : disabledReason || "Setup or campaign state does not permit funding."}
        </div>
        <WalletTransactionStatus transaction={transaction} />
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
        Remaining capacity: {formatAmount(remainingToGoal)}. The contract can never accept more than this amount.
      </div>

      {requestedAmount > remainingToGoal && remainingToGoal > 0n && (
        <div className="panel-warning" style={{ marginTop: 10 }}>
          You requested {formatAmount(requestedAmount)}, but only {formatAmount(remainingToGoal)} remains. V2 will transfer only the remaining amount; the excess stays in your wallet. The approval below is capped to that remaining amount.
        </div>
      )}

      <div className="button-row" style={{ marginTop: 10 }}>
        <label className="form-field" style={{ minWidth: 180 }}>
          Amount ({symbol})
          <input value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" disabled={transaction.blocked} />
        </label>
        <button type="button" className={actionDisabled ? "button-disabled" : "button-primary"} disabled={actionDisabled} onClick={approve}>
          {`1. Approve ${expectedAccepted > 0n ? formatAmount(expectedAccepted) : "amount"}`}
        </button>
        <button
          type="button"
          className={actionDisabled || needsApproval ? "button-disabled" : "button-primary"}
          disabled={actionDisabled || needsApproval}
          onClick={contribute}
        >
          {transaction.pending?.target.toLowerCase() === campaignAddress.toLowerCase() ? "Contributing..." : "2. Contribute"}
        </button>
      </div>

      <div className="small muted" style={{ marginTop: 8 }}>
        Balance: {typeof balance === "bigint" ? formatAmount(balance) : readsLoading ? "loading" : "unavailable"}. Allowance: {typeof allowance === "bigint" ? formatAmount(allowance) : "unavailable"}.
      </div>
      {network.message && <div className="panel-warning">{network.message}</div>}
      {!readsValid && <div className="panel-warning">Funding disabled until token balance, allowance and decimals are verified. <button type="button" onClick={() => { void refetch(); }}>Retry token reads</button></div>}
      {readsValid && balance !== undefined && balance < expectedAccepted && <div className="panel-warning">Insufficient token balance for the accepted contribution.</div>}
      <WalletTransactionStatus transaction={transaction} />
    </div>
  );
}
