import { buildContext, seed, fundingExpiry, reviewOne, reviewTwo, arbitrationTimeout, creatorInactivity, verifyAll } from "./scenarios";
import { loadState, parsePhase } from "./state";

async function main(): Promise<void> {
  const phase = parsePhase(process.env.TESTNET_HARNESS_PHASE);
  const context = await buildContext();
  let state = loadState(phase !== "seed");

  if (phase === "seed") {
    state = await seed(state, context);
  } else if (phase === "funding-expiry") {
    await fundingExpiry(context, state!);
  } else if (phase === "review-1") {
    await reviewOne(context, state!);
  } else if (phase === "review-2") {
    await reviewTwo(context, state!);
  } else if (phase === "arbitration-timeout") {
    await arbitrationTimeout(context, state!);
  } else if (phase === "creator-inactivity") {
    await creatorInactivity(context, state!);
  } else {
    await verifyAll(context, state!);
  }

  console.log(`BSC testnet harness phase ${phase} completed with on-chain assertions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
