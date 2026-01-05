const hre = require("hardhat");

async function main() {
  const addr = process.env.ADDR;
  if (!addr) throw new Error("Missing env ADDR");
  const code = await hre.ethers.provider.getCode(addr);
  console.log("addr =", addr);
  console.log("code length =", code.length);
  console.log("is contract =", code !== "0x");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
