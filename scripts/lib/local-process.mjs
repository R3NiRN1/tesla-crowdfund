const SYSTEM_ENV = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR",
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "CI",
]);

export function localChildEnv(overrides = {}, source = process.env) {
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => SYSTEM_ENV.has(key.toUpperCase())));
  return { ...env, ...overrides };
}

export async function stopChild(child, { graceMs = 5000, forceMs = 5000 } = {}) {
  if (child.exitCode !== null || child.signalCode || child.spawnError) return;
  // Subscribe before signalling so fast exits cannot be missed.
  let timer;
  let onExit;
  const exited = new Promise((resolve) => { onExit = resolve; child.once("exit", onExit); });
  const wait = async (milliseconds) => {
    try {
      return await Promise.race([
        exited.then(() => true),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  try {
    child.kill("SIGTERM");
    if (await wait(graceMs)) return;
    child.kill("SIGKILL");
    if (!await wait(forceMs)) throw new Error("local child did not exit after forced shutdown");
  } finally { child.removeListener("exit", onExit); }
}

export async function cleanupLocalResources(operations) {
  const failures = [];
  // One failed cleanup must not prevent subsequent resources from being closed.
  for (const { name, close } of operations) {
    try { await close(); } catch (error) { failures.push({ name, message: String(error?.message || error) }); }
  }
  return failures;
}

export function registerLocalTermination({ onSignal, cleanup, abort, events = process, exit = (code) => process.exit(code) }) {
  let stopping = false;
  const handle = (signal) => {
    if (stopping) return;
    stopping = true;
    onSignal(signal);
    abort();
    Promise.resolve().then(cleanup).then(
      () => exit(signal === "SIGINT" ? 130 : 143),
      () => exit(1),
    );
  };
  const interrupt = () => handle("SIGINT");
  const terminate = () => handle("SIGTERM");
  events.on("SIGINT", interrupt);
  events.on("SIGTERM", terminate);
  return () => {
    events.removeListener("SIGINT", interrupt);
    events.removeListener("SIGTERM", terminate);
  };
}
