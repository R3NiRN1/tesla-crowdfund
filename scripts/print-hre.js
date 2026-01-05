async function main() {
  const hre = require("hardhat");
  console.log("hre.ethers exists:", !!hre.ethers);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
