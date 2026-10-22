import { renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
const wallet = vi.hoisted(() => ({ chainId: 97 as number | undefined, isConnected: true }));
vi.mock("wagmi", () => ({ useAccount: () => wallet, useChainId: () => 97 }));
vi.mock("@/lib/usePublicConfig", () => ({ usePublicConfig: () => ({ chainId: 97 }) }));
beforeEach(() => { wallet.chainId = 97; wallet.isConnected = true; });
test("unsupported actual wallet chain cannot inherit the configured default chain", () => {
  wallet.chainId = 1;
  expect(renderHook(() => useNetworkGuard()).result.current).toMatchObject({ actualChainId: 1, blockWrites: true });
});
test("connected wallet with unknown chain is blocked", () => {
  wallet.chainId = undefined;
  expect(renderHook(() => useNetworkGuard()).result.current.blockWrites).toBe(true);
});
test("configured chain permits writes only when the actual wallet chain matches", () => {
  expect(renderHook(() => useNetworkGuard()).result.current).toMatchObject({ actualChainId: 97, blockWrites: false });
});
