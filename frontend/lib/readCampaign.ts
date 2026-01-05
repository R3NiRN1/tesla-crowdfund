import { publicClient } from "./publicClient";
import { campaignAbi } from "./campaignAbi";

export type MilestoneView = {
  description: string;
  amount: bigint;
  claimed: boolean;
};

export type CampaignView = {
  address: `0x${string}`;
  description: string;
  goal: bigint;
  deadline: bigint;
  owner: `0x${string}`;
  totalContributed: bigint;
  milestones: MilestoneView[];
};

export async function readCampaign(address: `0x${string}`): Promise<CampaignView> {
  const [description, goal, deadline, owner, totalContributed, milestoneCount] = await Promise.all([
    publicClient.readContract({ address, abi: campaignAbi, functionName: "description" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "goal" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "deadline" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "owner" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "totalContributed" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "milestoneCount" }),
  ]);

  const n = Number(milestoneCount);

  const milestones = await Promise.all(
    [...Array(n)].map(async (_, i) => {
      const m = await publicClient.readContract({
        address,
        abi: campaignAbi,
        functionName: "milestones",
        args: [BigInt(i)],
      });

      // viem returns a tuple: [description, amount, claimed]
      const [mDesc, mAmt, mClaimed] = m as unknown as [string, bigint, boolean];

      return {
        description: mDesc,
        amount: mAmt,
        claimed: mClaimed,
      };
    })
  );

  return {
    address,
    description,
    goal,
    deadline,
    owner,
    totalContributed,
    milestones,
  };
}
