import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Hash, type TransactionReceipt } from "viem";
import ApprovedBackendPublish from "@/components/ApprovedBackendPublish";
import { BackendClientError, type BackendSubmission } from "@/lib/backendClient";
import { campaignFactoryMetadataWriteAbi } from "@/lib/campaignFactoryMetadataWriteAbi";
import { clearTransactionRecovery, clearTransactionRequest, hasTransactionRequest, markTransactionRequest,
  readTransactionRecovery, saveTransactionRecovery } from "@/lib/transactionRecovery";

const fixture = vi.hoisted(() => ({
  address: "0x1111111111111111111111111111111111111111",
  chainId: 97 as number | null,
  blockWrites: false,
  factory: "0x2222222222222222222222222222222222222222",
  configuredChain: 97,
  write: vi.fn(), record: vi.fn(), refetch: vi.fn(), lookup: vi.fn(), block: vi.fn(),
  mutation: {} as { onSuccess?: (hash: Hash) => void; onError?: (error: Error) => void },
  wait: {} as { hash?: Hash; chainId?: number; confirmations?: number; onReplaced?: (event: unknown) => void },
  receipt: undefined as Partial<TransactionReceipt> | undefined,
  receiptError: null as Error | null,
}));
vi.mock("wagmi", () => {
  const client = { getTransactionReceipt: fixture.lookup, getBlockNumber: fixture.block };
  return {
  useAccount: () => ({ address: fixture.address, isConnected: Boolean(fixture.address) }),
  useWriteContract: (options?: { mutation?: typeof fixture.mutation }) => {
    fixture.mutation = options?.mutation ?? {};
    return { writeContract: fixture.write, isPending: false, error: null };
  },
  useWaitForTransactionReceipt: (options: typeof fixture.wait) => {
    fixture.wait = options;
    return { data: options.hash ? fixture.receipt : undefined, isLoading: false,
      error: options.hash ? fixture.receiptError : null, refetch: fixture.refetch };
  },
  usePublicClient: () => client,
  };
});
vi.mock("@/lib/backendClient", async (original) => ({
  ...await original<typeof import("@/lib/backendClient")>(), recordBackendPublish: fixture.record,
}));
vi.mock("@/lib/usePublicConfig", () => ({ usePublicConfig: () => ({
  chainId: fixture.configuredChain, factoryAddress: fixture.factory, isConfigured: true,
  bscscanBase: "https://testnet.bscscan.com",
}) }));
vi.mock("@/lib/useNetworkGuard", () => ({ useNetworkGuard: () => ({
  actualChainId: fixture.chainId, isWrongNetwork: fixture.chainId !== fixture.configuredChain,
  isMisconfigured: false, message: null,
  blockWrites: fixture.blockWrites || fixture.chainId === null || fixture.chainId !== fixture.configuredChain,
}) }));

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x3333333333333333333333333333333333333333" as const;
const F = "0x2222222222222222222222222222222222222222" as const;
const C = "0x4444444444444444444444444444444444444444" as const;
const H = `0x${"a".repeat(64)}` as Hash;
const H2 = `0x${"b".repeat(64)}` as Hash;
let sequence = 0;
let submission: BackendSubmission;
const key = () => `creator-publish:${submission.id}:${A}`;
const deploy = () => screen.getByRole("button", { name: "Publish from creator wallet" }) as HTMLButtonElement;
const retry = () => screen.getByRole("button", { name: "Retry backend verification" });
function evidence(hash = H): Partial<TransactionReceipt> {
  return { status: "success", transactionHash: hash, from: A, to: F, blockNumber: 100n, blockHash: H, logs: [{
    address: F, transactionHash: hash, blockHash: H, blockNumber: 100n,
    logIndex: 0, transactionIndex: 0, removed: false,
    topics: encodeEventTopics({ abi: campaignFactoryMetadataWriteAbi, eventName: "CampaignV2Created",
      args: { campaign: C, owner: A, token: B } }) as [Hash, Hash, Hash, Hash],
    data: encodeAbiParameters([{ type: "address" }, { type: "string" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }],
      [B, "test", "ipfs://approved", 100n, 3700n]),
  }] };
}
function published(hash = H): BackendSubmission {
  return { ...submission, status: "published", publish: {
    transactionHash: hash, campaignAddress: C, factoryAddress: F, chainId: 97,
    metadataURI: submission.metadataURI, publisherAddress: A, tokenAddress: B,
    arbitratorAddress: B, factoryVersion: "2", campaignVersion: "2", blockNumber: 100,
    confirmations: 3, verifiedOnChain: true, publishedAt: "2026-10-22T00:00:00Z",
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  fixture.address = A; fixture.chainId = 97; fixture.factory = F; fixture.configuredChain = 97;
  fixture.blockWrites = false;
  fixture.receipt = undefined; fixture.receiptError = null;
  submission = { id: `creator-${++sequence}`, status: "approved", creatorAddress: A,
    title: "test", shortDescription: "test", longDescription: "test", imageUrl: "", media: [],
    metadataURI: "ipfs://approved", contractInput: { description: "test", goal: "100", duration: "3600",
      milestoneDescriptions: ["one"], milestoneAmounts: ["100"] },
    readiness: { state: "contract-ready", reasons: [], checkedAt: "2026-10-22" },
    createdAt: "2026-10-22", updatedAt: "2026-10-22" };
  clearTransactionRecovery(key());
  clearTransactionRequest(key());
  clearTransactionRequest(`${key()}:scope:97:${F}`);
  fixture.write.mockImplementation((_input, callbacks) => {
    fixture.mutation.onSuccess?.(H); callbacks?.onSuccess?.(H);
  });
  fixture.record.mockImplementation(() => Promise.resolve(published()));
  fixture.lookup.mockRejectedValue(new Error("RPC unavailable"));
  fixture.block.mockResolvedValue(102n);
  fixture.refetch.mockResolvedValue({});
});

test("early confirmation rejection retries backend proof without a second wallet write", async () => {
  fixture.receipt = evidence();
  fixture.record.mockRejectedValueOnce(new BackendClientError(409, "publish-insufficient-confirmations", "Need three confirmations"));
  const callback = vi.fn();
  render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy());
  await screen.findByText("Need three confirmations");
  expect(deploy().disabled).toBe(true);
  fireEvent.click(retry());
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(fixture.write).toHaveBeenCalledTimes(1);
  expect(fixture.record.mock.calls.map((call) => call[1].transactionHash)).toEqual([H, H]);
});

test("unknown receipt state and RPC errors remain locked across account remount", async () => {
  const first = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  expect(deploy().disabled).toBe(true);
  expect(readTransactionRecovery(key())?.hash).toBe(H);
  first.unmount();
  fixture.address = B;
  const other = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  other.unmount(); fixture.address = A;
  fixture.receiptError = new Error("RPC unavailable");
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  expect(fixture.wait).toMatchObject({ hash: H, chainId: 97, confirmations: 1 });
  expect(fixture.record).not.toHaveBeenCalled();
});

test("hash survives wallet prompt unmount through mutation-level success", async () => {
  fixture.write.mockImplementation(() => {});
  const first = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  const callback = fixture.mutation.onSuccess;
  first.unmount();
  expect(callback).toBeTypeOf("function");
  act(() => callback?.(H));
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(fixture.wait.hash).toBe(H);
  expect(deploy().disabled).toBe(true);
});

test("parent callback churn is single-flight and calls only the latest callback once", async () => {
  fixture.receipt = evidence(); const request = deferred<BackendSubmission>();
  fixture.record.mockReturnValue(request.promise);
  const first = vi.fn(), latest = vi.fn();
  const view = render(<StrictMode><ApprovedBackendPublish submission={submission} onPublished={first} /></StrictMode>);
  fireEvent.click(deploy());
  await waitFor(() => expect(fixture.record).toHaveBeenCalledTimes(1));
  view.rerender(<StrictMode><ApprovedBackendPublish submission={{ ...submission }} onPublished={latest} /></StrictMode>);
  expect(fixture.record).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve(published()));
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1);
});

test("original chain receipt remains pinned after wallet network changes", () => {
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  expect(fixture.write.mock.calls[0][0]).toMatchObject({ account: A, chainId: 97 });
  fixture.chainId = 56;
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(fixture.wait).toMatchObject({ hash: H, chainId: 97 });
  expect(deploy().disabled).toBe(true);
});

test.each(["account", "target", "chainId"] as const)("hostile recovery %s mismatch neither publishes nor unlocks deployment", (field) => {
  const hint = { hash: H, account: A, target: F, chainId: 97 };
  saveTransactionRecovery(key(), { ...hint, [field]: field === "chainId" ? 56 : B });
  fixture.receipt = evidence();
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  expect(fixture.record).not.toHaveBeenCalled();
  expect(screen.queryByText("published", { exact: true })).toBeNull();
});

test.each(["transactionHash", "from", "to"] as const)("hostile receipt %s mismatch cannot release a recovery lock", (field) => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receipt = { ...evidence(), status: "reverted", [field]: field === "transactionHash" ? H2 : B };
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true); expect(fixture.record).not.toHaveBeenCalled();
  expect(readTransactionRecovery(key())?.hash).toBe(H);
});

test("generic reverted hook error unlocks only after independent matching RPC evidence", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receiptError = new Error("Transaction reverted with an unknown reason.");
  const proof = deferred<Partial<TransactionReceipt>>(); fixture.lookup.mockReturnValue(proof.promise);
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  await act(async () => proof.resolve({ ...evidence(), status: "reverted" }));
  await waitFor(() => expect(deploy().disabled).toBe(false));
  expect(readTransactionRecovery(key())).toBeNull(); expect(fixture.record).not.toHaveBeenCalled();
});

test("stale verification response cannot notify a different submission", async () => {
  fixture.receipt = evidence(); const proof = deferred<BackendSubmission>(); fixture.record.mockReturnValue(proof.promise);
  const callback = vi.fn(); const old = published();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy()); await waitFor(() => expect(fixture.record).toHaveBeenCalledTimes(1));
  view.rerender(<ApprovedBackendPublish submission={{ ...submission, id: "different" }} onPublished={callback} />);
  await act(async () => proof.resolve(old));
  expect(callback).not.toHaveBeenCalled(); expect(screen.queryByText("published", { exact: true })).toBeNull();
});

test.each(["identity", "hash", "chain", "unverified"])("mismatched backend %s response cannot become publication truth", async (kind) => {
  fixture.receipt = evidence(); const response = published();
  if (kind === "identity") response.id = "other";
  if (kind === "hash") response.publish!.transactionHash = H2;
  if (kind === "chain") response.publish!.chainId = 56;
  if (kind === "unverified") response.publish!.verifiedOnChain = false;
  fixture.record.mockResolvedValue(response); const callback = vi.fn();
  render(<ApprovedBackendPublish submission={submission} onPublished={callback} />); fireEvent.click(deploy());
  await screen.findByText(/Backend publication response did not match/);
  expect(callback).not.toHaveBeenCalled(); expect(deploy().disabled).toBe(true);
});

test.each(["cancelled", "replaced"])("%s replacement never auto-publishes or authorizes a redeployment", (reason) => {
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />); fireEvent.click(deploy());
  act(() => fixture.wait.onReplaced?.({ reason, replacedTransaction: { hash: H }, transaction: { hash: H2, from: A, to: A, input: "0x" },
    transactionReceipt: { ...evidence(H2), to: A } }));
  expect(deploy().disabled).toBe(true); expect(fixture.record).not.toHaveBeenCalled();
});

test("repriced identical creation tracks and verifies replacement hash, not original hash", async () => {
  const callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />); fireEvent.click(deploy());
  const input = encodeFunctionData({ abi: campaignFactoryMetadataWriteAbi, functionName: "createCampaignWithMetadata",
    args: ["test", "ipfs://approved", 100n, 3600n, ["one"], [100n]] });
  act(() => fixture.wait.onReplaced?.({ reason: "repriced", replacedTransaction: { hash: H }, transaction: { hash: H2, from: A, to: F, input },
    transactionReceipt: evidence(H2) }));
  expect(readTransactionRecovery(key())?.hash).toBe(H2);
  expect(fixture.wait.hash).toBe(H2);
  fixture.receipt = evidence(H2);
  fixture.record.mockResolvedValue(published(H2));
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(fixture.record.mock.calls[0][1].transactionHash).toBe(H2);
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("ambiguous wallet failure stays locked across remount and manually recovers proof without redeploying", async () => {
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("RPC timeout after broadcast")));
  const callback = vi.fn();
  const first = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy());
  expect(deploy().disabled).toBe(true);
  first.unmount();
  const second = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  expect(deploy().disabled).toBe(true);
  expect(fixture.record).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: "not-a-hash" } });
  expect((screen.getByRole("button", { name: "Track existing transaction" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  expect(fixture.wait).toMatchObject({ hash: H, chainId: 97 });
  expect(deploy().disabled).toBe(true);
  fixture.receipt = evidence();
  second.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test.each([4001, "nested", "typed"])("positively identified user rejection %s releases only the unsent intent", async (kind) => {
  const { UserRejectedRequestError } = await import("viem");
  const rejected = kind === "typed" ? new UserRejectedRequestError(new Error("Rejected"))
    : Object.assign(new Error("Rejected"), kind === "nested" ? { cause: { code: 4001 } } : { code: 4001 });
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(rejected));
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  expect(deploy().disabled).toBe(false);
  expect(readTransactionRecovery(key())).toBeNull();
});

test("pre-broadcast invalid ABI input does not create an ambiguous wallet lock", () => {
  submission.contractInput.goal = "invalid";
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  expect(fixture.write).not.toHaveBeenCalled();
  expect(deploy().disabled).toBe(false);
  expect(screen.getByText(/No wallet request was sent/)).toBeTruthy();
});

test("connected unknown chain blocks both deployment and recovered-hash verification", () => {
  fixture.chainId = null;
  const first = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  fireEvent.click(deploy()); expect(fixture.write).not.toHaveBeenCalled(); first.unmount();
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receipt = evidence();
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(fixture.record).not.toHaveBeenCalled();
});

test("blockWrites alone fails closed even when legacy network flags are clear", () => {
  fixture.blockWrites = true;
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 }); fixture.receipt = evidence();
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true); expect(fixture.record).not.toHaveBeenCalled();
});

test.each(["account", "network", "factory", "metadata", "status", "guard"])("%s scope change suppresses stale proof callbacks", async (kind) => {
  fixture.receipt = evidence(); const request = deferred<BackendSubmission>(); fixture.record.mockReturnValue(request.promise);
  const response = published(), callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />); fireEvent.click(deploy());
  await waitFor(() => expect(fixture.record).toHaveBeenCalledTimes(1));
  if (kind === "account") fixture.address = B;
  if (kind === "network") fixture.chainId = 56;
  if (kind === "factory") fixture.factory = B;
  if (kind === "metadata") submission = { ...submission, metadataURI: "ipfs://different" };
  if (kind === "status") submission = { ...submission, status: "rejected" };
  if (kind === "guard") fixture.blockWrites = true;
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  await act(async () => request.resolve(response));
  expect(callback).not.toHaveBeenCalled(); expect(screen.queryByText("published", { exact: true })).toBeNull();
  expect(deploy().disabled).toBe(true);
});

test("verified proof and throwing parent callback never reopen deployment or retry publication", async () => {
  fixture.receipt = evidence(); const callback = vi.fn(() => { throw new Error("parent failed"); });
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />); fireEvent.click(deploy());
  await screen.findByText(/campaign view could not refresh/);
  expect(deploy().disabled).toBe(true); expect(callback).toHaveBeenCalledTimes(1);
  view.unmount();
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true);
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("unknown tracking failure can retry original-chain receipt lookup without wallet writes", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receiptError = new Error("receipt RPC timed out");
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await waitFor(() => expect(fixture.lookup).toHaveBeenCalledTimes(1));
  expect(deploy().disabled).toBe(true);
  fixture.lookup.mockResolvedValue({ ...evidence(), status: "reverted" });
  fireEvent.click(screen.getByRole("button", { name: "Retry transaction tracking" }));
  await waitFor(() => expect(deploy().disabled).toBe(false));
  expect(fixture.write).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
});

test("session storage failure retains a tab-local recovery lock across remount", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />); fireEvent.click(deploy());
  view.unmount();
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(deploy().disabled).toBe(true); expect(fixture.wait.hash).toBe(H);
  expect(screen.getByText(/Keep this tab open and retain the transaction hash/)).toBeTruthy();
});

test("hostile manually recovered hash cannot bypass sender evidence or backend proof", async () => {
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Timeout")));
  const callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />); fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H2 } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  fixture.receipt = { ...evidence(H2), from: B };
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  expect(fixture.record).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled(); expect(deploy().disabled).toBe(true);
});

test("factory event from a different emitting contract is not publication evidence", () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receipt = evidence(); fixture.receipt.logs![0].address = B;
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  expect(fixture.record).not.toHaveBeenCalled(); expect(deploy().disabled).toBe(true);
});

test("only public recovery context is persisted, never backend proof or publication truth", () => {
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />); fireEvent.click(deploy());
  const stored = window.sessionStorage.getItem(`tes-wallet-recovery:v1:${key()}`);
  expect(JSON.parse(stored!)).toEqual({ version: 1, hash: H, account: A, target: F, chainId: 97 });
  expect(screen.queryByText("published", { exact: true })).toBeNull(); expect(fixture.record).not.toHaveBeenCalled();
});

test("server markup hydrates pending recovery without mismatch or an enabled deployment window", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  const element = <ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />;
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  expect((container.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  document.body.appendChild(container);
  const onRecoverableError = vi.fn(); let root!: Root;
  try {
    await act(async () => { root = hydrateRoot(container, element, { onRecoverableError }); });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(deploy().disabled).toBe(true); expect(fixture.wait.hash).toBe(H);
    expect(fixture.write).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount()); container.remove();
  }
});

test("a one-block reverted receipt cannot unlock deployment before three confirmations", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receiptError = new Error("Transaction reverted with an unknown reason.");
  fixture.lookup.mockResolvedValue({ ...evidence(), status: "reverted" }); fixture.block.mockResolvedValue(100n);
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await screen.findByText(/awaiting three confirmations/);
  expect(deploy().disabled).toBe(true); expect(readTransactionRecovery(key())?.hash).toBe(H);
  fixture.block.mockResolvedValue(102n);
  fireEvent.click(screen.getByRole("button", { name: "Retry transaction tracking" }));
  await waitFor(() => expect(deploy().disabled).toBe(false));
  expect(fixture.write).not.toHaveBeenCalled();
});

test("unknown reverted confirmation depth remains locked", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receiptError = new Error("Transaction reverted with an unknown reason.");
  fixture.lookup.mockResolvedValue({ ...evidence(), status: "reverted" }); fixture.block.mockRejectedValue(new Error("RPC unavailable"));
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await waitFor(() => expect(fixture.block).toHaveBeenCalled());
  expect(deploy().disabled).toBe(true); expect(readTransactionRecovery(key())?.hash).toBe(H);
});

test("hydrated shared request markers recover an unknown wallet hash without opening a new wallet prompt", async () => {
  markTransactionRequest(key());
  markTransactionRequest(`${key()}:scope:97:${F}`);
  const callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  expect(deploy().disabled).toBe(true); expect(fixture.write).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(`tes-wallet-recovery:v1:request:${key()}`)).toBe("1");
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  expect(hasTransactionRequest(key())).toBe(true);
  expect(fixture.wait).toMatchObject({ hash: H, chainId: 97 });
  fixture.receipt = evidence();
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
  expect(hasTransactionRequest(key())).toBe(false);
  expect(fixture.write).not.toHaveBeenCalled();
});

test("hydrated request marker cannot reinterpret the original factory after configuration changes", () => {
  markTransactionRequest(key()); markTransactionRequest(`${key()}:scope:97:${F}`);
  fixture.factory = B;
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  expect((screen.getByRole("button", { name: "Track existing transaction" }) as HTMLButtonElement).disabled).toBe(true);
  expect(deploy().disabled).toBe(true); expect(fixture.record).not.toHaveBeenCalled();
});

test("unscoped hostile request marker is a safety lock, never publication or wallet authority", () => {
  markTransactionRequest(key());
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  expect((screen.getByRole("button", { name: "Track existing transaction" }) as HTMLButtonElement).disabled).toBe(true);
  expect(deploy().disabled).toBe(true); expect(screen.queryByText("published", { exact: true })).toBeNull();
  expect(fixture.write).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
});

test("three-deep reverted receipt does not unlock when its canonical block hash changed", async () => {
  saveTransactionRecovery(key(), { hash: H, account: A, target: F, chainId: 97 });
  fixture.receiptError = new Error("Reverted");
  fixture.lookup.mockResolvedValueOnce({ ...evidence(), status: "reverted" })
    .mockResolvedValue({ ...evidence(), status: "reverted", blockHash: H2 });
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await screen.findByText(/no longer canonical/);
  expect(deploy().disabled).toBe(true); expect(readTransactionRecovery(key())?.hash).toBe(H);
  expect(fixture.write).not.toHaveBeenCalled();
});

test("wallet mutation success remains bound to immutable origin after account, chain and factory changes", () => {
  fixture.write.mockImplementation(() => {});
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />); fireEvent.click(deploy());
  const originSuccess = fixture.mutation.onSuccess;
  fixture.address = B; fixture.chainId = 56; fixture.configuredChain = 56; fixture.factory = B;
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  act(() => originSuccess?.(H));
  expect(readTransactionRecovery(key())).toEqual({ hash: H, account: A, target: F, chainId: 97 });
  expect(deploy().disabled).toBe(true); expect(fixture.record).not.toHaveBeenCalled();
  expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("uncertain request stays locked when a manually supplied older matching transaction reverted", async () => {
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Unknown broadcast outcome")));
  const callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H2 } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  fixture.receiptError = new Error("Older transaction reverted");
  fixture.lookup.mockResolvedValue({ ...evidence(H2), status: "reverted" });
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  await waitFor(() => expect(fixture.lookup).toHaveBeenCalled());
  await act(async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); });
  expect(hasTransactionRequest(key())).toBe(true);
  expect(hasTransactionRequest(`${key()}:scope:97:${F}`)).toBe(true);
  expect(deploy().disabled).toBe(true);
  expect(readTransactionRecovery(key())?.hash).toBe(H2);
  expect(callback).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
  fireEvent.click(deploy()); expect(fixture.write).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/recovery hint, not proof of the original wallet request/)).toBeTruthy();
  view.unmount();
  render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  expect(deploy().disabled).toBe(true); expect(hasTransactionRequest(key())).toBe(true);
});

test("uncertain request resolves only after matching backend publication proof while retaining the public hint", async () => {
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Unknown broadcast outcome")));
  fixture.receipt = evidence();
  const proof = deferred<BackendSubmission>(); fixture.record.mockReturnValue(proof.promise);
  const callback = vi.fn();
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  await waitFor(() => expect(fixture.record).toHaveBeenCalledTimes(1));
  expect(hasTransactionRequest(key())).toBe(true);
  expect(callback).not.toHaveBeenCalled(); expect(deploy().disabled).toBe(true);
  await act(async () => proof.resolve(published()));
  expect(callback).toHaveBeenCalledTimes(1);
  expect(hasTransactionRequest(key())).toBe(false);
  expect(hasTransactionRequest(`${key()}:scope:97:${F}`)).toBe(false);
  expect(readTransactionRecovery(key())?.hash).toBe(H);
  expect(deploy().disabled).toBe(true);
  view.unmount();
  render(<ApprovedBackendPublish submission={published()} onPublished={callback} />);
  expect(deploy().disabled).toBe(true);
  fireEvent.click(deploy()); expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("uncertain request storage-failure marker cannot be dropped by a later persistable older reverted hint", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Unknown broadcast outcome")));
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H2 } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  expect(hasTransactionRequest(key())).toBe(true);
  expect(screen.getByText(/Keep this tab open and retain the transaction hash/)).toBeTruthy();
  expect(readTransactionRecovery(key())).toBeNull();
  storage.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  expect(window.sessionStorage.getItem(`tes-wallet-recovery:v1:request:${key()}`)).toBe("1");
  expect(window.sessionStorage.getItem(`tes-wallet-recovery:v1:request:${key()}:scope:97:${F}`)).toBe("1");
  fixture.receiptError = new Error("Older transaction reverted");
  fixture.lookup.mockResolvedValue({ ...evidence(H2), status: "reverted" });
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await waitFor(() => expect(fixture.lookup).toHaveBeenCalled());
  await act(async () => { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); });
  expect(hasTransactionRequest(key())).toBe(true);
  expect(hasTransactionRequest(`${key()}:scope:97:${F}`)).toBe(true);
  expect(deploy().disabled).toBe(true);
  expect(readTransactionRecovery(key())?.hash).toBe(H2);
  expect(fixture.record).not.toHaveBeenCalled();
  fireEvent.click(deploy()); expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("uncertain request cannot persist a manual candidate when safety-marker storage alone fails", () => {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key.includes(":request:")) throw new Error("Safety-marker storage unavailable");
    setItem.call(this, key, value);
  });
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Unknown broadcast outcome")));
  render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H2 } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  expect(hasTransactionRequest(key())).toBe(true); expect(deploy().disabled).toBe(true);
  expect(readTransactionRecovery(key())).toBeNull();
  expect(window.sessionStorage.getItem(`tes-wallet-recovery:v1:${key()}`)).toBeNull();
  expect(screen.getByText(/hint was not saved/)).toBeTruthy();
  expect(fixture.record).not.toHaveBeenCalled(); expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("uncertain request marker survives matching backend proof when the public hint cannot be retained", async () => {
  fixture.write.mockImplementation(() => fixture.mutation.onError?.(new Error("Unknown broadcast outcome")));
  fixture.receipt = evidence();
  const proof = deferred<BackendSubmission>(); fixture.record.mockReturnValue(proof.promise);
  const callback = vi.fn();
  render(<ApprovedBackendPublish submission={submission} onPublished={callback} />);
  fireEvent.click(deploy());
  fireEvent.change(screen.getByLabelText("Publication transaction hash"), { target: { value: H } });
  fireEvent.click(screen.getByRole("button", { name: "Track existing transaction" }));
  await waitFor(() => expect(fixture.record).toHaveBeenCalledTimes(1));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await act(async () => proof.resolve(published()));
  expect(callback).toHaveBeenCalledTimes(1); expect(deploy().disabled).toBe(true);
  expect(hasTransactionRequest(key())).toBe(true);
  expect(hasTransactionRequest(`${key()}:scope:97:${F}`)).toBe(true);
  expect(readTransactionRecovery(key())?.hash).toBe(H);
  expect(screen.getByText(/Keep this tab open and retain the transaction hash/)).toBeTruthy();
  fireEvent.click(deploy()); expect(fixture.write).toHaveBeenCalledTimes(1);
});

test("a wallet-returned original hash still permits redeployment after a canonical three-deep revert", async () => {
  const view = render(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  fireEvent.click(deploy());
  expect(hasTransactionRequest(key())).toBe(false); expect(readTransactionRecovery(key())?.hash).toBe(H);
  fixture.receiptError = new Error("Original creation reverted");
  fixture.lookup.mockResolvedValue({ ...evidence(), status: "reverted" });
  view.rerender(<ApprovedBackendPublish submission={submission} onPublished={vi.fn()} />);
  await waitFor(() => expect(deploy().disabled).toBe(false));
  expect(readTransactionRecovery(key())).toBeNull(); expect(fixture.record).not.toHaveBeenCalled();
  expect(fixture.write).toHaveBeenCalledTimes(1);
});
