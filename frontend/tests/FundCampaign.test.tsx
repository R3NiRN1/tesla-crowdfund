import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { parseEther } from "viem";
import FundCampaign from "@/components/FundCampaign";

const fixture = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  reads: [] as { result?: unknown; status?: string }[],
  write: vi.fn(),
  refetch: vi.fn(),
  lookup: vi.fn(),
  head: vi.fn(),
  retry: vi.fn(),
  mutation: {} as { onSuccess?: (hash: string, input: unknown) => void; onError?: () => void },
  receipts: new Map<string, { data?: { status: string; transactionHash: string; from: string; to: string; blockNumber?: bigint }; isLoading: boolean; error?: Error }>(),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: fixture.address, chainId: 97, isConnected: true }),
  useReadContracts: () => ({ data: fixture.reads, refetch: fixture.refetch, isLoading: false, isFetching: false, error: null }),
  usePublicClient: () => ({ getTransactionReceipt: fixture.lookup, getBlockNumber: fixture.head }),
  useBlockNumber: () => ({ data: 102n }),
  useWriteContract: ({ mutation }: { mutation: typeof fixture.mutation }) => {
    fixture.mutation = mutation;
    return { writeContract: fixture.write, isPending: false, error: null };
  },
  useWaitForTransactionReceipt: ({ hash }: { hash?: string }) => ({
    data: undefined, error: null, isLoading: false, refetch: fixture.retry,
    ...(hash ? fixture.receipts.get(hash) : {}),
  }),
}));
vi.mock("@/lib/useNetworkGuard", () => ({
  useNetworkGuard: () => ({ expectedChainId: 97, actualChainId: 97, blockWrites: false, message: null }),
}));
const hash = ("0x" + "a".repeat(64)) as `0x${string}`;
let campaignCounter = 10;
const props = () => ({
  token: "0x2222222222222222222222222222222222222222" as const,
  campaignAddress: ("0x" + (++campaignCounter).toString(16).padStart(40, "0")) as `0x${string}`,
  remainingToGoal: parseEther("100"),
});
beforeEach(() => {
  fixture.reads = [{ result: parseEther("1000") }, { result: parseEther("1000") }, { result: 18 }, { result: "TES" }];
  fixture.receipts.clear();
  fixture.refetch.mockResolvedValue(undefined);
  fixture.lookup.mockImplementation(async ({ hash }) => {
    const receipt = fixture.receipts.get(hash)?.data;
    if (receipt) return { ...receipt, blockNumber: 100n };
    throw new Error("RPC unavailable");
  });
  fixture.head.mockResolvedValue(102n);
  fixture.retry.mockResolvedValue(undefined);
  fixture.write.mockImplementation((input) => { fixture.mutation.onSuccess?.(hash, input); });
});

test("successful contribution notifies once even when the parent callback changes", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const input = props();
  fixture.receipts.set(hash, { data: { status: "success", transactionHash: hash, from: fixture.address, to: input.campaignAddress }, isLoading: false });
  const { rerender } = render(<FundCampaign {...input} onContributed={first} />);
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
  rerender(<FundCampaign {...input} onContributed={second} />);
  expect(second).not.toHaveBeenCalled();
});

test("confirmation pending blocks another wallet write", async () => {
  fixture.receipts.set(hash, { isLoading: true });
  render(<FundCampaign {...props()} />);
  const contribute = screen.getByRole("button", { name: "2. Contribute" });
  fireEvent.click(contribute);
  await waitFor(() => expect(fixture.write).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Contributing..." }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("failed token decimals cannot silently use an eighteen-decimal fallback", () => {
  fixture.reads[2] = { status: "failure" };
  render(<FundCampaign {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: /1. Approve/ }));
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  expect(fixture.write).not.toHaveBeenCalled();
});

test.each([0, 1])("failed critical read at index %s blocks all funding writes", (index) => {
  fixture.reads[index] = { status: "failure" };
  render(<FundCampaign {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: /1. Approve/ }));
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  expect(fixture.write).not.toHaveBeenCalled();
});

test.each(["0.0000000000000000001", "1e2", "-1", "1.2.3", "9".repeat(80)])("invalid or unrepresentable amount %s cannot be silently rounded", (amount) => {
  render(<FundCampaign {...props()} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  expect(fixture.write).not.toHaveBeenCalled();
});

test("insufficient balance blocks writes even with a large allowance", () => {
  fixture.reads[0] = { result: 1n };
  render(<FundCampaign {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: /1. Approve/ }));
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  expect(fixture.write).not.toHaveBeenCalled();
});

test("unknown receipt status stays locked and retry only reads the transaction", async () => {
  fixture.receipts.set(hash, { isLoading: false, error: new Error("RPC timeout") });
  render(<FundCampaign {...props()} />);
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  await screen.findByText(/Status unavailable/);
  fireEvent.click(screen.getByRole("button", { name: "Retry transaction status" }));
  fireEvent.click(screen.getByRole("button", { name: "Contributing..." }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
  expect(fixture.retry).toHaveBeenCalledTimes(1);
});

test("wallet prompt is synchronously single flight even before a hash exists", () => {
  fixture.write.mockImplementation(() => {});
  render(<FundCampaign {...props()} />);
  const button = screen.getByRole("button", { name: "2. Contribute" });
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: /1. Approve/ }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
  expect(fixture.write.mock.calls[0][0]).toMatchObject({ account: fixture.address, chainId: 97 });
});

test("pending hash is recovered after an account remount and never enables a duplicate send", async () => {
  const input = props();
  const { unmount } = render(<FundCampaign {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  unmount();
  render(<FundCampaign {...input} />);
  await screen.findByText(/Unverified transaction/);
  fireEvent.click(screen.getByRole("button", { name: "Contributing..." }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("confirmed approval does not substitute for an authoritative allowance read", async () => {
  const input = props();
  fixture.reads[1] = { result: 0n };
  fixture.receipts.set(hash, { data: { status: "success", transactionHash: hash, from: fixture.address, to: input.token }, isLoading: false });
  const { rerender } = render(<FundCampaign {...input} />);
  fireEvent.click(screen.getByRole("button", { name: /1. Approve/ }));
  await screen.findByText(/Transaction confirmed/);
  fixture.reads[1] = { status: "failure" };
  rerender(<FundCampaign {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "2. Contribute" }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
});
