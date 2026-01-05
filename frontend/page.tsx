import { ethers } from "ethers";

export async function connectWallet() {
  if (!(window as any).ethereum) {
    alert("MetaMask not found");
    return;
  }

  const provider = new ethers.BrowserProvider(
    (window as any).ethereum
  );

  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();

  return { provider, signer };
}

<button onClick={connectWallet}>
  Connect Wallet
</button>
