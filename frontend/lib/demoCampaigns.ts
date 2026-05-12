import type { CampaignView, MilestoneView } from "./readCampaign";

const TES = 10n ** 18n;
const day = 24 * 60 * 60;

export type DemoCampaign = CampaignView & {
  id: string;
  title: string;
  category: string;
  statusNote: string;
};

export const demoCampaigns: DemoCampaign[] = [
  {
    id: "demo-solar-microgrid",
    title: "Neighborhood solar microgrid",
    category: "Energy access",
    statusNote: "Ready for testnet deployment once setup is configured.",
    address: "0x1111111111111111111111111111111111111111",
    owner: "0x2222222222222222222222222222222222222222",
    description:
      "A sample campaign for a solar storage kit, inverter, and installation crew. This is seeded demo data for alpha walkthroughs.",
    goal: 80000n * TES,
    totalContributed: 31250n * TES,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 36 * day),
    milestones: [
      { description: "Procure panels and batteries", amount: 32000n * TES, claimed: false },
      { description: "Install pilot homes", amount: 28000n * TES, claimed: false },
      { description: "Commission neighborhood service", amount: 20000n * TES, claimed: false },
    ],
  },
  {
    id: "demo-rural-chargers",
    title: "Rural EV charging hub",
    category: "Transport",
    statusNote: "Shows progress and milestones without touching contracts.",
    address: "0x3333333333333333333333333333333333333333",
    owner: "0x4444444444444444444444444444444444444444",
    description:
      "A sample campaign for a two-bay charging site with safety signage and maintenance training.",
    goal: 120000n * TES,
    totalContributed: 94000n * TES,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 21 * day),
    milestones: [
      { description: "Reserve site and permits", amount: 25000n * TES, claimed: true },
      { description: "Install charging hardware", amount: 65000n * TES, claimed: false },
      { description: "Launch public charging window", amount: 30000n * TES, claimed: false },
    ],
  },
  {
    id: "demo-school-battery",
    title: "School battery backup",
    category: "Resilience",
    statusNote: "Useful for demoing empty wallet and disabled write states.",
    address: "0x5555555555555555555555555555555555555555",
    owner: "0x6666666666666666666666666666666666666666",
    description:
      "A sample campaign for battery backup, monitoring, and technician training at a community school.",
    goal: 45000n * TES,
    totalContributed: 8500n * TES,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 58 * day),
    milestones: [
      { description: "Buy storage units", amount: 22000n * TES, claimed: false },
      { description: "Install monitoring", amount: 13000n * TES, claimed: false },
      { description: "Train facilities team", amount: 10000n * TES, claimed: false },
    ],
  },
];

export function getMilestoneTotal(milestones: MilestoneView[]) {
  return milestones.reduce((sum, milestone) => sum + milestone.amount, 0n);
}
