import type { CampaignView, MilestoneView } from "./readCampaign";

const TES = 10n ** 18n;
const day = 24 * 60 * 60;
const ZERO_HASH = `0x${"0".repeat(64)}` as `0x${string}`;
const DEMO_TOKEN = "0x7777777777777777777777777777777777777777" as const;
const DEMO_ARBITRATOR = "0x8888888888888888888888888888888888888888" as const;

export type DemoCampaign = CampaignView & {
  id: string;
  title: string;
  category: string;
  statusNote: string;
};

function milestone(description: string, amount: bigint, status: 0 | 1 | 2 | 3 = 0): MilestoneView {
  return {
    description,
    amount,
    status,
    evidenceURI: "",
    evidenceHash: ZERO_HASH,
    submittedAt: 0n,
    challengeDeadline: 0n,
    disputeDeadline: 0n,
    approvalWeight: 0n,
    challengeWeight: 0n,
  };
}

export const demoCampaigns: DemoCampaign[] = [
  {
    id: "demo-solar-microgrid",
    title: "Neighborhood solar microgrid",
    category: "Energy access",
    statusNote: "Ready for testnet deployment once setup is configured.",
    address: "0x1111111111111111111111111111111111111111",
    contractVersion: "2.0.0-alpha",
    owner: "0x2222222222222222222222222222222222222222",
    token: DEMO_TOKEN,
    arbitrator: DEMO_ARBITRATOR,
    description:
      "A sample campaign for a solar storage kit, inverter, and installation crew. This is seeded demo data for alpha walkthroughs.",
    goal: 80000n * TES,
    totalContributed: 31250n * TES,
    totalReleased: 0n,
    totalRefunded: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 36 * day),
    state: 0,
    nextMilestone: 0n,
    milestoneSubmissionDeadline: 0n,
    remainingToGoal: 48750n * TES,
    challengeThresholdWeight: 3125n * TES,
    refundPoolSnapshot: 0n,
    refundPoolRemaining: 0n,
    refundableBackersRemaining: 0n,
    uniqueBackerCount: 12n,
    milestones: [
      milestone("Procure panels and batteries", 32000n * TES),
      milestone("Install pilot homes", 28000n * TES),
      milestone("Commission neighborhood service", 20000n * TES),
    ],
  },
  {
    id: "demo-rural-chargers",
    title: "Rural EV charging hub",
    category: "Transport",
    statusNote: "Shows V2 released and pending milestone states without touching contracts.",
    address: "0x3333333333333333333333333333333333333333",
    contractVersion: "2.0.0-alpha",
    owner: "0x4444444444444444444444444444444444444444",
    token: DEMO_TOKEN,
    arbitrator: DEMO_ARBITRATOR,
    description:
      "A sample campaign for a two-bay charging site with safety signage and maintenance training.",
    goal: 120000n * TES,
    totalContributed: 120000n * TES,
    totalReleased: 25000n * TES,
    totalRefunded: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) - 2 * day),
    state: 1,
    nextMilestone: 1n,
    milestoneSubmissionDeadline: BigInt(Math.floor(Date.now() / 1000) + 20 * day),
    remainingToGoal: 0n,
    challengeThresholdWeight: 12000n * TES,
    refundPoolSnapshot: 0n,
    refundPoolRemaining: 0n,
    refundableBackersRemaining: 0n,
    uniqueBackerCount: 31n,
    milestones: [
      milestone("Reserve site and permits", 25000n * TES, 3),
      milestone("Install charging hardware", 65000n * TES),
      milestone("Launch public charging window", 30000n * TES),
    ],
  },
  {
    id: "demo-school-battery",
    title: "School battery backup",
    category: "Resilience",
    statusNote: "Useful for demoing empty wallet and disabled write states.",
    address: "0x5555555555555555555555555555555555555555",
    contractVersion: "2.0.0-alpha",
    owner: "0x6666666666666666666666666666666666666666",
    token: DEMO_TOKEN,
    arbitrator: DEMO_ARBITRATOR,
    description:
      "A sample campaign for battery backup, monitoring, and technician training at a community school.",
    goal: 45000n * TES,
    totalContributed: 8500n * TES,
    totalReleased: 0n,
    totalRefunded: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 58 * day),
    state: 0,
    nextMilestone: 0n,
    milestoneSubmissionDeadline: 0n,
    remainingToGoal: 36500n * TES,
    challengeThresholdWeight: 850n * TES,
    refundPoolSnapshot: 0n,
    refundPoolRemaining: 0n,
    refundableBackersRemaining: 0n,
    uniqueBackerCount: 4n,
    milestones: [
      milestone("Buy storage units", 22000n * TES),
      milestone("Install monitoring", 13000n * TES),
      milestone("Train facilities team", 10000n * TES),
    ],
  },
];

export function getMilestoneTotal(milestones: MilestoneView[]) {
  return milestones.reduce((sum, item) => sum + item.amount, 0n);
}
