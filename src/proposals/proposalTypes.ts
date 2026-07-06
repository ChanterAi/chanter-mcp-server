// Proposal data model — typed definitions for dry-run action proposals.
// P2: Proposal-only. No execution. Approval is metadata only.

export type ProposalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "expired";

export type ExecutionStatus =
  | "not_executed"
  | "execution_forbidden_in_p2";

export type AllowedActionType =
  | "run_validation"
  | "review_readiness"
  | "prepare_commit_review"
  | "draft_autoposter_campaign"
  | "draft_clean_engine_job"
  | "inspect_product_health"
  | "propose_repair_plan";

export const ALLOWED_ACTION_TYPES: AllowedActionType[] = [
  "run_validation",
  "review_readiness",
  "prepare_commit_review",
  "draft_autoposter_campaign",
  "draft_clean_engine_job",
  "inspect_product_health",
  "propose_repair_plan",
];

export type ReviewDecision =
  | "approved_for_future_execution"
  | "rejected"
  | "needs_changes";

export interface ReviewEvent {
  timestamp: string;
  decision: ReviewDecision;
  reviewer: string;
  notes?: string;
}

export interface RequiredGates {
  human_approval: boolean;
  audit_log: boolean;
  dry_run_preview: boolean;
  safecommit_review: boolean;
  operator_approval: boolean;
}

export interface ProposalSnapshots {
  readiness?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  git?: Record<string, unknown>;
  takenAt: string;
}

export interface DryRunProposal {
  proposalId: string;
  createdAt: string;
  updatedAt: string;
  productId: string;
  productDisplayName: string;
  actionType: AllowedActionType;
  objective: string;
  scope: string[];
  requestedBy: string;
  permissionLevel: "write_proposed";
  riskLevel: "low" | "medium" | "high" | "critical";
  status: ProposalStatus;
  executionStatus: ExecutionStatus;
  requiredGates: RequiredGates;
  forbiddenActions: string[];
  safetyNotes: string[];
  snapshots: ProposalSnapshots | null;
  reviewHistory: ReviewEvent[];
  expiresAt: string;
  recommendedNextAction: string;
}

export interface ProposalSummary {
  proposalId: string;
  productId: string;
  productDisplayName: string;
  actionType: string;
  riskLevel: string;
  status: string;
  executionStatus: string;
  createdAt: string;
  objective: string;
  reviewerNote?: string; // from latest review if any
}

/**
 * Generate a safe proposal ID.
 */
export function generateProposalId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `prop-${now}-${rand}`;
}

/**
 * Calculate expiry (default 30 days from creation).
 */
export function calculateExpiry(createdAt: Date): string {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
