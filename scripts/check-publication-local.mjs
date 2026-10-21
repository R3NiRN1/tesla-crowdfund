import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, http } from "viem";

import { publicationVerificationInternals, verifyCampaignPublication } from "../backend/publication-verifier.mjs";

const rpcUrl = "http://127.0.0.1:8545";
const publicClient = createPublicClient({ transport: http(rpcUrl) });
assert.equal(await publicClient.getChainId(), 31337, "publication regression check requires the local chain");

const deployment = JSON.parse(await readFile(new URL("../deployments/localhost.json", import.meta.url), "utf8"));
assert.equal(deployment.chainId, 31337);
assert.equal(deployment.metadata.tokenSource, "MockTES");
const factoryAddress = deployment.contracts.FactoryV2;
const wallet = createWalletClient({ transport: http(rpcUrl) });
const [, creatorAddress] = await wallet.getAddresses();
assert.ok(creatorAddress, "local chain must expose a second unlocked test account");

const submission = {
  metadataURI: "ipfs://local-publication-regression",
  contractInput: {
    description: "Local publication regression",
    goal: "300",
    duration: "3600",
    milestoneDescriptions: ["First", "Second"],
    milestoneAmounts: ["100", "200"],
  },
};
const transactionHash = await wallet.writeContract({
  account: creatorAddress,
  chain: null,
  address: factoryAddress,
  abi: publicationVerificationInternals.factoryAbi,
  functionName: "createCampaignWithMetadata",
  args: [submission.contractInput.description, submission.metadataURI, 300n, 3600n, ["First", "Second"], [100n, 200n]],
});
assert.equal((await publicClient.waitForTransactionReceipt({ hash: transactionHash })).status, "success");

const result = await verifyCampaignPublication({
  transactionHash,
  submission,
  creatorAddress,
  config: {
    rpcUrl,
    chainId: 31337,
    factoryAddress,
    tokenAddress: deployment.contracts.Token,
    arbitratorAddress: deployment.contracts.Arbitrator,
    confirmations: 1,
  },
});
assert.equal(result.verifiedOnChain, true);
assert.equal(result.transactionHash, transactionHash);
assert.equal(result.publisherAddress.toLowerCase(), creatorAddress.toLowerCase());
assert.equal(result.factoryAddress.toLowerCase(), factoryAddress.toLowerCase());
assert.equal(result.metadataURI, submission.metadataURI);
console.log("Local-chain publication verification passed using the real Viem RPC client.");
