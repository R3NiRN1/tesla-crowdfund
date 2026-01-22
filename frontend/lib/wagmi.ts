import { http, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { configuredChain, targetRpcUrl } from "./chain";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID as string;

export const wagmiConfig = createConfig({
  chains: [configuredChain],
  connectors: [
    injected(), // MetaMask / browser wallets
    walletConnect({ projectId }),
  ],
  transports: {
    [configuredChain.id]: http(targetRpcUrl),
  },
});
