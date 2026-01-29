"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { getStoredConfig, setStoredConfig, type StoredConfig } from "@/lib/storedConfig";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type WizardStep = 1 | 2 | 3 | 4 | 5;

type WizardState = {
  chainId: number | null;
  rpcUrl: string;
  bscscanBase: string;
  factoryAddress: string;
  tokenAddress: string;
  wcEnabled: boolean;
  wcProjectId: string;
  adminToken: string;
};

const initialState: WizardState = {
  chainId: 97,
  rpcUrl: "",
  bscscanBase: "https://testnet.bscscan.com",
  factoryAddress: "",
  tokenAddress: "",
  wcEnabled: false,
  wcProjectId: "",
  adminToken: "",
};

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidAddress(value: string) {
  if (!value) return false;
  if (value.toLowerCase() === ZERO_ADDRESS) return true;
  return ADDRESS_REGEX.test(value);
}

function generateToken() {
  if (typeof window !== "undefined" && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `admin-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

export default function SetupPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>(initialState);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = getStoredConfig();
    if (!stored) return;
    setState({
      chainId: stored.chainId ?? 97,
      rpcUrl: stored.rpcUrl ?? "",
      bscscanBase: stored.bscscanBase ?? "",
      factoryAddress: stored.factoryAddress ?? "",
      tokenAddress: stored.tokenAddress ?? "",
      wcEnabled: stored.wcEnabled ?? false,
      wcProjectId: stored.wcProjectId ?? "",
      adminToken: stored.adminToken ?? "",
    });
  }, []);

  const zeroAddressWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (state.factoryAddress && state.factoryAddress.toLowerCase() === ZERO_ADDRESS) {
      warnings.push("Factory address is ZERO_ADDRESS. Write actions will remain disabled.");
    }
    if (state.tokenAddress && state.tokenAddress.toLowerCase() === ZERO_ADDRESS) {
      warnings.push("Token address is ZERO_ADDRESS. Write actions will remain disabled.");
    }
    return warnings;
  }, [state.factoryAddress, state.tokenAddress]);

  const mainnetWarning = state.chainId === 56;

  const canContinue = useMemo(() => {
    if (step === 1) return !!state.chainId;
    if (step === 2) return isValidUrl(state.rpcUrl) && isValidUrl(state.bscscanBase);
    if (step === 3) return isValidAddress(state.factoryAddress) && isValidAddress(state.tokenAddress);
    if (step === 4) return !state.wcEnabled || !!state.wcProjectId.trim();
    return true;
  }, [state, step]);

  const nextStep = () => {
    if (!canContinue) return;
    setStep((prev) => (prev < 5 ? ((prev + 1) as WizardStep) : prev));
  };

  const prevStep = () => setStep((prev) => (prev > 1 ? ((prev - 1) as WizardStep) : prev));

  const saveConfig = () => {
    const payload: StoredConfig = {
      chainId: state.chainId ?? null,
      rpcUrl: state.rpcUrl.trim() || null,
      bscscanBase: state.bscscanBase.trim() || null,
      factoryAddress: state.factoryAddress.trim(),
      tokenAddress: state.tokenAddress.trim(),
      wcEnabled: state.wcEnabled,
      wcProjectId: state.wcProjectId.trim() || null,
      adminToken: state.adminToken.trim() || null,
    };
    setStoredConfig(payload);
    setSaved(true);
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Setup Wizard</h1>
          <p style={{ margin: "4px 0", color: "#4b5563" }}>
            Configure the chain + UI settings locally. Nothing is written to the server.
          </p>
        </div>
        <Link href="/">Back to explorer</Link>
      </header>

      <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: step === item ? "#111827" : "white",
                color: step === item ? "white" : "#374151",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Step {item}
            </div>
          ))}
        </div>

        {step === 1 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Select network</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="chain"
                  checked={state.chainId === 97}
                  onChange={() =>
                    setState((prev) => ({
                      ...prev,
                      chainId: 97,
                      bscscanBase: "https://testnet.bscscan.com",
                    }))
                  }
                />
                BSC Testnet (97)
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="chain"
                  checked={state.chainId === 56}
                  onChange={() =>
                    setState((prev) => ({
                      ...prev,
                      chainId: 56,
                      bscscanBase: "https://bscscan.com",
                    }))
                  }
                />
                BSC Mainnet (56)
              </label>
            </div>
            {mainnetWarning && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #f97316",
                  background: "#fff7ed",
                  color: "#9a3412",
                  fontSize: 13,
                }}
              >
                Mainnet mode: real funds are at stake. Double-check RPC + contract addresses before saving.
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>RPC + Explorer</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                RPC URL
                <input
                  value={state.rpcUrl}
                  onChange={(event) => setState((prev) => ({ ...prev, rpcUrl: event.target.value }))}
                  placeholder="https://"
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                {!isValidUrl(state.rpcUrl) && state.rpcUrl && (
                  <span style={{ color: "#dc2626", fontSize: 12 }}>Enter a valid http(s) URL.</span>
                )}
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                Explorer base URL
                <input
                  value={state.bscscanBase}
                  onChange={(event) => setState((prev) => ({ ...prev, bscscanBase: event.target.value }))}
                  placeholder="https://testnet.bscscan.com"
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                {!isValidUrl(state.bscscanBase) && state.bscscanBase && (
                  <span style={{ color: "#dc2626", fontSize: 12 }}>Enter a valid http(s) URL.</span>
                )}
              </label>
            </div>
          </section>
        )}

        {step === 3 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Contract addresses</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                Factory address
                <input
                  value={state.factoryAddress}
                  onChange={(event) => setState((prev) => ({ ...prev, factoryAddress: event.target.value }))}
                  placeholder="0x..."
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                {state.factoryAddress && !isValidAddress(state.factoryAddress) && (
                  <span style={{ color: "#dc2626", fontSize: 12 }}>Enter a valid 0x address or ZERO_ADDRESS.</span>
                )}
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                Token address
                <input
                  value={state.tokenAddress}
                  onChange={(event) => setState((prev) => ({ ...prev, tokenAddress: event.target.value }))}
                  placeholder="0x..."
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                {state.tokenAddress && !isValidAddress(state.tokenAddress) && (
                  <span style={{ color: "#dc2626", fontSize: 12 }}>Enter a valid 0x address or ZERO_ADDRESS.</span>
                )}
              </label>
            </div>
            {zeroAddressWarnings.length > 0 && (
              <div style={{ marginTop: 12, color: "#9a3412", fontSize: 13 }}>
                {zeroAddressWarnings.map((warning) => (
                  <div key={warning}>⚠️ {warning}</div>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>WalletConnect</h2>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={state.wcEnabled}
                onChange={(event) => setState((prev) => ({ ...prev, wcEnabled: event.target.checked }))}
              />
              Enable WalletConnect
            </label>
            {state.wcEnabled && (
              <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
                WalletConnect Project ID
                <input
                  value={state.wcProjectId}
                  onChange={(event) => setState((prev) => ({ ...prev, wcProjectId: event.target.value }))}
                  placeholder="Project ID"
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
                {!state.wcProjectId.trim() && (
                  <span style={{ color: "#dc2626", fontSize: 12 }}>Project ID is required when enabled.</span>
                )}
              </label>
            )}
          </section>
        )}

        {step === 5 && (
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Review + Save</h2>
            <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
              <div>Chain ID: {state.chainId}</div>
              <div>RPC: {state.rpcUrl || "—"}</div>
              <div>Explorer: {state.bscscanBase || "—"}</div>
              <div>Factory: {state.factoryAddress || "—"}</div>
              <div>Token: {state.tokenAddress || "—"}</div>
              <div>WalletConnect: {state.wcEnabled ? "Enabled" : "Disabled"}</div>
              {state.wcEnabled && <div>WC Project ID: {state.wcProjectId || "—"}</div>}
            </div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <h3 style={{ marginTop: 0 }}>Admin passphrase</h3>
              <p style={{ marginTop: 4, color: "#4b5563", fontSize: 13 }}>
                Set a local admin passphrase to access the admin dashboard. Store it safely.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={state.adminToken}
                  onChange={(event) => setState((prev) => ({ ...prev, adminToken: event.target.value }))}
                  placeholder="Admin passphrase"
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    minWidth: 260,
                    flex: 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setState((prev) => ({ ...prev, adminToken: generateToken() }))}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  Generate
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={saveConfig}
              style={{
                marginTop: 16,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111827",
                background: "#111827",
                color: "white",
                cursor: "pointer",
              }}
            >
              Save configuration
            </button>

            {saved && (
              <div style={{ marginTop: 12, color: "#16a34a", fontSize: 14 }}>
                Saved! You can now return to the explorer or open the admin dashboard.
              </div>
            )}
          </section>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: step === 1 ? "not-allowed" : "pointer",
            }}
          >
            Back
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canContinue}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: canContinue ? "#111827" : "#9ca3af",
                color: "white",
                cursor: canContinue ? "pointer" : "not-allowed",
              }}
            >
              Continue
            </button>
          ) : (
            <Link href="/">Return home</Link>
          )}
        </div>
      </div>
    </main>
  );
}
