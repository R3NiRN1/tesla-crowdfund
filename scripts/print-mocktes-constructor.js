const path = require("path");

async function main() {
  const artPath = path.resolve("artifacts/contracts/MockTES.sol/MockTES.json");
  const art = require(artPath);
  const ctor = art.abi.find((x) => x.type === "constructor") || null;

  if (!ctor) {
    console.log("No constructor in ABI (unexpected given error).");
    return;
  }

  console.log(
    "MockTES constructor:",
    `(${(ctor.inputs || []).map((i) => `${i.type} ${i.name}`).join(", ")})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
