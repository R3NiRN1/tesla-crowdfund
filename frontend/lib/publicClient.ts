// frontend/lib/publicClient.ts
import { createPublicClient, http } from "viem";
import { configuredChain, targetRpcUrl } from "./chain";

export const publicClient = createPublicClient({
  chain: configuredChain,
  transport: http(targetRpcUrl),
});
