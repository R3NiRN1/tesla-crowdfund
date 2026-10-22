// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  createPublicClient, custom, TransactionReceiptNotFoundError,
  type Hash, type PublicActions, type Transaction, type TransactionReceipt, type WatchBlockNumberParameters,
} from "viem";
import { waitForTransactionReceipt } from "viem/actions";

const account = "0x1111111111111111111111111111111111111111";
const target = "0x2222222222222222222222222222222222222222";
const hash = `0x${"a".repeat(64)}` as Hash;
const replacementHash = `0x${"b".repeat(64)}` as Hash;
const blockHash = `0x${"c".repeat(64)}` as Hash;
const reasons = ["repriced", "cancelled"] as const;

function replacementFixture(reason: typeof reasons[number]) {
  const original = {
    hash, from: account, to: target, nonce: 0, input: "0x1234", value: 0n,
    blockNumber: null, blockHash: null, transactionIndex: null,
    gas: 21_000n, gasPrice: 1n, r: hash, s: hash, v: 27n, type: "legacy", typeHex: "0x0",
  } satisfies Transaction;
  const replacement = {
    ...original, hash: replacementHash, blockNumber: 100n, blockHash, transactionIndex: 0,
    to: reason === "cancelled" ? account : target,
    input: reason === "cancelled" ? "0x" : original.input, gasPrice: 2n,
  } satisfies Transaction;
  const receipt: TransactionReceipt = {
    transactionHash: replacementHash, from: account, to: replacement.to,
    status: "success", blockNumber: 100n, blockHash, transactionIndex: 0,
    contractAddress: null, cumulativeGasUsed: 21_000n, effectiveGasPrice: 2n,
    gasUsed: 21_000n, logs: [], logsBloom: "0x", type: "legacy",
  };
  let onBlock: WatchBlockNumberParameters["onBlockNumber"] | undefined;
  let ready!: () => void;
  const watching = new Promise<void>((resolve) => { ready = resolve; });
  let stopped = false;
  let previous = 99n;
  const watch = vi.fn((parameters: WatchBlockNumberParameters) => {
    onBlock = parameters.onBlockNumber;
    ready();
    return () => { stopped = true; };
  });
  // Only chain reads and block delivery are fixtures; replacement detection stays in Viem.
  const client = createPublicClient({ transport: custom({
    async request() { throw new Error("Unexpected transport call: network access is forbidden"); },
  }) }).extend(() => ({
    // The waiter requests only the pending original and a block's full transaction list.
    getTransaction: (async () => original) as unknown as PublicActions["getTransaction"],
    getBlock: (async () => ({ transactions: [replacement] })) as unknown as PublicActions["getBlock"],
    getTransactionReceipt: async ({ hash: requested }: { hash: Hash }) => {
      if (requested === hash) throw new TransactionReceiptNotFoundError({ hash });
      if (requested !== replacementHash) throw new Error("Unexpected receipt hash");
      return receipt;
    },
    watchBlockNumber: watch,
  }));
  const wait = (confirmations: number, onReplaced: NonNullable<Parameters<typeof waitForTransactionReceipt>[1]["onReplaced"]>) =>
    waitForTransactionReceipt(client, { hash, confirmations, onReplaced, retryCount: 0, timeout: 1_000 });
  const advance = async (block: bigint) => {
    await watching;
    if (!stopped) await onBlock!(block, previous);
    previous = block;
  };
  return { wait, advance, watching, watch, receipt };
}

test("limitation characterizations match the reviewed installed Viem source", () => {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("viem/package.json"));
  expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("2.56.1");
  const source = readFileSync(join(root, "_esm/actions/public/waitForTransactionReceipt.js"), "utf8").replace(/\r\n/g, "\n");
  expect(createHash("sha256").update(source).digest("hex"))
    .toBe("e72a5a4fd53569e4465c5e5bd9c1dd146c79d16fa9cd9ea504d3455dda0d185e");
});

test.each(reasons)("one-confirmation waiter captures %s before the separate depth guard", async (reason) => {
  const fixture = replacementFixture(reason);
  const replaced = vi.fn();
  const result = fixture.wait(1, replaced);
  await fixture.advance(100n);
  expect(await result).toEqual(fixture.receipt);
  expect(replaced).toHaveBeenCalledTimes(1);
  expect(replaced.mock.calls[0][0]).toMatchObject({
    reason, replacedTransaction: { hash }, transaction: { hash: replacementHash, nonce: 0 },
    transactionReceipt: { transactionHash: replacementHash, blockNumber: 100n },
  });
  await fixture.advance(101n);
  await fixture.advance(102n);
  expect(replaced).toHaveBeenCalledTimes(1);
});

// These document upstream limitations, not acceptable application finality policy.
test.each(reasons)("three-confirmation waiter skips %s callback when replacement is found before depth", async (reason) => {
  const fixture = replacementFixture(reason);
  const replaced = vi.fn();
  let settled = false;
  const result = fixture.wait(3, replaced).then((receipt) => { settled = true; return receipt; });
  await fixture.advance(100n);
  await fixture.advance(101n);
  expect(settled).toBe(false);
  await fixture.advance(102n);
  expect(await result).toEqual(fixture.receipt);
  expect(replaced).not.toHaveBeenCalled();
});

test.each(reasons)("an existing three-confirmation observer dominates a later one-confirmation %s observer", async (reason) => {
  const fixture = replacementFixture(reason);
  const firstCallback = vi.fn();
  const laterCallback = vi.fn();
  const first = fixture.wait(3, firstCallback);
  await fixture.watching;
  let laterSettled = false;
  const later = fixture.wait(1, laterCallback).then((receipt) => { laterSettled = true; return receipt; });
  await fixture.advance(100n);
  expect(laterSettled).toBe(false);
  await fixture.advance(101n);
  expect(laterSettled).toBe(false);
  await fixture.advance(102n);
  expect(await Promise.all([first, later])).toEqual([fixture.receipt, fixture.receipt]);
  expect(fixture.watch).toHaveBeenCalledTimes(1);
  expect(firstCallback).not.toHaveBeenCalled();
  expect(laterCallback).not.toHaveBeenCalled();
});

test.each(reasons)("a first one-confirmation observer also resolves a later three-confirmation %s observer early", async (reason) => {
  const fixture = replacementFixture(reason);
  const firstCallback = vi.fn();
  const laterCallback = vi.fn();
  const first = fixture.wait(1, firstCallback);
  await fixture.watching;
  const later = fixture.wait(3, laterCallback);
  await fixture.advance(100n);
  expect(await Promise.all([first, later])).toEqual([fixture.receipt, fixture.receipt]);
  expect(fixture.watch).toHaveBeenCalledTimes(1);
  expect(firstCallback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason }));
  expect(laterCallback).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ reason }));
  await fixture.advance(101n);
  await fixture.advance(102n);
  expect(laterCallback).toHaveBeenCalledTimes(1);
});
