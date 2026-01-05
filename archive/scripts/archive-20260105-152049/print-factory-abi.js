const hre = require("hardhat");

async function main() {
  const path = "artifacts/contracts/CampaignFactory.sol/Campaign.json";
  const art = require(require("path").resolve(path));

  const fns = art.abi
    .filter((x) => x.type === "function")
    .map(
      (x) =>
        `${x.name}(${(x.inputs || []).map((i) => i.type).join(",")}) -> ${
          x.outputs ? (x.outputs.map((o) => o.type).join(",") || "void") : "void"
        }`
    );

  console.log(fns.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
