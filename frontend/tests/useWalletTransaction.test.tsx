import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { Address, Hash } from "viem";
import { useWalletTransaction } from "@/lib/useWalletTransaction";
import WalletTransactionStatus from "@/components/WalletTransactionStatus";
import { markTransactionRequest, readTransactionRecovery, saveTransactionRecovery } from "@/lib/transactionRecovery";

const fixture = vi.hoisted(() => ({
  write: vi.fn(), lookup: vi.fn(), retry: vi.fn(), head: vi.fn(),
  mutation: {} as { onSuccess: (hash: string, input: object) => void; onError: (error: unknown, input: object) => void },
  receipt: undefined as undefined | { status: string; transactionHash: string; from: string; to: string },
  receiptError: null as Error | null,
  receiptParameters: {} as { chainId: number; hash?: string; onReplaced: (value: unknown) => void },
}));
vi.mock("wagmi", () => ({
  useWriteContract: ({ mutation }: { mutation: typeof fixture.mutation }) => {
    fixture.mutation = mutation;
    return { writeContract: fixture.write, isPending: false, error: null };
  },
  useWaitForTransactionReceipt: (parameters: typeof fixture.receiptParameters) => {
    fixture.receiptParameters = parameters;
    return { data: parameters.hash ? fixture.receipt : undefined, error: fixture.receiptError, refetch: fixture.retry };
  },
  usePublicClient: () => ({ getTransactionReceipt: fixture.lookup, getBlockNumber: fixture.head }),
  useBlockNumber: () => ({ data: 102n }),
}));
const account = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const hash = ("0x" + "a".repeat(64)) as Hash;
const newHash = ("0x" + "b".repeat(64)) as Hash;
let sequence = 0;
function Harness({ scope, done = () => {} }: { scope: string; done?: () => void }) {
  const transaction = useWalletTransaction({ recoveryKey: scope, account, chainId: 97, targets: [target], onSuccess: done });
  return <>
    <button disabled={transaction.blocked} onClick={() => transaction.send({ address: target, abi: [], functionName: "refund" })}>Send</button>
    <WalletTransactionStatus transaction={transaction} />
  </>;
}
beforeEach(() => {
  fixture.receipt = undefined;
  fixture.receiptError = null;
  fixture.write.mockImplementation((input) => fixture.mutation.onSuccess(hash, input));
  fixture.lookup.mockImplementation(async () => { if (fixture.receipt) return fixture.receipt; throw new Error("RPC unavailable"); });
  fixture.retry.mockResolvedValue(undefined);
  fixture.head.mockResolvedValue(102n);
});
const scope = () => `hook:${++sequence}`;
const proof = (status = "success") => ({ status, transactionHash: hash, from: account, to: target, blockNumber: 100n });

test("a successful matching receipt is delivered only once across rerenders", async () => {
  const key = scope();
  const first = vi.fn();
  fixture.receipt = proof();
  const { rerender } = render(<Harness scope={key} done={first} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(first).toHaveBeenCalledTimes(1));
  const second = vi.fn();
  rerender(<Harness scope={key} done={second} />);
  expect(second).not.toHaveBeenCalled();
});

test("a receipt from another wallet does not unlock or report success", async () => {
  const done = vi.fn();
  fixture.receipt = { ...proof(), from: target };
  render(<Harness scope={scope()} done={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/Receipt does not match/);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(done).not.toHaveBeenCalled();
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("generic receipt failure only unlocks after RPC proves a matching revert", async () => {
  const done = vi.fn();
  fixture.receiptError = new Error("execution reverted");
  fixture.lookup.mockResolvedValue(proof("reverted"));
  render(<Harness scope={scope()} done={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/Transaction reverted/);
  expect(done).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
});

test("a single mined receipt cannot bypass the confirmation waiter after an RPC failure", async () => {
  fixture.receiptError = new Error("RPC timeout");
  fixture.lookup.mockResolvedValue(proof());
  fixture.head.mockResolvedValue(100n);
  const done = vi.fn();
  render(<Harness scope={scope()} done={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fixture.lookup).toHaveBeenCalled());
  expect(done).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
});

test("wallet prompt stays reserved across remount and delayed hash is recovered", async () => {
  const key = scope();
  fixture.write.mockImplementation(() => {});
  const { unmount } = render(<Harness scope={key} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  const originalMutation = fixture.mutation;
  unmount();
  render(<Harness scope={key} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
  act(() => originalMutation.onSuccess(hash, fixture.write.mock.calls[0][0]));
  await screen.findByText(/Unverified transaction/);
  expect(fixture.receiptParameters).toMatchObject({ chainId: 97, hash });
});

test("ambiguous wallet failure retains lock and permits existing-hash recovery only", async () => {
  fixture.write.mockImplementation((input) => fixture.mutation.onError(new Error("transport timeout"), input));
  render(<Harness scope={scope()} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(/wallet outcome is unknown/);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(fixture.write).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Recovery transaction hash" }), { target: { value: hash } });
  fireEvent.click(screen.getByRole("button", { name: "Check existing transaction" }));
  await screen.findByText(/Unverified transaction/);
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("explicit nested wallet rejection safely releases the prompt reservation", async () => {
  fixture.write.mockImplementation((input) => fixture.mutation.onError({ cause: { code: 4001 } }, input));
  render(<Harness scope={scope()} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByText(/wallet outcome is unknown/)).toBeNull();
});

test("a persisted unknown request cannot enable a fresh send after reload", async () => {
  const key = scope();
  markTransactionRequest(key);
  render(<Harness scope={key} />);
  await screen.findByText(/wallet outcome is unknown/);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(fixture.write).not.toHaveBeenCalled();
});

test("late hash is saved to the origin even when mutation callbacks now belong to another scope", async () => {
  const origin = scope();
  const other = scope();
  fixture.write.mockImplementation(() => {});
  const { rerender } = render(<Harness scope={origin} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  const request = fixture.write.mock.calls[0][0];
  rerender(<Harness scope={other} />);
  act(() => fixture.mutation.onSuccess(hash, request));
  expect(readTransactionRecovery(origin)?.hash).toBe(hash);
  expect(readTransactionRecovery(other)).toBeNull();
  rerender(<Harness scope={origin} />);
  await screen.findByText(/Unverified transaction/);
});

test("an old receipt arriving with a scope change cannot notify the new scope", async () => {
  const origin = scope();
  const done = vi.fn();
  const { rerender } = render(<Harness scope={origin} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  fixture.receipt = proof();
  rerender(<Harness scope={scope()} done={done} />);
  await act(async () => {});
  expect(done).not.toHaveBeenCalled();
});

test("a reverted receipt with only one confirmation retains the send lock", async () => {
  fixture.receiptError = new Error("execution reverted");
  fixture.lookup.mockResolvedValue(proof("reverted"));
  fixture.head.mockResolvedValue(100n);
  render(<Harness scope={scope()} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(fixture.lookup).toHaveBeenCalled());
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText(/Transaction reverted/)).toBeNull();
});

test("cancellation never emits a successful campaign action", async () => {
  const done = vi.fn();
  const key = scope();
  const { rerender } = render(<Harness scope={key} done={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  act(() => fixture.receiptParameters.onReplaced({ reason: "cancelled", replacedTransaction: { hash },
    transaction: { hash: newHash, from: account, to: account }, transactionReceipt: { transactionHash: newHash } }));
  fixture.receipt = { ...proof(), transactionHash: newHash, to: account };
  rerender(<Harness scope={key} done={done} />);
  await screen.findByText(/cancelled or replaced/);
  expect(done).not.toHaveBeenCalled();
});

test("repriced hash is retained across remount and original-chain tracking is explicit", async () => {
  const key = scope();
  const { unmount } = render(<Harness scope={key} />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  act(() => fixture.receiptParameters.onReplaced({ reason: "repriced", replacedTransaction: { hash },
    transaction: { hash: newHash, from: account, to: target }, transactionReceipt: { transactionHash: newHash } }));
  unmount();
  render(<Harness scope={key} />);
  await screen.findByText(`Unverified transaction: ${newHash}`);
  expect(fixture.receiptParameters).toMatchObject({ chainId: 97, hash: newHash });
});

test.each(["account", "target", "chainId"])("tampered %s hint cannot deliver success", async (field) => {
  const key = scope();
  const hint = { hash, chainId: 97, account, target };
  saveTransactionRecovery(key, { ...hint, [field]: field === "chainId" ? 56 : "0x3333333333333333333333333333333333333333" });
  fixture.receipt = proof();
  const done = vi.fn();
  render(<Harness scope={key} done={done} />);
  await screen.findByText(/invalid transaction recovery hint/);
  expect(done).not.toHaveBeenCalled();
  expect(fixture.write).not.toHaveBeenCalled();
});
