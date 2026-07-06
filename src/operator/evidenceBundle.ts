// Evidence bundle builder for proposals.
// Collects safe metadata snapshots without exposing secrets, diffs, or file contents.

import type { DryRunProposal } from "../proposals/proposalTypes.js";
import type { EvidenceBundle, OperatorReviewEvent } from "./approvalTypes.js";

export function buildEvidenceBundle(
  proposal: DryRunProposal,
  operatorReviews: OperatorReviewEvent[],
  auditEventCount: number
): EvidenceBundle {
  const combinedReviews = [
    ...proposal.reviewHistory.map(r => ({
      reviewer: r.reviewer,
      role: "human_reviewer",
      decision: r.decision,
      timestamp: r.timestamp,
    })),
    ...operatorReviews.map(r => ({
      reviewer: r.reviewer,
      role: r.reviewerRole,
      decision: r.decision,
      timestamp: r.timestamp,
    })),
  ];

  const bundle: EvidenceBundle = {
    proposalId: proposal.proposalId,
    productId: proposal.productId,
    actionType: proposal.actionType,
    riskLevel: proposal.riskLevel,
    requiredGates: {
      human_approval: proposal.requiredGates.human_approval,
      audit_log: proposal.requiredGates.audit_log,
      dry_run_preview: proposal.requiredGates.dry_run_preview,
      safecommit_review: proposal.requiredGates.safecommit_review,
      operator_approval: proposal.requiredGates.operator_approval,
    },
    gitSnapshot: {
      available: !!proposal.snapshots?.git,
      dirty: proposal.snapshots?.git?.dirty as boolean | undefined,
      branch: proposal.snapshots?.git?.branch as string | null | undefined,
      commit: proposal.snapshots?.git?.shortCommit as string | null | undefined,
    },
    validationSnapshot: {
      available: !!proposal.snapshots?.validation,
      test: (proposal.snapshots?.validation as any)?.validationCommandsAvailable?.test as boolean | undefined,
      build: (proposal.snapshots?.validation as any)?.validationCommandsAvailable?.build as boolean | undefined,
      typecheck: (proposal.snapshots?.validation as any)?.validationCommandsAvailable?.typecheck as boolean | undefined,
    },
    readinessSnapshot: {
      available: !!proposal.snapshots?.readiness,
      score: (proposal.snapshots?.readiness as any)?.readinessScore as number | undefined,
    },
    auditReferences: {
      totalEvents: auditEventCount,
      latestEvent: auditEventCount > 0 ? "Audit trail available in .mcp-audit/" : undefined,
    },
    reviewHistory: combinedReviews,
    safetyWarning:
      "APPROVAL IS METADATA ONLY. No proposal has been executed. No product has been modified. Execution remains blocked until a future checkpoint that explicitly enables write_approved tools with full safety gates.",
  };

  return bundle;
}

