export type BackendSubmissionStatus = "draft" | "pending_review" | "approved" | "rejected" | "published";

export type BackendSubmission = {
  id: string;
  status: BackendSubmissionStatus;
  creatorAddress: string;
  title: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  metadataUri: string;
  contractInput: unknown;
  review: unknown;
  publish: unknown;
  createdAt: string;
  updated