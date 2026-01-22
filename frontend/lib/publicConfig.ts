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

function parseAddress(value: string | undefined, label: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return ZERO_ADDRESS;
  if (!ADDRESS_REGEX.test(trimmed)) {
    throw new Error(`${label} must be a 0x-prefixed 40-byte hex address.`);
  }
  if (trimmed.toLowerCase() === ZERO_ADDRESS) return ZERO_ADDRESS;
  return trimmed;
}

export function getPublicConfig(): PublicConfig {
  const chainIdRaw = process.env.NEXT_PUBLIC_CHAIN_ID?.trim() ?? "";
  const chainId = chainIdRaw ? Number(chainIdRaw) : null;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim() || null;

  const factoryAddress = parseAddress(
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
    "NEXT_PUBLIC_FACTORY_ADDRESS"
  );
  const tokenAddress = parseAddress(
    process.env.NEXT_PUBLIC_TOKEN_ADDRESS,
    "NEXT_PUBLIC_TOKEN_ADDRESS"
  );

  const bscscanBase = process.env.NEXT_PUBLIC_BSCSCAN_BASE?.trim() || null;
  const wcEnabled = process.env.NEXT_PUBLIC_WC_ENABLED === "true";
  const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim() || null;

  const isChainIdValid = Number.isFinite(chainId ?? NaN);
  const resolvedChainId = isChainIdValid ? (chainId as number) : null;

  const missing: string[] = [];
  if (!resolvedChainId) missing.push("NEXT_PUBLIC_CHAIN_ID");
  if (!rpcUrl) missing.push("NEXT_PUBLIC_RPC_URL");
  if (factoryAddress === ZERO_ADDRESS) missing.push("NEXT_PUBLIC_FACTORY_ADDRESS");
  if (tokenAddress === ZERO_ADDRESS) missing.push("NEXT_PUBLIC_TOKEN_ADDRESS");

  const isConfigured =
    !!rpcUrl &&
    !!resolvedChainId &&
    factoryAddress !== ZERO_ADDRESS &&
    tokenAddress !== ZERO_ADDRESS;

  return {
    chainId: resolvedChainId,
    rpcUrl,
    factoryAddress,
    tokenAddress,
    bscscanBase,
    wcEnabled,
    wcProjectId,
    isConfigured,
    missing,
  };
}
