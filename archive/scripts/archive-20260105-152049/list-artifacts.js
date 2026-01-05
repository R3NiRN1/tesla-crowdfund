const hre = require("hardhat");

async function main() {
  const paths = await hre.artifacts.getArtifactPaths();
  const matches = paths
    .filter((p) => p.toLowerCase().includes("factory"))
    .sort();
  console.log(matches.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

