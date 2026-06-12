import ethersPackage from "ethers";

import { consumeNonce, getActiveNonce } from "./store.mjs";

const { ethers } = ethersPackage;

function authError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function verifyWalletSignature(address, nonce, signature) {
  const record = getActiveNonce(address, nonce);
  const suppliedSignature = String(signature || "").trim();
  if (!/^0x[a-fA-F0-9]{130}$/.test(suppliedSignature)) {
    throw authError(401, "invalid-wallet-signature", "valid wallet signature is required");
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethers.utils.verifyMessage(record.message, suppliedSignature).toLowerCase();
  } catch {
    throw authError(401, "invalid-wallet-signature", "wallet signature could not be verified");
  }

  if (recoveredAddress !== record.address) {
    throw authError(401, "wallet-address-mismatch", "signature does not match the requested wallet address");
  }

  consumeNonce(record.address, record.nonce);
  return {
    authenticated: true,
    address: record.address,
    authenticatedAt: new Date().toISOString(),
  };
}
