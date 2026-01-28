import { createPublicClient, http } from "viem";
import { getBscChain } from "./chain";

export const publicClient = createPublicClient({
  chain: getBscChain(),
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});
