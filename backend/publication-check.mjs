import assert from "node:assert/strict";
import ethersPackage from "ethers";

import {
  publicationVerificationInternals,
  verifyCampaignPublication,
} from "./publication-verifier.mjs";

const { ethers } = ethersPackage;
const { factoryInterface, campaignInterface, EXPECTED_FACTORY_VERSION } = publicationVerificationInternals;

const factoryAddress = "0x1000000000000000000000000000000000000001";
const tokenAddress = "0x2000000000000000000000000000000000000002";
const arbitratorAddress = "0x3000000000000000000000000000000000000003";
const creatorAddress = "0x4000000000000000000000000000000000000004";
const campaignAddress = "0x5000000000000000000000000000000000000005";
const otherAddress = "0x6000000000000000000000000000000000000006";
const txHash = `0x${"a".repeat(64)}`;
const blockNumber = 100;
const blockTimestamp = 1_700_000_000;

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

const expectedDeadline = ethers.BigNumber.from(blockTimestamp).add(submission.contractInput.duration);

function creationData(metadataURI = submission.metadataURI, senderDescription = submission.contractInput.description) {
  return factoryInterface.encodeFunctionData("createCampaignWithMetadata", [
    senderDescription,
    metadataURI,
    submission.contractInput.goal,
    submission.contractInput.duration,
    submission.contractInput.milestoneDescriptions,
    submission.contractInput.milestoneAmounts,
  ]);
}

function creationLog({ token = tokenAddress, owner = creatorAddress, metadataURI = submission.metadataURI } = {}) {
  const event = factoryInterface.getEvent("CampaignV2Created");
  const encoded = factoryInterface.encodeEventLog(event, [
    campaignAddress,
    owner,
    token,
    arbitratorAddress,
    submission.contractInput.description,
    metadataURI,
    submission.contractInput.goal,
    expectedDeadline,
  ]);
  return { address: factoryAddress, topics: encoded.topics, data: encoded.data };
}

function makeProvider(options = {}) {
  const transaction = {
    hash: txHash,
    to: options.transactionTo ?? factoryAddress,
    from: options.transactionFrom ?? creatorAddress,
    data: options.transactionData ?? creationData(),
    value: ethers.constants.Zero,
  };
  const receipt = options.receipt === null
    ? null
    : {
        transactionHash: txHash,
        status: options.receiptStatus ?? 1,
        to: options.receiptTo ?? factoryAddress,
        from: options.receiptFrom ?? creatorAddress,
        blockNumber,
        logs: options.logs ?? [creationLog(options.event ?? {})],
      };

  return {
    async getNetwork() {
      return { chainId: options.chainId ?? config.chainId };
    },
    async getTransactionReceipt() {
      return receipt;
    },
    async getTransaction() {
      return options.transaction === null ? null : transaction;
    },
    async getBlockNumber() {
      return options.latestBlock ?? blockNumber + 5;
    },
    async getBlock() {
      return options.block === null ? null : { number: blockNumber, timestamp: blockTimestamp };
    },
    async getCode(address) {
      if (options.missingCodeAddress && address.toLowerCase() === options.missingCodeAddress.toLowerCase()) return "0x";
      return "0x60006000";
    },
    async call(request) {
      const target = request.to.toLowerCase();
      const selector = request.data.slice(0, 10);

      if (target === factoryAddress.toLowerCase()) {
        if (selector === factoryInterface.getSighash("CONTRACT_VERSION")) {
          return factoryInterface.encodeFunctionResult("CONTRACT_VERSION", [options.factoryVersion ?? EXPECTED_FACTORY_VERSION]);
        }
        if (selector === factoryInterface.getSighash("token")) {
          return factoryInterface.encodeFunctionResult("token", [options.factoryToken ?? tokenAddress]);
        }
        if (selector === factoryInterface.getSighash("arbitrator")) {
          return factoryInterface.encodeFunctionResult("arbitrator", [options.factoryArbitrator ?? arbitratorAddress]);
        }
      }

      if (target === campaignAddress.toLowerCase()) {
        if (selector === campaignInterface.getSighash("owner")) {
          return campaignInterface.encodeFunctionResult("owner", [options.campaignOwner ?? creatorAddress]);
        }
        if (selector === campaignInterface.getSighash("token")) {
          return campaignInterface.encodeFunctionResult("token", [options.campaignToken ?? tokenAddress]);
        }
        if (selector === campaignInterface.getSighash("arbitrator")) {
          return campaignInterface.encodeFunctionResult("arbitrator", [options.campaignArbitrator ?? arbitratorAddress]);
        }
        if (selector === campaignInterface.getSighash("goal")) {
          return campaignInterface.encodeFunctionResult("goal", [options.campaignGoal ?? submission.contractInput.goal]);
        }
        if (selector === campaignInterface.getSighash("deadline")) {
          return campaignInterface.encodeFunctionResult("deadline", [options.campaignDeadline ?? expectedDeadline]);
        }
        if (selector === campaignInterface.getSighash("description")) {
          return campaignInterface.encodeFunctionResult("description", [options.campaignDescription ?? submission.contractInput.description]);
        }
        if (selector === campaignInterface.getSighash("milestoneCount")) {
          return campaignInterface.encodeFunctionResult("milestoneCount", [options.milestoneCount ?? submission.contractInput.milestoneDescriptions.length]);
        }
      }

      throw new Error(`unexpected eth_call target=${request.to} selector=${selector}`);
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
assert.equal(verified.campaignAddress, ethers.utils.getAddress(campaignAddress));
assert.equal(verified.factoryAddress, factoryAddress);
assert.equal(verified.chainId, 97);
assert.equal(verified.tokenAddress, tokenAddress);
assert.equal(verified.factoryVersion, EXPECTED_FACTORY_VERSION);
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
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ campaignGoal: "301" }) }),
  "publish-campaign-state-mismatch",
);
await expectCode(
  verifyCampaignPublication({ transactionHash: txHash, submission, creatorAddress, config, provider: makeProvider({ latestBlock: blockNumber + 1 }) }),
  "publish-insufficient-confirmations",
);

console.log("backend:publication-check passed");
