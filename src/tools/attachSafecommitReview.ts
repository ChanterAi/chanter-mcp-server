// chanter.attach_safecommit_review — append SafeCommit-style review metadata.
// Metadata only. No commit, no push, no execution.

import { loadProposal, saveProposal } from "../proposals/proposalStore.js";
import { redactSensitiveValues } from "../safety/redaction.js";
import type {
  SafecommitVerdict,
  SafecommitRiskLevel,
  ValidationCheck,
  ReviewBlocker,
  SafecommitReviewEvent,
} from "../safecommit/safecommitTypes.js";

const VALID_VERDICTS: SafecommitVerdict[] = ["safe_to_review", "needs_changes", "blocked", "unsafe"];
const VALID_RISK_LEVELS: SafecommitRiskLevel[] = ["low", "medium", "high", "critical"];

export interface AttachSafecommitReviewInput {
  proposalId: string;
  reviewer: string;
  verdict: string;
  riskLevel: string;
  notes?: string;
  validationChecks?: ValidationCheck[];
  blockers?: ReviewBlocker[];
}

export interface AttachSafecommitReviewResult {
  success: boolean;
  error?: string;
  proposalId?: string;
  reviewStatus?: string;
  verdict?: string;
  executionStatus?: string;
}

export async function handleAttachSafecommitReview(
  input: AttachSafecommitReviewInput
): Promise<AttachSafecommitReviewResult> {
  const proposalId = input.proposalId.trim();
  const proposal = loadProposal(proposalId);
  if (!proposal) return { success: false, error: `Proposal not found: "${proposalId}".` };

  if (!VALID_VERDICTS.includes(input.verdict as SafecommitVerdict)) {
    return { success: false, error: `Invalid verdict: "${input.verdict}". Allowed: ${VALID_VERDICTS.join(", ")}` };
  }
  if (!VALID_RISK_LEVELS.includes(input.riskLevel as SafecommitRiskLevel)) {
    return { success: false, error: `Invalid riskLevel: "${input.riskLevel}". Allowed: ${VALID_RISK_LEVELS.join(", ")}` };
  }

  const verdict = input.verdict as SafecommitVerdict;
  const riskLevel = input.riskLevel as SafecommitRiskLevel;
  const reviewer = redactSensitiveValues(input.reviewer.trim());
  if (!reviewer) return { success: false, error: "Reviewer must not be empty." };

  const notes = input.notes ? redactSensitiveValues(input.notes.trim()) : undefined;

  // Redact validation checks
  const safeChecks = (input.validationChecks ?? []).map(c => ({
    ...c,
    notes: redactSensitiveValues(c.notes),
  }));

  // Redact blocker messages
  const safeBlockers = (input.blockers ?? []).map(b => ({
    ...b,
    message: redactSensitiveValues(b.message),
  }));

  const reviewEvent: SafecommitReviewEvent = {
    timestamp: new Date().toISOString(),
    reviewer,
    verdict,
    riskLevel,
    notes,
    validationChecks: safeChecks,
    blockers: safeBlockers,
  };

  // Determine review status
  let reviewStatus: string;
  switch (verdict) {
    case "safe_to_review": reviewStatus = "passed_metadata_only"; break;
    case "needs_changes": reviewStatus = "needs_changes"; break;
    case "blocked": reviewStatus = "blocked"; break;
    case "unsafe": reviewStatus = "failed_metadata_only"; break;
  }

  // Store in safety notes
  proposal.safetyNotes.push(`SAFECOMMIT_REVIEW:${JSON.stringify(reviewEvent)}`);
  proposal.updatedAt = new Date().toISOString();
  proposal.executionStatus = "not_executed"; // CRITICAL: never change

  // Update recommended next action
  if (verdict === "safe_to_review") {
    proposal.recommendedNextAction = "SafeCommit review passed (metadata only). Does NOT authorize commit or execution. Await P4+.";
  } else if (verdict === "needs_changes") {
    proposal.recommendedNextAction = "SafeCommit review requires changes. Update proposal and resubmit.";
  } else {
    proposal.recommendedNextAction = `SafeCommit review ${verdict}. Address blockers before proceeding.`;
  }

  saveProposal(proposal);

  return {
    success: true,
    proposalId,
    reviewStatus,
    verdict,
    executionStatus: "not_executed",
  };
}
