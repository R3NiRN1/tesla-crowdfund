import { network } from "hardhat";

async function main() {
  const addr = process.env.ADDR;
  if (!addr) throw new Error("Missing env ADDR");
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const code = await publicClient.getCode({ address: addr });
  console.log("addr =", addr);
  console.log("code length =", code.length);
  console.log("is contract =", code !== "0x");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
