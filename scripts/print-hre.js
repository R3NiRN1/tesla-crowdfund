async function main() {
  const { network } = await import("hardhat");
  const connection = await network.connect();
  console.log("Hardhat Viem connection exists:", !!connection.viem);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
