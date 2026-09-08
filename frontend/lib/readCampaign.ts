import { getPublicClient } from "./publicClient";
import { campaignAbi } from "./campaignAbi";

export const EXPECTED_CAMPAIGN_VERSION = "2.0.0-alpha";

export type CampaignState = 0 | 1 | 2 | 3;
export type MilestoneStatus = 0 | 1 | 2 | 3;
export type VoteChoice = 0 | 1 | 2;

export const CAMPAIGN_STATE_LABELS: Record<CampaignState, string> = {
  0: "funding",
  1: "milestones",
  2: "refunds",
  3: "complete",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  0: "awaiting evidence",
  1: "contributor review",
  2: "disputed",
  3: "released",
};

export type MilestoneView = {
  description: string;
  amount: bigint;
  status: MilestoneStatus;
  evidenceURI: string;
  evidenceHash: `0x${string}`;
  submittedAt: bigint;
  challengeDeadline: bigint;
  disputeDeadline: bigint;
  approvalWeight: bigint;
  challengeWeight: bigint;
};

export type CampaignView = {
  address: `0x${string}`;
  contractVersion: string;
  description: string;
  goal: bigint;
  deadline: bigint;
  owner: `0x${string}`;
  token: `0x${string}`;
  arbitrator: `0x${string}`;
  state: CampaignState;
  totalContributed: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
  nextMilestone: bigint;
  milestoneSubmissionDeadline: bigint;
  remainingToGoal: bigint;
  challengeThresholdWeight: bigint;
  refundPoolSnapshot: bigint;
  refundPoolRemaining: bigint;
  refundableBackersRemaining: bigint;
  uniqueBackerCount: bigint;
  milestones: MilestoneView[];
};

export type CampaignParticipantView = {
  contribution: bigint;
  vote: VoteChoice;
  refundClaimed: boolean;
};

export async function readCampaign(address: `0x${string}`): Promise<CampaignView> {
  const publicClient = getPublicClient();
  const [
    contractVersion,
    description,
    goal,
    deadline,
    owner,
    token,
    arbitrator,
    state,
    totalContributed,
    totalReleased,
    totalRefunded,
    nextMilestone,
    milestoneSubmissionDeadline,
    remainingToGoal,
    challengeThresholdWeight,
    refundPoolSnapshot,
    refundPoolRemaining,
    refundableBackersRemaining,
    uniqueBackerCount,
    milestoneCount,
  ] = await Promise.all([
    publicClient.readContract({ address, abi: campaignAbi, functionName: "CONTRACT_VERSION" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "description" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "goal" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "deadline" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "owner" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "token" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "arbitrator" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "state" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "totalContributed" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "totalReleased" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "totalRefunded" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "nextMilestone" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "milestoneSubmissionDeadline" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "remainingToGoal" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "challengeThresholdWeight" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "refundPoolSnapshot" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "refundPoolRemaining" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "refundableBackersRemaining" }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "uniqueBackerCount" }),
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

      const [
        milestoneDescription,
        amount,
        milestoneStatus,
        evidenceURI,
        evidenceHash,
        submittedAt,
        challengeDeadline,
        disputeDeadline,
        approvalWeight,
        challengeWeight,
      ] = m as unknown as [
        string,
        bigint,
        number,
        string,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];

      return {
        description: milestoneDescription,
        amount,
        status: Number(milestoneStatus) as MilestoneStatus,
        evidenceURI,
        evidenceHash,
        submittedAt,
        challengeDeadline,
        disputeDeadline,
        approvalWeight,
        challengeWeight,
      };
    }),
  );

  return {
    address,
    contractVersion,
    description,
    goal,
    deadline,
    owner,
    token,
    arbitrator,
    state: Number(state) as CampaignState,
    totalContributed,
    totalReleased,
    totalRefunded,
    nextMilestone,
    milestoneSubmissionDeadline,
    remainingToGoal,
    challengeThresholdWeight,
    refundPoolSnapshot,
    refundPoolRemaining,
    refundableBackersRemaining,
    uniqueBackerCount,
    milestones,
  };
}

export async function readCampaignParticipant(
  address: `0x${string}`,
  participant: `0x${string}`,
  milestoneIndex: number,
): Promise<CampaignParticipantView> {
  const publicClient = getPublicClient();
  const [contribution, refundClaimed, vote] = await Promise.all([
    publicClient.readContract({ address, abi: campaignAbi, functionName: "contributions", args: [participant] }),
    publicClient.readContract({ address, abi: campaignAbi, functionName: "refundClaimed", args: [participant] }),
    milestoneIndex >= 0
      ? publicClient.readContract({
          address,
          abi: campaignAbi,
          functionName: "milestoneVotes",
          args: [BigInt(milestoneIndex), participant],
        })
      : Promise.resolve(0),
  ]);

  return {
    contribution,
    refundClaimed,
    vote: Number(vote) as VoteChoice,
  };
}
