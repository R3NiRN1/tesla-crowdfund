import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import CampaignV2Actions from "@/components/CampaignV2Actions";
import type { CampaignParticipantView, CampaignView } from "@/lib/readCampaign";

const fixture = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  read: vi.fn(), write: vi.fn(), lookup: vi.fn(), head: vi.fn(),
  mutation: {} as { onSuccess: (hash: string, input: { address: string }) => void },
  receipt: undefined as undefined | { status: string; transactionHash: string; from: string; to: string },
}));
vi.mock("@/lib/readCampaign", async (original) => ({ ...await original<typeof import("@/lib/readCampaign")>(), readCampaignParticipant: fixture.read }));
vi.mock("@/lib/useNetworkGuard", () => ({ useNetworkGuard: () => ({ expectedChainId: 97, blockWrites: false, message: null }) }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: fixture.address, chainId: 97, isConnected: true }),
  useWriteContract: ({ mutation }: { mutation: typeof fixture.mutation }) => {
    fixture.mutation = mutation;
    return { writeContract: fixture.write, isPending: false, error: null };
  },
  usePublicClient: () => ({ getTransactionReceipt: fixture.lookup, getBlockNumber: fixture.head }),
  useBlockNumber: () => ({ data: 102n }),
  useWaitForTransactionReceipt: ({ hash }: { hash?: string }) => ({ data: hash ? fixture.receipt : undefined, error: null, refetch: vi.fn() }),
}));
const hash = ("0x" + "c".repeat(64)) as `0x${string}`;
let sequence = 100;
function campaign(): CampaignView {
  return {
    address: ("0x" + (++sequence).toString(16).padStart(40, "0")) as `0x${string}`,
    contractVersion: "2.0.0-alpha", description: "Test", goal: 100n, deadline: 1n,
    owner: "0x3333333333333333333333333333333333333333", token: "0x4444444444444444444444444444444444444444",
    arbitrator: "0x5555555555555555555555555555555555555555", state: 2, totalContributed: 100n,
    totalReleased: 0n, totalRefunded: 0n, nextMilestone: 0n, milestoneSubmissionDeadline: 0n,
    remainingToGoal: 0n, challengeThresholdWeight: 10n, refundPoolSnapshot: 100n,
    refundPoolRemaining: 100n, refundableBackersRemaining: 1n, uniqueBackerCount: 1n, milestones: [],
  };
}
const participant: CampaignParticipantView = { contribution: 100n, vote: 0, refundClaimed: false };
beforeEach(() => {
  fixture.address = "0x1111111111111111111111111111111111111111";
  fixture.receipt = undefined;
  fixture.read.mockResolvedValue(participant);
  fixture.write.mockImplementation((input) => fixture.mutation.onSuccess(hash, input));
  fixture.lookup.mockImplementation(async () => {
    if (fixture.receipt) return { ...fixture.receipt, blockNumber: 100n };
    throw new Error("RPC unavailable");
  });
  fixture.head.mockResolvedValue(102n);
});

test("successful action notifies once despite a new parent callback and campaign object", async () => {
  const input = campaign();
  fixture.receipt = { status: "success", transactionHash: hash, from: fixture.address, to: input.address };
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = render(<CampaignV2Actions campaign={input} onChanged={first} />);
  const button = screen.getByRole("button", { name: "Claim pro-rata refund" });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
  const reads = fixture.read.mock.calls.length;
  rerender(<CampaignV2Actions campaign={{ ...input, milestones: [] }} onChanged={second} />);
  expect(second).not.toHaveBeenCalled();
  expect(fixture.read).toHaveBeenCalledTimes(reads);
});

test("late participant read from the previous wallet cannot enable the current wallet", async () => {
  let resolveOld!: (value: CampaignParticipantView) => void;
  fixture.read.mockReturnValueOnce(new Promise<CampaignParticipantView>((resolve) => { resolveOld = resolve; }));
  const input = campaign();
  const { rerender } = render(<CampaignV2Actions campaign={input} onChanged={vi.fn()} />);
  fixture.address = "0x6666666666666666666666666666666666666666";
  fixture.read.mockResolvedValue({ contribution: 0n, vote: 0, refundClaimed: false });
  rerender(<CampaignV2Actions campaign={input} onChanged={vi.fn()} />);
  await screen.findByText(/observer; contribution weight/);
  await act(async () => resolveOld(participant));
  expect((screen.getByRole("button", { name: "Claim pro-rata refund" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/observer; contribution weight/)).toBeTruthy();
  expect(fixture.write).not.toHaveBeenCalled();
});

test("participant read errors block actions and expose a read-only retry", async () => {
  fixture.read.mockRejectedValue(new Error("RPC timeout"));
  render(<CampaignV2Actions campaign={campaign()} onChanged={vi.fn()} />);
  await screen.findByText(/Wallet state read failed/);
  fireEvent.click(screen.getByRole("button", { name: "Claim pro-rata refund" }));
  expect(fixture.write).not.toHaveBeenCalled();
  fixture.read.mockResolvedValue(participant);
  fireEvent.click(screen.getByRole("button", { name: "Retry wallet state" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Claim pro-rata refund" }) as HTMLButtonElement).disabled).toBe(false));
  expect(fixture.write).not.toHaveBeenCalled();
});
