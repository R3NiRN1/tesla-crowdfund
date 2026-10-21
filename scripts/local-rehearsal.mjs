import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseEther, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { cleanupLocalResources, localChildEnv, registerLocalTermination, stopChild } from "./lib/local-process.mjs";
import { LocalPostgres } from "./lib/local-postgres.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const support = createRequire(new URL("../tools/local-rehearsal/package.json", import.meta.url));
const platformPackage = { win32: "@embedded-postgres/windows-x64", linux: "@embedded-postgres/linux-x64" }[process.platform];
if (!platformPackage || process.arch !== "x64") throw new Error("Local rehearsal supports Windows/Linux x64 only");
const binaries = await import(pathToFileURL(support.resolve(platformPackage)).href);
// Sanitize this disposable process too: pg clients otherwise inherit PG* settings.
process.env = localChildEnv();
const shutdown = new AbortController();
const runDir = path.join(root, ".local-rehearsal", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(runDir, { recursive: true });
const evidence = {
  schema: "tes-local-rehearsal/v1",
  candidate: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  startedAt: new Date().toISOString(), environment: "local-only", chainId: 31337, checks: [],
};
const children = [];
let database;
let repository;
function safeMessage(value) {
  return String(value).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database URL redacted]")
    .replace(/0x[a-fA-F0-9]{64}/g, "[hex value redacted]");
}
async function port() {
  const socket = createServer();
  await new Promise((resolve, reject) => socket.once("error", reject).listen(0, "127.0.0.1", resolve));
  const result = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return result;
}
function start(args, env) {
  shutdown.signal.throwIfAborted();
  const child = spawn(process.execPath, args, {
    cwd: root, env: localChildEnv(env), stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  child.tail = "";
  // Hardhat prints public development keys: keep stdout out of the evidence bundle.
  child.stdout.resume();
  child.stderr.on("data", (value) => { child.tail = (child.tail + value).slice(-4000); });
  child.on("error", (error) => { child.spawnError = error; });
  children.push(child);
  return child;
}
const stop = stopChild;
async function runNode(args, env) {
  const child = start(args, env);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("local check timed out")); }, 120000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(result, 0, safeMessage(child.tail));
}
async function waitUntil(check, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.spawnError) throw child.spawnError;
    if (child.exitCode !== null) throw new Error("local service exited: " + safeMessage(child.tail));
    try { if (await check()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local service did not become ready: " + safeMessage(child.tail));
}
async function check(name, operation) {
  shutdown.signal.throwIfAborted();
  await operation();
  shutdown.signal.throwIfAborted();
  evidence.checks.push({ name, status: "PASS" });
  console.log("PASS " + name);
}

let finishing;
function finish() {
  if (!finishing) finishing = (async () => {
    const cleanupFailures = await cleanupLocalResources([
      ...[...children].reverse().map((child) => ({ name: "child", close: () => stop(child) })),
      ...(repository ? [{ name: "repository", close: () => repository.close() }] : []),
      ...(database ? [{ name: "database", close: () => database.stop() }] : []),
    ]);
    if (cleanupFailures.length) {
      evidence.status = "FAIL";
      evidence.cleanupFailures = cleanupFailures.map(({ name, message }) => ({ name, message: safeMessage(message) }));
      console.error("Local resource cleanup failed; see evidence.");
    }
    evidence.finishedAt = new Date().toISOString();
    // No event-loop yield between the final status snapshot and process exit.
    writeFileSync(path.join(runDir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    console.log("Evidence: " + path.join(runDir, "evidence.json"));
  })();
  return finishing;
}
const unregisterTermination = registerLocalTermination({
  onSignal: (signal) => { evidence.status = "FAIL"; evidence.failure = "Rehearsal interrupted by " + signal; },
  abort: () => shutdown.abort(new Error("Local rehearsal interrupted")),
  cleanup: finish,
});

try {
  const [pgPort, rpcPort, apiPort] = await Promise.all([port(), port(), port()]);
  assert.equal(new Set([pgPort, rpcPort, apiPort]).size, 3);
  const password = randomBytes(24).toString("hex");
  database = new LocalPostgres({
    binaries, signal: shutdown.signal, env: localChildEnv(),
    databaseDir: path.join(runDir, "postgres"), user: "tes_local", password, port: pgPort,
  });
  await check("automatic PostgreSQL provisioning", async () => {
    await database.initialise();
    await database.start();
    for (const name of ["tes_checks", "tes_app", "tes_restore"]) await database.createDatabase(name);
  });
  if (process.argv.includes("--fail-after-provision")) throw new Error("Injected rehearsal failure after provisioning");
  const dbUrl = (name) => "postgresql://tes_local:" + password + "@127.0.0.1:" + pgPort + "/" + name;
  await check("PostgreSQL migrations, concurrency, rollback and session integration", () =>
    runNode(["backend/postgres-check.mjs"], { DATABASE_URL: dbUrl("tes_checks"), STORAGE_DRIVER: "postgres" }));

  process.env.DATABASE_URL = dbUrl("tes_app");
  process.env.STORAGE_DRIVER = "postgres";
  const { migrateDatabase } = await import("../backend/migrate.mjs");
  const { createRepository, setRepositoryForTests } = await import("../backend/repository.mjs");
  const { provisionOperator } = await import("../backend/operator-auth.mjs");
  await migrateDatabase({ connectionString: dbUrl("tes_app") });
  repository = createRepository({ storageDriver: "postgres", databaseUrl: dbUrl("tes_app") });
  setRepositoryForTests(repository);
  await repository.initialize();
  const operator = await provisionOperator({ subject: "local-reviewer", displayName: "Local fixture reviewer" });
  const observer = await provisionOperator({ subject: "local-read-only", roles: ["submission.read"] });

  const rpcUrl = "http://127.0.0.1:" + rpcPort;
  const localChain = defineChain({
    id: 31337, name: "Disposable local rehearsal", nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({ chain: localChain, transport: http(rpcUrl, { timeout: 2000, retryCount: 0 }) });
  const chain = start(["node_modules/hardhat/dist/src/cli.js", "node", "--hostname", "127.0.0.1", "--port", String(rpcPort)], {});
  await waitUntil(async () => (await client.getChainId()) === 31337, chain);
  const roles = Object.fromEntries(["deployer", "creator", "arbitrator", "backerA", "backerB", "outsider"].map((name) => {
    const account = privateKeyToAccount(generatePrivateKey());
    return [name, { account, wallet: createWalletClient({ account, chain: localChain, transport: http(rpcUrl) }) }];
  }));
  for (const role of Object.values(roles)) {
    await client.request({ method: "hardhat_setBalance", params: [role.account.address, "0x" + parseEther("10").toString(16)] });
  }
  evidence.wallets = Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, role.account.address]));
  const artifact = async (name) => JSON.parse(await readFile(path.join(root, "artifacts", "contracts", name + ".sol", name + ".json"), "utf8"));
  const tokenArtifact = await artifact("MockTES");
  const factoryArtifact = await artifact("CampaignFactoryV2");
  const campaignArtifact = await artifact("CampaignV2");
  async function receipt(hash) {
    const result = await client.waitForTransactionReceipt({ hash });
    assert.equal(result.status, "success");
    return result;
  }
  async function deploy(data, args) {
    return (await receipt(await roles.deployer.wallet.deployContract({ abi: data.abi, bytecode: data.bytecode, args }))).contractAddress;
  }
  const token = await deploy(tokenArtifact, [roles.deployer.account.address]);
  const factory = await deploy(factoryArtifact, [token, roles.arbitrator.account.address]);
  evidence.deployment = { token, factory, version: "2.0.0-alpha", chainId: await client.getChainId() };
  const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args });
  const send = async (role, address, abi, functionName, args = []) =>
    receipt(await roles[role].wallet.writeContract({ address, abi, functionName, args }));
  await check("six distinct client-side signers and local V2 deployment", async () => {
    assert.equal(new Set(Object.values(evidence.wallets).map((value) => value.toLowerCase())).size, 6);
    assert.equal(await read(factory, factoryArtifact.abi, "CONTRACT_VERSION"), "2.0.0-alpha");
    assert.equal((await read(factory, factoryArtifact.abi, "token")).toLowerCase(), token.toLowerCase());
  });

  const apiUrl = "http://127.0.0.1:" + apiPort;
  const apiEnv = {
    NODE_ENV: "production", STORAGE_DRIVER: "postgres", DATABASE_URL: dbUrl("tes_app"),
    PORT: String(apiPort), BACKEND_PORT: String(apiPort), BACKEND_HOST: "127.0.0.1", CORS_ORIGIN: "http://127.0.0.1:3000",
    BACKEND_RPC_URL: rpcUrl, BACKEND_CHAIN_ID: "31337", BACKEND_FACTORY_V2_ADDRESS: factory,
    BACKEND_TOKEN_ADDRESS: token, BACKEND_ARBITRATOR_ADDRESS: roles.arbitrator.account.address,
    BACKEND_PUBLISH_CONFIRMATIONS: "1", TRUSTED_PROXY_IPS: "",
  };
  let backend = start(["backend/server.mjs"], apiEnv);
  const healthy = async () => (await fetch(apiUrl + "/health", { signal: AbortSignal.timeout(2000) })).ok;
  await waitUntil(healthy, backend);
  async function request(route, { method = "GET", bearer, body, status = 200 } = {}) {
    const response = await fetch(apiUrl + route, {
      method, signal: AbortSignal.timeout(10000),
      headers: { "content-type": "application/json", ...(bearer ? { authorization: "Bearer " + bearer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    assert.equal(response.status, status, route + ": " + (payload.error?.code || "unexpected status"));
    return payload;
  }
  async function login(role) {
    const account = roles[role].account;
    const challenge = await request("/auth/nonce", { method: "POST", body: { address: account.address }, status: 201 });
    return (await request("/auth/verify", { method: "POST", body: {
      address: account.address, nonce: challenge.nonce, signature: await account.signMessage({ message: challenge.message }),
    } })).sessionToken;
  }
  const creatorToken = await login("creator");
  const outsiderToken = await login("outsider");
  const operatorToken = (await request("/operator/auth", { method: "POST", body: { credential: operator.credential } })).sessionToken;
  const observerToken = (await request("/operator/auth", { method: "POST", body: { credential: observer.credential } })).sessionToken;
  await check("production-mode health and PostgreSQL/operator guardrails", async () => {
    assert.equal((await request("/health")).productionReady, true);
    await request("/admin/diagnostics", { bearer: operatorToken });
    await request("/admin/diagnostics", { bearer: creatorToken, status: 401 });
    await request("/admin/diagnostics", { bearer: observerToken, status: 403 });
  });

  const input = {
    creatorAddress: roles.creator.account.address, title: "Local integrated V2 rehearsal",
    shortDescription: "Disposable local creator, operator and backer integration fixture.",
    longDescription: "A PostgreSQL-backed local rehearsal using client-side test wallets and MockTES.",
    metadataURI: "ipfs://local-rehearsal-fixture", media: [],
    contractInput: {
      description: "Local integrated V2 rehearsal campaign", goal: "300", duration: "3600",
      milestoneDescriptions: ["First delivery", "Second delivery"], milestoneAmounts: ["100", "200"],
    },
  };
  const created = (await request("/submissions", {
    method: "POST", bearer: creatorToken, body: input, status: 201,
  })).submission;
  evidence.submissionId = created.id;
  await check("creator ownership, readiness and operator role separation", async () => {
    assert.equal(created.readiness.state, "contract-ready");
    await request("/submissions/" + created.id, { bearer: outsiderToken, status: 403 });
    await request("/submissions/" + created.id + "/submit", { method: "POST", bearer: creatorToken, body: {} });
    await request("/admin/submissions/" + created.id + "/review", {
      method: "POST", bearer: observerToken, body: { decision: "approved", manuallyVerified: true }, status: 403,
    });
  });
  const review = (decision) => request("/admin/submissions/" + created.id + "/review", {
    method: "POST", bearer: operatorToken,
    body: { decision, manuallyVerified: true, note: "Reviewed disposable local fixture", verificationNote: "Local fixture only; not KYC" },
  });
  await check("needs-changes, resubmission and authenticated operator approval", async () => {
    assert.equal((await review("needs_changes")).submission.status, "needs_changes");
    await request("/submissions/" + created.id, { method: "PATCH", bearer: creatorToken, body: { title: input.title + " revised" } });
    await request("/submissions/" + created.id + "/submit", { method: "POST", bearer: creatorToken, body: {} });
    assert.equal((await review("approved")).submission.status, "approved");
  });
  const creation = await send("creator", factory, factoryArtifact.abi, "createCampaignWithMetadata", [
    input.contractInput.description, input.metadataURI, 300n, 3600n, input.contractInput.milestoneDescriptions, [100n, 200n],
  ]);
  const published = (await request("/submissions/" + created.id + "/published", {
    method: "POST", bearer: creatorToken, body: { transactionHash: creation.transactionHash },
  })).submission;
  const campaign = published.publish.campaignAddress;
  evidence.publication = { transactionHash: creation.transactionHash, campaign, verifiedOnChain: published.publish.verifiedOnChain };
  await check("creator-wallet publication, independent receipt verification and public listing", async () => {
    assert.equal(published.publish.verifiedOnChain, true);
    const listing = (await request("/public/campaigns")).campaigns.find((entry) => entry.id === created.id);
    assert.equal(listing.campaignAddress.toLowerCase(), campaign.toLowerCase());
    assert.equal(listing.chainId, 31337);
    assert.equal(JSON.stringify(listing).includes(operator.credential), false);
  });
  for (const backer of ["backerA", "backerB"]) {
    await send("deployer", token, tokenArtifact.abi, "mint", [roles[backer].account.address, 1000n]);
  }
  await check("multiple backers, capped approval and oversized final contribution", async () => {
    await send("backerA", token, tokenArtifact.abi, "approve", [campaign, 100n]);
    await send("backerA", campaign, campaignArtifact.abi, "contribute", [100n]);
    await send("backerB", token, tokenArtifact.abi, "approve", [campaign, 200n]);
    await send("backerB", campaign, campaignArtifact.abi, "contribute", [500n]);
    assert.equal(await read(campaign, campaignArtifact.abi, "totalContributed"), 300n);
    assert.equal(await read(token, tokenArtifact.abi, "balanceOf", [roles.backerB.account.address]), 800n);
  });
  async function advance(seconds) {
    assert.equal(await client.getChainId(), 31337, "time travel is local-chain only");
    await client.request({ method: "evm_increaseTime", params: [seconds] });
    await client.request({ method: "evm_mine", params: [] });
  }
  const evidenceHash = keccak256(toBytes(JSON.stringify({ fixture: "local rehearsal", candidate: evidence.candidate })));
  await check("sequential evidence gates, challenge, arbitration rejection and pro-rata refunds", async () => {
    await send("creator", campaign, campaignArtifact.abi, "submitMilestoneEvidence", [0n, "ipfs://local-evidence-fixture", evidenceHash]);
    await assert.rejects(client.simulateContract({
      account: roles.outsider.account.address, address: campaign, abi: campaignArtifact.abi, functionName: "voteMilestone", args: [0n, 2],
    }));
    await advance(7 * 86400 + 1);
    await send("outsider", campaign, campaignArtifact.abi, "finalizeMilestone", [0n]);
    assert.equal(await read(campaign, campaignArtifact.abi, "totalReleased"), 100n);
    await send("creator", campaign, campaignArtifact.abi, "submitMilestoneEvidence", [1n, "ipfs://local-evidence-fixture", evidenceHash]);
    await send("backerA", campaign, campaignArtifact.abi, "voteMilestone", [1n, 2]);
    await advance(7 * 86400 + 1);
    await send("outsider", campaign, campaignArtifact.abi, "finalizeMilestone", [1n]);
    await send("arbitrator", campaign, campaignArtifact.abi, "resolveDispute", [1n, false]);
    await send("backerA", campaign, campaignArtifact.abi, "refund");
    await send("backerB", campaign, campaignArtifact.abi, "refund");
    assert.equal(await read(campaign, campaignArtifact.abi, "totalRefunded"), 200n);
    assert.equal(await read(token, tokenArtifact.abi, "balanceOf", [campaign]), 0n);
    await assert.rejects(client.simulateContract({
      account: roles.backerA.account.address, address: campaign, abi: campaignArtifact.abi, functionName: "refund",
    }));
  });
  await check("durable sessions and public records survive backend restart", async () => {
    await stop(backend);
    backend = start(["backend/server.mjs"], apiEnv);
    await waitUntil(healthy, backend);
    assert.equal((await request("/submissions/" + created.id, { bearer: creatorToken })).submission.status, "published");
    assert.equal((await request("/public/campaigns")).campaigns.length, 1);
    assert.ok((await request("/audit", { bearer: operatorToken })).auditLog.some((entry) => entry.actor?.kind === "operator"));
  });
  await check("logical backup and restore into a separate recovery database", async () => {
    const snapshot = await repository.read();
    await writeFile(path.join(runDir, "private-backup.json"), JSON.stringify(snapshot), { mode: 0o600 });
    await migrateDatabase({ connectionString: dbUrl("tes_restore") });
    const restored = createRepository({ storageDriver: "postgres", databaseUrl: dbUrl("tes_restore") });
    try {
      await restored.initialize();
      await restored.transaction((state) => Object.assign(state, structuredClone(snapshot)));
      assert.deepEqual(await restored.read(), snapshot);
    } finally { await restored.close(); }
  });
  evidence.status = "LOCAL_ONLY";
} catch (error) {
  evidence.status = "FAIL";
  evidence.failure = safeMessage(error?.message || error);
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  await finish();
  unregisterTermination();
}
process.exit(evidence.status === "FAIL" ? 1 : 0);
