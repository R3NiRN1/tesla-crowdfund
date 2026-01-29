"use client";

import Link from "next/link";

import { usePublicConfig } from "@/lib/usePublicConfig";

export default function SetupBanner() {
  const publicConfig = usePublicConfig();

  if (publicConfig.isConfigured) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600 }}>Setup required</div>
      <div>Complete the first-run wizard to configure chain settings and enable write actions.</div>
      <Link href="/setup" style={{ color: "#92400e", textDecoration: "underline", fontWeight: 600 }}>
        Go to setup
      </Link>
    </div>
  );
}
