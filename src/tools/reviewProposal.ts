// chanter.review_proposal — record a human review decision for a proposal.
// Does NOT execute anything. Does NOT authorize execution.
// In P2, approval is metadata only.

import { loadProposal, saveProposal } from "../proposals/proposalStore.js";
import type { ReviewDecision, ReviewEvent } from "../proposals/proposalTypes.js";
import { redactSensitiveValues } from "../safety/redaction.js";

export interface ReviewProposalInput {
  proposalId: string;
  decision: string;
  reviewer: string;
  notes?: string;
}

export interface ReviewProposalResult {
  success: boolean;
  error?: string;
  proposalId?: string;
  status?: string;
  executionStatus?: string;
  reviewAdded?: boolean;
}

const VALID_DECISIONS: ReviewDecision[] = [
  "approved_for_future_execution",
  "rejected",
  "needs_changes",
];

export async function handleReviewProposal(
  input: ReviewProposalInput
): Promise<ReviewProposalResult> {
  const proposalId = input.proposalId.trim();

  // 1. Load proposal
  const proposal = loadProposal(proposalId);
  if (!proposal) {
    return {
      success: false,
      error: `Proposal not found: "${proposalId}".`,
    };
  }

  // 2. Validate decision
  if (!VALID_DECISIONS.includes(input.decision as ReviewDecision)) {
    return {
      success: false,
      error: `Invalid decision: "${input.decision}". Allowed: ${VALID_DECISIONS.join(", ")}`,
    };
  }
  const decision = input.decision as ReviewDecision;

  // 3. Build review event
  const reviewer = redactSensitiveValues(input.reviewer.trim());
  if (!reviewer) {
    return { success: false, error: "Reviewer must not be empty." };
  }

  const notes = input.notes ? redactSensitiveValues(input.notes.trim()) : undefined;

  const reviewEvent: ReviewEvent = {
    timestamp: new Date().toISOString(),
    decision,
    reviewer,
    notes,
  };

  // 4. Update proposal
  switch (decision) {
    case "approved_for_future_execution":
      proposal.status = "approved";
      proposal.safetyNotes.push(
        `APPROVED by ${reviewer} at ${reviewEvent.timestamp}. Approval does NOT authorize execution in P2.`
      );
      break;
    case "rejected":
      proposal.status = "rejected";
      proposal.safetyNotes.push(
        `REJECTED by ${reviewer} at ${reviewEvent.timestamp}.`
      );
      break;
    case "needs_changes":
      proposal.status = "needs_changes";
      proposal.safetyNotes.push(
        `NEEDS CHANGES per ${reviewer} at ${reviewEvent.timestamp}.`
      );
      break;
  }

  // CRITICAL: executionStatus MUST remain "not_executed" in P2
  proposal.executionStatus = "not_executed";
  proposal.updatedAt = new Date().toISOString();
  proposal.reviewHistory.push(reviewEvent);

  // Update recommended next action
  if (decision === "approved_for_future_execution") {
    proposal.recommendedNextAction =
      "Proposal approved. Execution is not available until P3+. Await further checkpoints.";
  } else if (decision === "rejected") {
    proposal.recommendedNextAction =
      "Proposal rejected. Create a new proposal if the action is still desired.";
  } else {
    proposal.recommendedNextAction =
      "Update the proposal based on reviewer feedback, then resubmit.";
  }

  // 5. Save updated proposal
  saveProposal(proposal);

  return {
    success: true,
    proposalId,
    status: proposal.status,
    executionStatus: proposal.executionStatus,
    reviewAdded: true,
  };
}
