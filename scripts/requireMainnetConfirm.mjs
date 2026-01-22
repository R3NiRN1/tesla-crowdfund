const confirm = process.env.CONFIRM_MAINNET;

if (confirm !== "YES") {
  console.error("Mainnet deploy blocked. Set CONFIRM_MAINNET=YES to proceed.");
  process.exit(1);
}

console.log("Mainnet deploy confirmed (CONFIRM_MAINNET=YES).");
