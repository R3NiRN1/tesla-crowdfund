"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import WalletBar from "@/components/WalletBar";
import { createBackendSubmission } from "@/lib/backendClient";

export default function BackendCampaignPage() {
  const { address, isConnected } =