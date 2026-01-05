"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function ConnectWallet() {
  return <ConnectButton chainStatus="icon" showBalance={false} />;
}
