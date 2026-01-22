import { createPublicClient, http } from "viem";
import { getBscTestnetChain } from "./chain";

export const publicClient = createPublicClient({
  chain: getBscTestnetChain(),
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});
