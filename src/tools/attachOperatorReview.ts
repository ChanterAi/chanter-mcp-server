// chanter.attach_operator_review — append an Operator-style review event to a proposal.
// Metadata only. Does NOT execute the proposal. Updates approvalStage only.

import { loadProposal, saveProposal } from "../proposals/proposalStore.js";
import { redactSensitiveValues } from "../safety/redaction.js";
import {
  VALID_REVIEWER_ROLES,
  VALID_DECISIONS,
  type ReviewerRole,
  type OperatorReviewEvent,
} from "../operator/approvalTypes.js";

export interface AttachOperatorReviewInput {
  proposalId: string;
  reviewer: string;
  reviewerRole: string;
  decision: string;
  notes?: string;
}

export interface AttachOperatorReviewResult {
  success: boolean;
  error?: string;
  proposalId?: string;
  approvalStage?: string;
  executionStatus?: string;
  reviewEvent?: OperatorReviewEvent;
}

export async function handleAttachOperatorReview(
  input: AttachOperatorReviewInput
): Promise<AttachOperatorReviewResult> {
  const proposalId = input.proposalId.trim();

  // 1. Load proposal
  const proposal = loadProposal(proposalId);
  if (!proposal) {
    return { success: false, error: `Proposal not found: "${proposalId}".` };
  }

  // 2. Validate reviewerRole
  if (!VALID_REVIEWER_ROLES.includes(input.reviewerRole as ReviewerRole)) {
    return {
      success: false,
      error: `Invalid reviewerRole: "${input.reviewerRole}". Allowed: ${VALID_REVIEWER_ROLES.join(", ")}`,
    };
  }
  const reviewerRole = input.reviewerRole as ReviewerRole;

  // 3. Validate decision
  if (!VALID_DECISIONS.includes(input.decision as OperatorReviewEvent["decision"])) {
    return {
      success: false,
      error: `Invalid decision: "${input.decision}". Allowed: ${VALID_DECISIONS.join(", ")}`,
    };
  }
  const decision = input.decision as OperatorReviewEvent["decision"];

  // 4. Sanitize inputs
  const reviewer = redactSensitiveValues(input.reviewer.trim());
  if (!reviewer) {
    return { success: false, error: "Reviewer must not be empty." };
  }

  const notes = input.notes ? redactSensitiveValues(input.notes.trim()) : undefined;

  // 5. Build review event
  let stage: string;
  switch (decision) {
    case "approved_metadata_only":
      stage = "approved_metadata_only";
      break;
    case "rejected":
      stage = "rejected";
      break;
    case "needs_changes":
      stage = "needs_changes";
      break;
  }

  const reviewEvent: OperatorReviewEvent = {
    timestamp: new Date().toISOString(),
    reviewer,
    reviewerRole,
    decision,
    notes,
    stage: stage as OperatorReviewEvent["stage"],
  };

  // 6. Store review event in proposal safety notes (avoids modifying the proposal schema)
  proposal.safetyNotes.push(
    `OPERATOR_REVIEW:${JSON.stringify(reviewEvent)}`
  );
  proposal.updatedAt = new Date().toISOString();

  // CRITICAL: executionStatus MUST remain "not_executed"
  proposal.executionStatus = "not_executed";

  // Update recommended next action based on review
  if (decision === "approved_metadata_only") {
    const hasAllApprovals = checkAllApprovals(proposal, reviewerRole);
    proposal.recommendedNextAction = hasAllApprovals
      ? `All required approvals collected (metadata only). Execution remains blocked in P3A. Await P4+ for execution capability.`
      : `Approved by ${reviewerRole}. Additional approvals may be required. Execution remains blocked in P3A.`;
  } else if (decision === "rejected") {
    proposal.recommendedNextAction = `Rejected by ${reviewerRole}. Create a new proposal or address reviewer feedback.`;
  } else {
    proposal.recommendedNextAction = `Needs changes per ${reviewerRole} review. Update proposal and resubmit.`;
  }

  // 7. Save
  saveProposal(proposal);

  return {
    success: true,
    proposalId,
    approvalStage: stage,
    executionStatus: "not_executed",
    reviewEvent,
  };
}

/**
 * Simple check: has at least one approval from a different role than the current reviewer?
 * In a full implementation this would check the complete approval route.
 */
function checkAllApprovals(
  proposal: { safetyNotes: string[] },
  currentRole: ReviewerRole
): boolean {
  const prefix = "OPERATOR_REVIEW:";
  const approvedRoles = new Set<string>();

  for (const note of proposal.safetyNotes) {
    if (note.startsWith(prefix)) {
      try {
        const review = JSON.parse(note.slice(prefix.length)) as OperatorReviewEvent;
        if (review.decision === "approved_metadata_only") {
          approvedRoles.add(review.reviewerRole);
        }
      } catch {
        // skip
      }
    }
  }

  // Add current reviewer (since they just approved)
  approvedRoles.add(currentRole);

  // Check if we have at least 2 different approving roles or operator+founder
  return approvedRoles.size >= 2;
}
