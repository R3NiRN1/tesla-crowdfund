import { ethers } from "ethers";

export async function connectWallet() {
  if (!(window as any).ethereum) {
    alert("MetaMask not found");
    return;
  }

  const provider = new ethers.providers.Web3Provider(
    (window as any).ethereum
  );

  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();

  return { provider, signer };
}

<button onClick={connectWallet}>
  Connect Wallet
</button>
