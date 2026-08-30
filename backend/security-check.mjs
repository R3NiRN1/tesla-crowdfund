import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ethersPackage from "ethers";

const tempDb = path.join(os.tmpdir(), `tesla-crowdfund-security-check-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = tempDb;

const { issueWalletChallenge } = await import("./challenges.mjs");
const {
  activeWalletSessionCount,
  getWalletSession,
  revokeWalletSession,
  verifyWalletSignature,
} = await import("./auth.mjs");
const { ethers } = ethersPackage;

function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code);
}

try {
  const wallet = ethers.Wallet.createRandom();
  const first = issueWalletChallenge(wallet.address);
  const second = issueWalletChallenge(wallet.address);

  assert.notEqual(first.nonce, second.nonce);
  assert.ok(Date.parse(first.expiresAt) > Date.now());
  assert.ok(Date.parse(second.expiresAt) > Date.now());

  // A later challenge must not invalidate one already being signed.
  const firstSignature = await wallet.signMessage(first.message);
  const firstAuth = verifyWalletSignature(wallet.address, first.nonce, firstSignature);
  assert.equal(firstAuth.authenticated, true);
  assert.equal(firstAuth.address, wallet.address.toLowerCase());
  assert.match(firstAuth.sessionToken, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(firstAuth.expiresAt) > Date.now());

  // The second independently issued challenge remains valid as well.
  const secondSignature = await wallet.signMessage(second.message);
  const secondAuth = verifyWalletSignature(wallet.address, second.nonce, secondSignature);
  assert.equal(secondAuth.authenticated, true);
  assert.notEqual(secondAuth.sessionToken, firstAuth.sessionToken);

  const firstSession = getWalletSession(firstAuth.sessionToken);
  assert.equal(firstSession.address, wallet.address.toLowerCase());
  assert.equal(activeWalletSessionCount(), 2);

  expectCode(() => getWalletSession("not-a-session-token"), "wallet-session-required");
  assert.equal(revokeWalletSession(firstAuth.sessionToken), true);
  expectCode(() => getWalletSession(firstAuth.sessionToken), "wallet-session-invalid");
  assert.equal(getWalletSession(secondAuth.sessionToken).address, wallet.address.toLowerCase());
  assert.equal(activeWalletSessionCount(), 1);

  console.log("backend:security-check passed");
} finally {
  fs.rmSync(tempDb, { force: true });
  fs.rmSync(`${tempDb}.tmp`, { force: true });
}
