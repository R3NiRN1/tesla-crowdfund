"use client";

import Link from "next/link";

import { usePublicConfig } from "@/lib/usePublicConfig";

export default function SetupBanner() {
  const publicConfig = usePublicConfig();

  if (publicConfig.isConfigured) return null;

  return (
    <div className="panel-warning">
      <div style={{ fontWeight: 700 }}>setup/read-only mode</div>
      <div>Funding and claim transactions are disabled until RPC, factory, and token settings are configured.</div>
      <Link href="/setup" style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>
        Go to setup
      </Link>
    </div>
  );
}
