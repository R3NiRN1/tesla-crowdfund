import assert from "node:assert/strict";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  parseAbiParameters,
} from "viem";

import {
  publicationVerificationInternals,
  verifyCampaignPublication,
} from "./publication-verifier.mjs";

const {
  factoryAbi,
  campaignAbi,
  EXPECTED_FACTORY_VERSION,
  EXPECTED_CAMPAIGN_VERSION,
} = publicationVerificationInternals;

const factoryAddress = "0x1000000000000000000000000000000000000001";
const tokenAddress = "0x2000000000000000000000000000000000000002";
const arbitratorAddress = "0x3000000000000000000000000000000000000003";
const creatorAddress = "0x4000000000000000000000000000000000000004";
const campaignAddress = "0x5000000000000000000000000000000000000005";
const otherAddress = "0x6000000000000000000000000000000000000006";
const txHash = `0x${"a".repeat(64)}`;
const blockNumber = 100n;
const blockTimestamp = 1_700_000_000n;

const submission = {
  metadataURI: "ipfs://approved-metadata",
  contractInput: {
    description: "Approved V2 campaign",
    goal: "300",
    duration: "3600",
    milestoneDescriptions: ["First", "Second"],
    milestoneAmounts: ["100", "200"],
  },
};

const config = {
  rpcUrl: "https://rpc.invalid.example",
  chainId: 97,
  factoryAddress,
  tokenAddress,
  arbitratorAddress,
  confirmations: 3,
};

const expectedDeadline = blockTimestamp + BigInt(submission.contractInput.duration);

function creationData(metadataURI = submission.metadataURI, senderDescription = submission.contractInput.description) {
  return encodeFunctionData({
    abi: factoryAbi,
    functionName: "createCampaignWithMetadata",
    args: [
      senderDescription,
      metadataURI,
      BigInt(submission.contractInput.goal),
      BigInt(submission.contractInput.duration),
      submission.contractInput.milestoneDescriptions,
      submission.contractInput.milestoneAmounts.map(BigInt),
    ],
  });
}

function creationLog({ token = tokenAddress, owner = creatorAddress, metadataURI = submission.metadataURI } = {}) {
  const topics = encodeEventTopics({
    abi: factoryAbi,
    eventName: "CampaignV2Created",
    args: { campaign: campaignAddress, owner, token },
  });
  const data = encodeAbiParameters(
    parseAbiParameters("address arbitrator, string description, string metadataURI, uint256 goal, uint256 deadline"),
    [arbitratorAddress, submission.contractInput.description, metadataURI, BigInt(submission.contractInput.goal), expectedDeadline],
  );
  return { address: factoryAddress, topics, data };
}

function makeProvider(options = {}) {
  const transaction = {
    hash: txHash,
    to: options.transactionTo ?? factoryAddress,
    from: options.transactionFrom ?? creatorAddress,
    input: options.transactionData ?? creationData(),
    value: 0n,
  };
  const receipt = options.receipt === null
    ? null
    : {
        transactionHash: txHash,
        status: options.receiptStatus ?? "success",
        to: options.receiptTo ?? factoryAddress,
        from: options.receiptFrom ?? creatorAddress,
        blockNumber,
        logs: options.logs ?? [creationLog(options.event ?? {})],
      };

  return {
    async getChainId() {
      return options.chainId ?? config.chainId;
    },
    async getTransactionReceipt() {
      return receipt;
    },
    async getTransaction() {
      return options.transaction === null ? null : transaction;
    },
    async getBlockNumber() {
      return options.latestBlock ?? blockNumber + 5n;
    },
    async getBlock() {
      return options.block === null ? null : { number: blockNumber, timestamp: blockTimestamp };
    },
    async getCode({ address }) {
      if (options.missingCodeAddress && address.toLowerCase() === options.missingCodeAddress.toLowerCase()) return "0x";
      return "0x60006000";
    },
    async readContract({ address, functionName }) {
      const target = address.toLowerCase();
      if (target === factoryAddress.toLowerCase()) {
        if (functionName === "CONTRACT_VERSION") return options.factoryVersion ?? EXPECTED_FACTORY_VERSION;
        if (functionName === "token") return options.factoryToken ?? tokenAddress;
        if (functionName === "arbitrator") return options.factoryArbitrator ?? arbitratorAddress;
      }
      if (target === campaignAddress.toLowerCase()) {
        if (functionName === "CONTRACT_VERSION") return options.campaignVersion ?? EXPECTED_CAMPAIGN_VERSION;
        if (functionName === "owner") return options.campaignOwner ?? creatorAddress;
        if (functionName === "token") return options.campaignToken ?? tokenAddress;
        if (functionName === "arbitrator") return options.campaignArbitrator ?? arbitratorAddress;
        if (functionName === "goal") return BigInt(options.campaignGoal ?? submission.contractInput.goal);
        if (functionName === "deadline") return BigInt(options.campaignDeadline ?? expectedDeadline);
        if (functionName === "description") return options.campaignDescription ?? submission.contractInput.description;
        if (functionName === "milestoneCount") return BigInt(options.milestoneCount ?? submission.contractInput.milestoneDescriptions.length);
      }
      throw new Error(`unexpected readContract target=${address} function=${functionName}`);
    },
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

const verified = await verifyCampaignPublication({
  transactionHash: txHash,
  submission,
  creatorAddress,
  config,
  provider: makeProvider(),
});
assert.equal(verified.verifiedOnChain, true);
assert.equal(verified.campaignAddress, getAddress(campaignAddress));
assert.equal(verified.factoryAddress, factoryAddress);
assert.equal(verified.chainId, 97);
assert.equal(verified.tokenAddress, tokenAddress);
assert.equal(verified.factoryVersion, EXPECTED_FACTORY_VERSION);
assert.equal(verified.campaignVersion, EXPECTED_CAMPAIGN_VERSION);
assert.ok(verified.confirmations >= config.confirmations);

await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ receipt: null }) }),
  "publish-transaction-not-found",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ chainId: 56 }) }),
  "publish-wrong-chain",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ transactionTo: otherAddress }) }),
  "publish-wrong-factory",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ transactionFrom: otherAddress }) }),
  "publish-wrong-creator",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ transactionData: creationData("ipfs://forged") }) }),
  "publish-metadata-mismatch",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ factoryToken: otherAddress }) }),
  "publish-wrong-token",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ factoryVersion: "1.0.0" }) }),
  "publish-wrong-factory-version",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ campaignVersion: "1.0.0" }) }),
  "publish-wrong-campaign-version",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ campaignGoal: "301" }) }),
  "publish-campaign-state-mismatch",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ latestBlock: blockNumber + 1n }) }),
  "publish-insufficient-confirmations",
);

console.log("backend:publication-check passed");
