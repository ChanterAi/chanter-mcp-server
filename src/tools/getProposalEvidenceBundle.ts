// chanter.get_proposal_evidence_bundle — full evidence bundle for a proposal.
// Summaries only. No file contents, no diffs, no secrets, no raw logs.

import { loadProposal } from "../proposals/proposalStore.js";

export async function handleGetProposalEvidenceBundle(
  proposalId: string
): Promise<{ found: boolean; error?: string; bundle?: Record<string, unknown> }> {
  const id = proposalId.trim();
  if (!id) return { found: false, error: "proposalId is required." };

  const proposal = loadProposal(id);
  if (!proposal) return { found: false, error: `Proposal not found: "${id}".` };

  // Extract reviews from safety notes
  const operatorReviews: Array<Record<string, unknown>> = [];
  const safecommitReviews: Array<Record<string, unknown>> = [];
  for (const note of proposal.safetyNotes) {
    if (note.startsWith("OPERATOR_REVIEW:")) {
      try { operatorReviews.push(JSON.parse(note.slice("OPERATOR_REVIEW:".length))); } catch { /* skip */ }
    }
    if (note.startsWith("SAFECOMMIT_REVIEW:")) {
      try { safecommitReviews.push(JSON.parse(note.slice("SAFECOMMIT_REVIEW:".length))); } catch { /* skip */ }
    }
  }

  const bundle = {
    proposal: {
      proposalId: proposal.proposalId,
      productId: proposal.productId,
      productDisplayName: proposal.productDisplayName,
      actionType: proposal.actionType,
      objective: proposal.objective,
      status: proposal.status,
      executionStatus: proposal.executionStatus,
      riskLevel: proposal.riskLevel,
      createdAt: proposal.createdAt,
      updatedAt: proposal.updatedAt,
      expiresAt: proposal.expiresAt,
    },
    product: {
      id: proposal.productId,
      displayName: proposal.productDisplayName,
    },
    risk: {
      level: proposal.riskLevel,
      requiredGates: proposal.requiredGates,
      forbiddenActions: proposal.forbiddenActions,
      safetyNotes: proposal.safetyNotes.filter(n => !n.startsWith("OPERATOR_REVIEW:") && !n.startsWith("SAFECOMMIT_REVIEW:")),
    },
    operatorApproval: {
      reviews: operatorReviews,
      totalReviews: operatorReviews.length,
      approved: operatorReviews.filter((r: any) => r.decision === "approved_metadata_only").length,
    },
    safecommitReview: {
      reviews: safecommitReviews,
      totalReviews: safecommitReviews.length,
      latestVerdict: safecommitReviews.length > 0 ? safecommitReviews[safecommitReviews.length - 1] : null,
    },
    humanReview: {
      reviews: proposal.reviewHistory.map(r => ({
        reviewer: r.reviewer,
        decision: r.decision,
        timestamp: r.timestamp,
      })),
      totalReviews: proposal.reviewHistory.length,
    },
    snapshots: {
      git: proposal.snapshots?.git ? { available: true } : { available: false },
      validation: proposal.snapshots?.validation ? { available: true } : { available: false },
      readiness: proposal.snapshots?.readiness ? { available: true } : { available: false },
    },
    safetyWarning: "EVIDENCE BUNDLE IS METADATA ONLY. Contains summaries only — no file contents, no diffs, no secrets, no raw logs. Execution remains blocked in P3B.",
  };

  return { found: true, bundle };
}
