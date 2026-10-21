import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const CONTRACT_ARTIFACTS = [
  "Campaign.sol/Campaign.json",
  "CampaignFactory.sol/CampaignFactory.json",
  "CampaignFactoryV2.sol/CampaignFactoryV2.json",
  "CampaignV2.sol/CampaignV2.json",
  "MockDirectionalFeeToken.sol/MockDirectionalFeeToken.json",
  "MockTES.sol/MockTES.json",
];
const MAX_DEPLOYED_BYTES = 24_576;
const metadataHashPattern = /a2646970667358221220[0-9a-f]{64}64736f6c6343/g;

function artifactsDirectory(value, label) {
  const directory = path.resolve(String(value || ""));
  if (!value || !fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} must name an existing artifacts/contracts directory.`);
  }
  return directory;
}

function readRuntimeBytecode(directory, relativePath) {
  const filename = path.join(directory, relativePath);
  const artifact = JSON.parse(fs.readFileSync(filename, "utf8"));
  assert.match(artifact.deployedBytecode, /^0x[0-9a-f]*$/i, `${filename} has invalid deployed bytecode`);
  return artifact.deployedBytecode.slice(2).toLowerCase();
}

function normalizeSolcMetadataHashes(bytecode) {
  return bytecode.replace(
    metadataHashPattern,
    `a2646970667358221220${"0".repeat(64)}64736f6c6343`,
  );
}

const baselineDirectory = artifactsDirectory(
  process.env.BYTECODE_BASELINE_ARTIFACTS,
  "BYTECODE_BASELINE_ARTIFACTS",
);
const currentDirectory = artifactsDirectory(
  process.env.BYTECODE_CURRENT_ARTIFACTS || path.resolve("artifacts/contracts"),
  "BYTECODE_CURRENT_ARTIFACTS",
);

for (const relativePath of CONTRACT_ARTIFACTS) {
  const baseline = readRuntimeBytecode(baselineDirectory, relativePath);
  const current = readRuntimeBytecode(currentDirectory, relativePath);
  const baselineBytes = baseline.length / 2;
  const currentBytes = current.length / 2;

  assert.equal(currentBytes, baselineBytes, `${relativePath} deployed-bytecode size changed`);
  assert.ok(currentBytes <= MAX_DEPLOYED_BYTES, `${relativePath} exceeds the EIP-170 deployed-code limit`);
  assert.equal(
    normalizeSolcMetadataHashes(current),
    normalizeSolcMetadataHashes(baseline),
    `${relativePath} changed outside Solidity metadata hashes`,
  );
  console.log(`${relativePath}: ${currentBytes} bytes, executable content matches baseline`);
}
