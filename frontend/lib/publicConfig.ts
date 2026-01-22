export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type PublicConfig = {
  chainId: number | null;
  rpcUrl: string | null;
  factoryAddress: string;
  tokenAddress: string;
  bscscanBase: string | null;
  wcEnabled: boolean;
  wcProjectId: string | null;
  isConfigured: boolean;
  missing: string[];
};

type ParsedAddress = {
  value: string;
  isValid: boolean;
  isZero: boolean;
};

function parseAddress(value: string | undefined): ParsedAddress {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { value: ZERO_ADDRESS, isValid: false, isZero: true };
  }
  if (!ADDRESS_REGEX.test(trimmed)) {
    return { value: ZERO_ADDRESS, isValid: false, isZero: false };
  }
  const isZero = trimmed.toLowerCase() === ZERO_ADDRESS;
  return { value: trimmed, isValid: true, isZero };
}

export function getPublicConfig(): PublicConfig {
  const chainIdRaw = process.env.NEXT_PUBLIC_CHAIN_ID?.trim() ?? "";
  const chainId = chainIdRaw ? Number(chainIdRaw) : null;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim() || null;

  const factoryAddress = parseAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS);
  const tokenAddress = parseAddress(process.env.NEXT_PUBLIC_TOKEN_ADDRESS);

  const bscscanBase = process.env.NEXT_PUBLIC_BSCSCAN_BASE?.trim() || null;
  const wcEnabled = process.env.NEXT_PUBLIC_WC_ENABLED === "true";
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim() || null;

  const isChainIdValid = Number.isFinite(chainId ?? NaN);
  const resolvedChainId = isChainIdValid ? (chainId as number) : null;

  const missing: string[] = [];
  if (!resolvedChainId) missing.push("NEXT_PUBLIC_CHAIN_ID");
  if (!rpcUrl) missing.push("NEXT_PUBLIC_RPC_URL");
  if (!factoryAddress.isValid || factoryAddress.value === ZERO_ADDRESS) missing.push("NEXT_PUBLIC_FACTORY_ADDRESS");
  if (!tokenAddress.isValid || tokenAddress.value === ZERO_ADDRESS) missing.push("NEXT_PUBLIC_TOKEN_ADDRESS");

  const isConfigured =
    !!rpcUrl &&
    !!resolvedChainId &&
    factoryAddress.value !== ZERO_ADDRESS &&
    tokenAddress.value !== ZERO_ADDRESS;

  return {
    chainId: resolvedChainId,
    rpcUrl,
    factoryAddress: factoryAddress.value,
    tokenAddress: tokenAddress.value,
    bscscanBase,
    wcEnabled,
    wcProjectId,
    isConfigured,
    missing,
  };
}
