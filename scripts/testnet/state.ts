import fs from "node:fs";
import path from "node:path";

export const HARNESS_SCHEMA = "tes-crowdfund-testnet-harness/v1" as const;

export type HarnessPhase =
  | "seed"
  | "funding-expiry"
  | "review-1"
  | "review-2"
  | "arbitration-timeout"
  | "creator-inactivity"
  | "verify-all";

export type ScenarioName =
  | "happy"
  | "disputed-approval"
  | "later-rejection"
  | "arbitration-timeout"
  | "creator-inactivity"
  | "underfunded";

export type ScenarioRecord = {
  address: string;
  creationTransactionHash: string;
  creationBlock: number;
  deadline: string;
  metadataURI: string;
  phases: HarnessPhase[];
};

export type BackendPublicationRecord = {
  submissionId: string;
  campaignAddress: string;
  transactionHash: string;
  verifiedAt: string;
};

export type HarnessState = {
  schema: typeof HARNESS_SCHEMA;
  chainId: 97;
  releaseCommit: string;
  createdAt: string;
  updatedAt: string;
  deployment: {
    factory: string;
    token: string;
    arbitrator: string;
    deployer: string;
    tokenSource: "MockTES";
  };
  participants: {
    creator: string;
    arbitrator: string;
    backerA: string;
    backerB: string;
    outsider: string;
  };
  scenarios: Partial<Record<ScenarioName, ScenarioRecord>>;
  backendPublication?: BackendPublicationRecord;
  completedPhases: HarnessPhase[];
};

const PHASES: HarnessPhase[] = [
  "seed",
  "funding-expiry",
  "review-1",
  "review-2",
  "arbitration-timeout",
  "creator-inactivity",
  "verify-all",
];

export function parsePhase(value: string | undefined): HarnessPhase {
  const phase = String(value || "verify-all").trim() as HarnessPhase;
  if (!PHASES.includes(phase)) {
    throw new Error(`Unknown TESTNET_HARNESS_PHASE ${phase}. Valid phases: ${PHASES.join(", ")}.`);
  }
  return phase;
}

export function statePath(): string {
  const configured = String(process.env.TESTNET_HARNESS_STATE || "").trim();
  return path.resolve(configured || path.join(".testnet-runs", "bsc-testnet-v2.json"));
}

export function loadState(required = true): HarnessState | null {
  const filename = statePath();
  if (!fs.existsSync(filename)) {
    if (required) throw new Error(`Harness state not found: ${filename}. Run phase seed first.`);
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as HarnessState;
  if (parsed.schema !== HARNESS_SCHEMA || parsed.chainId !== 97) {
    throw new Error(`Refusing incompatible harness state ${parsed.schema || "unknown"} on chain ${parsed.chainId}.`);
  }
  return parsed;
}

export function saveState(state: HarnessState): void {
  const filename = statePath();
  const directory = path.dirname(filename);
  fs.mkdirSync(directory, { recursive: true });
  const next = { ...state, updatedAt: new Date().toISOString() };
  const temporary = `${filename}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

export function requireScenario(state: HarnessState, name: ScenarioName): ScenarioRecord {
  const scenario = state.scenarios[name];
  if (!scenario) throw new Error(`Scenario ${name} has not been seeded.`);
  return scenario;
}

export function markPhase(state: HarnessState, phase: HarnessPhase): void {
  if (!state.completedPhases.includes(phase)) state.completedPhases.push(phase);
}

export function markScenarioPhase(record: ScenarioRecord, phase: HarnessPhase): void {
  if (!record.phases.includes(phase)) record.phases.push(phase);
}
