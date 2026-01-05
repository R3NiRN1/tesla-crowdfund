import { createPublicClient, http } from "viem";
import { bscTestnet } from "./chain";

export const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});
