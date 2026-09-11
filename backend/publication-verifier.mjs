import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  getAddress,
  http,
  parseAbi,
} from "viem";

const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";
const EXPECTED_CAMPAIGN_VERSION = "2.0.0-alpha";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const factoryAbi = parseAbi([
  "event CampaignV2Created(address indexed campaign,address indexed owner,address indexed token,address arbitrator,string description,string metadataURI,uint256 goal,uint256 deadline)",
  "function CONTRACT_VERSION() view returns (string)",
  "function token() view returns (address)",
  "function arbitrator() view returns (address)",
  "function createCampaignWithMetadata(string description,string metadataURI,uint256 goal,uint256 duration,string[] milestoneDescriptions,uint256[] milestoneAmounts) returns (address)",
]);

const campaignAbi = parseAbi([
  "function CONTRACT_VERSION() view returns (string)",
  "function owner() view returns (address)",
  "function token() view returns (address)",
  "function arbitrator() view returns (address)",
  "function goal() view returns (uint256)",
  "function deadline() view returns (uint256)",
  "function description() view returns (string)",
  "function milestoneCount() view returns (uint256)",
]);

function verificationError(code, message, statusCode = 422, detail = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.detail = detail;
  return error;
}

function normalizedAddress(value, field) {
  try {
    const address = getAddress(String(value || ""));
    if (address === ZERO_ADDRESS) throw new Error("zero address");
    return address;
  } catch {
    throw verificationError("publish-verification-config-invalid", `${field} must be a valid non-zero address`, 500, { field });
  }
}

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function requireEqual(actual, expected, code, message, detail = {}) {
  if (actual !== expected) throw verificationError(code, message, 422, { ...detail, expected, actual });
}

function requireAddress(actual, expected, code, message, detail = {}) {
  if (!sameAddress(actual, expected)) {
    throw verificationError(code, message, 422, { ...detail, expected, actual });
  }
}

function parsePositiveInteger(value, field, fallback = null) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw verificationError("publish-verification-config-invalid", `${field} must be a positive integer`, 500, { field });
  }
  return parsed;
}

export function getPublicationVerificationConfig(env = process.env) {
  const rpcUrl = String(env.BACKEND_RPC_URL || "").trim();
  if (!rpcUrl) {
    throw verificationError("publish-verification-not-configured", "BACKEND_RPC_URL is required for independent publication verification", 503);
  }
  let parsedRpc;
  try {
    parsedRpc = new URL(rpcUrl);
  } catch {
    throw verificationError("publish-verification-config-invalid", "BACKEND_RPC_URL must be a valid http(s) URL", 500);
  }
  if (!["http:", "https:"].includes(parsedRpc.protocol)) {
    throw verificationError("publish-verification-config-invalid", "BACKEND_RPC_URL must use http or https", 500);
  }

  return {
    rpcUrl,
    chainId: parsePositiveInteger(env.BACKEND_CHAIN_ID, "BACKEND_CHAIN_ID"),
    factoryAddress: normalizedAddress(env.BACKEND_FACTORY_V2_ADDRESS, "BACKEND_FACTORY_V2_ADDRESS"),
    tokenAddress: normalizedAddress(env.BACKEND_TOKEN_ADDRESS, "BACKEND_TOKEN_ADDRESS"),
    arbitratorAddress: normalizedAddress(env.BACKEND_ARBITRATOR_ADDRESS, "BACKEND_ARBITRATOR_ADDRESS"),
    confirmations: parsePositiveInteger(env.BACKEND_PUBLISH_CONFIRMATIONS, "BACKEND_PUBLISH_CONFIRMATIONS", 3),
  };
}

async function callView(provider, address, abi, functionName, blockNumber) {
  return provider.readContract({ address, abi, functionName, blockNumber });
}

function decodeCreationTransaction(transaction) {
  try {
    const decoded = decodeFunctionData({ abi: factoryAbi, data: transaction.input ?? transaction.data });
    if (decoded.functionName !== "createCampaignWithMetadata") throw new Error("wrong function");
    const [description, metadataURI, goal, duration, milestoneDescriptions, milestoneAmounts] = decoded.args;
    return { description, metadataURI, goal, duration, milestoneDescriptions, milestoneAmounts };
  } catch {
    throw verificationError(
      "publish-wrong-factory-call",
      "transaction is not a CampaignFactoryV2 createCampaignWithMetadata call",
    );
  }
}

function compareStringArray(actual, expected, field) {
  if (actual.length !== expected.length) {
    throw verificationError("publish-calldata-mismatch", `${field} length does not match approved submission`, 422, {
      field,
      expectedLength: expected.length,
      actualLength: actual.length,
    });
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (String(actual[i]) !== String(expected[i])) {
      throw verificationError("publish-calldata-mismatch", `${field}[${i}] does not match approved submission`, 422, { field, index: i });
    }
  }
}

function compareUintArray(actual, expected, field) {
  if (actual.length !== expected.length) {
    throw verificationError("publish-calldata-mismatch", `${field} length does not match approved submission`, 422, {
      field,
      expectedLength: expected.length,
      actualLength: actual.length,
    });
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== BigInt(expected[i])) {
      throw verificationError("publish-calldata-mismatch", `${field}[${i}] does not match approved submission`, 422, { field, index: i });
    }
  }
}

function findCreationEvent(receipt, factoryAddress) {
  const matching = [];
  for (const log of receipt.logs || []) {
    if (!sameAddress(log.address, factoryAddress)) continue;
    try {
      const parsed = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (parsed.eventName === "CampaignV2Created") matching.push(parsed.args);
    } catch {
      // Ignore unrelated logs emitted by the approved factory.
    }
  }
  if (matching.length !== 1) {
    throw verificationError(
      "publish-factory-event-missing",
      "transaction must contain exactly one CampaignV2Created event from the approved factory",
      422,
      { matchingEvents: matching.length },
    );
  }
  return matching[0];
}

export async function verifyCampaignPublication({ transactionHash, submission, creatorAddress, config, provider }) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(transactionHash || ""))) {
    throw verificationError("invalid-transaction-hash", "valid transactionHash is required", 400);
  }
  if (!submission?.contractInput) {
    throw verificationError("publish-submission-invalid", "approved submission contract input is missing", 500);
  }

  const verificationConfig = config ?? getPublicationVerificationConfig();
  const rpc = provider ?? createPublicClient({ transport: http(verificationConfig.rpcUrl) });

  let chainId;
  try {
    chainId = await rpc.getChainId();
  } catch (cause) {
    throw verificationError("publish-rpc-unavailable", "could not resolve configured BSC network", 503, { cause: cause?.message });
  }
  requireEqual(Number(chainId), verificationConfig.chainId, "publish-wrong-chain", "RPC network does not match configured publication chain");

  let receipt;
  let transaction;
  try {
    [receipt, transaction] = await Promise.all([
      rpc.getTransactionReceipt(transactionHash),
      rpc.getTransaction(transactionHash),
    ]);
  } catch (cause) {
    throw verificationError("publish-rpc-unavailable", "could not retrieve publication transaction", 503, { cause: cause?.message });
  }
  if (!receipt || !transaction) {
    throw verificationError("publish-transaction-not-found", "publication transaction was not found on the configured chain", 404);
  }
  if (receipt.status !== "success") {
    throw verificationError("publish-transaction-failed", "publication transaction did not succeed on-chain");
  }
  if (receipt.transactionHash && receipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw verificationError("publish-transaction-mismatch", "RPC receipt hash does not match requested transaction");
  }

  requireAddress(transaction.to, verificationConfig.factoryAddress, "publish-wrong-factory", "publication transaction did not call the approved V2 factory");
  requireAddress(receipt.to, verificationConfig.factoryAddress, "publish-wrong-factory", "publication receipt does not target the approved V2 factory");
  requireAddress(transaction.from, creatorAddress, "publish-wrong-creator", "publication transaction sender does not match the authenticated creator");
  if (receipt.from) requireAddress(receipt.from, creatorAddress, "publish-wrong-creator", "publication receipt sender does not match the authenticated creator");

  const latestBlock = await rpc.getBlockNumber();
  const confirmationsBigInt = latestBlock - receipt.blockNumber + 1n;
  const confirmations = Number(confirmationsBigInt);
  if (confirmations < verificationConfig.confirmations) {
    throw verificationError("publish-insufficient-confirmations", "publication transaction has not reached the configured confirmation threshold", 409, {
      required: verificationConfig.confirmations,
      confirmations,
      blockNumber: receipt.blockNumber,
    });
  }

  const factoryCode = await rpc.getCode({ address: verificationConfig.factoryAddress, blockNumber: receipt.blockNumber });
  if (!factoryCode || factoryCode === "0x") {
    throw verificationError("publish-factory-code-missing", "approved factory has no contract code at the publication block");
  }

  const [factoryVersion, factoryToken, factoryArbitrator] = await Promise.all([
    callView(rpc, verificationConfig.factoryAddress, factoryAbi, "CONTRACT_VERSION", receipt.blockNumber),
    callView(rpc, verificationConfig.factoryAddress, factoryAbi, "token", receipt.blockNumber),
    callView(rpc, verificationConfig.factoryAddress, factoryAbi, "arbitrator", receipt.blockNumber),
  ]);
  requireEqual(String(factoryVersion), EXPECTED_FACTORY_VERSION, "publish-wrong-factory-version", "approved factory does not report the expected V2 contract version");
  requireAddress(factoryToken, verificationConfig.tokenAddress, "publish-wrong-token", "factory token does not match backend-approved token");
  requireAddress(factoryArbitrator, verificationConfig.arbitratorAddress, "publish-wrong-arbitrator", "factory arbitrator does not match backend-approved arbitrator");

  const args = decodeCreationTransaction(transaction);
  const input = submission.contractInput;
  requireEqual(String(args.description), String(input.description), "publish-calldata-mismatch", "campaign description does not match approved submission");
  requireEqual(String(args.metadataURI), String(submission.metadataURI), "publish-metadata-mismatch", "metadata URI does not match approved submission");
  if (args.goal !== BigInt(input.goal)) {
    throw verificationError("publish-calldata-mismatch", "campaign goal does not match approved submission");
  }
  if (args.duration !== BigInt(input.duration)) {
    throw verificationError("publish-calldata-mismatch", "campaign duration does not match approved submission");
  }
  compareStringArray(args.milestoneDescriptions, input.milestoneDescriptions, "milestoneDescriptions");
  compareUintArray(args.milestoneAmounts, input.milestoneAmounts, "milestoneAmounts");

  const created = findCreationEvent(receipt, verificationConfig.factoryAddress);
  requireAddress(created.owner, creatorAddress, "publish-wrong-creator", "CampaignV2Created owner does not match authenticated creator");
  requireAddress(created.token, verificationConfig.tokenAddress, "publish-wrong-token", "CampaignV2Created token does not match backend-approved token");
  requireAddress(created.arbitrator, verificationConfig.arbitratorAddress, "publish-wrong-arbitrator", "CampaignV2Created arbitrator does not match backend-approved arbitrator");
  requireEqual(String(created.description), String(input.description), "publish-event-mismatch", "CampaignV2Created description does not match approved submission");
  requireEqual(String(created.metadataURI), String(submission.metadataURI), "publish-metadata-mismatch", "CampaignV2Created metadata URI does not match approved submission");
  if (created.goal !== BigInt(input.goal)) {
    throw verificationError("publish-event-mismatch", "CampaignV2Created goal does not match approved submission");
  }

  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  if (!block || !Number.isSafeInteger(Number(block.timestamp))) {
    throw verificationError("publish-block-unavailable", "publication block could not be verified", 503);
  }
  const expectedDeadline = BigInt(block.timestamp) + BigInt(input.duration);
  if (created.deadline !== expectedDeadline) {
    throw verificationError("publish-event-mismatch", "CampaignV2Created deadline does not match approved duration and publication block");
  }

  const campaignAddress = normalizedAddress(created.campaign, "CampaignV2Created.campaign");
  const campaignCode = await rpc.getCode({ address: campaignAddress, blockNumber: receipt.blockNumber });
  if (!campaignCode || campaignCode === "0x") {
    throw verificationError("publish-campaign-code-missing", "CampaignV2Created address has no contract code at the publication block");
  }

  const [campaignVersion, campaignOwner, campaignToken, campaignArbitrator, campaignGoal, campaignDeadline, campaignDescription, milestoneCount] = await Promise.all([
    callView(rpc, campaignAddress, campaignAbi, "CONTRACT_VERSION", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "owner", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "token", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "arbitrator", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "goal", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "deadline", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "description", receipt.blockNumber),
    callView(rpc, campaignAddress, campaignAbi, "milestoneCount", receipt.blockNumber),
  ]);

  requireEqual(String(campaignVersion), EXPECTED_CAMPAIGN_VERSION, "publish-wrong-campaign-version", "deployed campaign does not report the expected V2 contract version");
  requireAddress(campaignOwner, creatorAddress, "publish-campaign-state-mismatch", "deployed campaign owner does not match authenticated creator");
  requireAddress(campaignToken, verificationConfig.tokenAddress, "publish-campaign-state-mismatch", "deployed campaign token does not match approved token");
  requireAddress(campaignArbitrator, verificationConfig.arbitratorAddress, "publish-campaign-state-mismatch", "deployed campaign arbitrator does not match approved arbitrator");
  if (campaignGoal !== BigInt(input.goal)) throw verificationError("publish-campaign-state-mismatch", "deployed campaign goal does not match approved submission");
  if (campaignDeadline !== expectedDeadline) throw verificationError("publish-campaign-state-mismatch", "deployed campaign deadline does not match approved submission");
  requireEqual(String(campaignDescription), String(input.description), "publish-campaign-state-mismatch", "deployed campaign description does not match approved submission");
  if (milestoneCount !== BigInt(input.milestoneDescriptions.length)) {
    throw verificationError("publish-campaign-state-mismatch", "deployed campaign milestone count does not match approved submission");
  }

  return {
    transactionHash: transactionHash.toLowerCase(),
    campaignAddress,
    factoryAddress: verificationConfig.factoryAddress,
    chainId: verificationConfig.chainId,
    metadataURI: submission.metadataURI,
    publisherAddress: getAddress(creatorAddress),
    tokenAddress: verificationConfig.tokenAddress,
    arbitratorAddress: verificationConfig.arbitratorAddress,
    factoryVersion: String(factoryVersion),
    campaignVersion: String(campaignVersion),
    blockNumber: Number(receipt.blockNumber),
    confirmations,
    verifiedOnChain: true,
    verifiedAt: new Date().toISOString(),
  };
}

export const publicationVerificationInternals = {
  factoryAbi,
  campaignAbi,
  EXPECTED_FACTORY_VERSION,
  EXPECTED_CAMPAIGN_VERSION,
};
