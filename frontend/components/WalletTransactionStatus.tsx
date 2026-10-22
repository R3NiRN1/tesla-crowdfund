"use client";

import type { useWalletTransaction } from "@/lib/useWalletTransaction";
import { useState } from "react";

export default function WalletTransactionStatus({ transaction }: { transaction: ReturnType<typeof useWalletTransaction> }) {
  const [hash, setHash] = useState("");
  const [target, setTarget] = useState(transaction.targets[0]);
  return <div role="status" style={{ marginTop: 10, overflowWrap: "anywhere" }}>
    {transaction.promptPending && !transaction.needsHash && <div>Confirm or reject the existing request in your wallet. Another send is blocked.</div>}
    {transaction.needsHash && <div className="panel-warning">
      <div>The wallet outcome is unknown. Another send remains blocked. Check wallet history for the transaction hash.</div>
      <label className="form-field">Recovery transaction hash<input value={hash} onChange={(event) => setHash(event.target.value)} /></label>
      {transaction.targets.length > 1 && <label className="form-field">Transaction recipient<select value={target} onChange={(event) => setTarget(event.target.value as `0x${string}`)}>
        {transaction.targets.map((address) => <option key={address} value={address}>{address}</option>)}
      </select></label>}
      <button type="button" disabled={!/^0x[a-fA-F0-9]{64}$/.test(hash)} onClick={() => transaction.recover(hash, target)}>Check existing transaction</button>
    </div>}
    {transaction.pending && <>
      <div>Unverified transaction: {transaction.pending.hash}</div>
      <div>Tracking on chain {transaction.pending.chainId}. {transaction.statusUnknown ? "Status unavailable; another send remains blocked." : "Awaiting confirmation; another send is blocked."}</div>
      <button type="button" className="button-secondary" onClick={transaction.retry}>Retry transaction status</button>
    </>}
    {transaction.message && <div>{transaction.message}</div>}
    {transaction.error && <div className="panel-danger">{transaction.error}</div>}
  </div>;
}
