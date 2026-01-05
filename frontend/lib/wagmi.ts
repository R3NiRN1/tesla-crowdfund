import { http, createConfig } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID as string;

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [
    injected(), // MetaMask / browser wallets
    walletConnect({ projectId }),
  ],
  transports: {
    [bscTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL),
  },
});
