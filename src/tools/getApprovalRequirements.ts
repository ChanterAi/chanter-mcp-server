// chanter.get_approval_requirements — return Operator approval requirements for a proposal.
// Metadata only. Does not execute, modify, or approve anything.

import { loadProposal } from "../proposals/proposalStore.js";
import type { DryRunProposal } from "../proposals/proposalTypes.js";
import {
  buildApprovalRequirements,
  determineApprovalRoutes,
  routeToRole,
  type ApprovalRequirement,
  type OperatorReviewEvent,
} from "../operator/approvalTypes.js";
import { buildEvidenceBundle } from "../operator/evidenceBundle.js";

export interface GetApprovalRequirementsResult {
  found: boolean;
  error?: string;
  proposalId?: string;
  productId?: string;
  actionType?: string;
  riskLevel?: string;
  approvalRoutes?: string[];
  requirements?: ApprovalRequirement[];
  evidenceBundle?: unknown;
  executionStatus?: string;
  warning: string;
}

export async function handleGetApprovalRequirements(
  proposalId: string
): Promise<GetApprovalRequirementsResult> {
  const id = proposalId.trim();
  if (!id) {
    return { found: false, error: "proposalId is required.", warning: "" };
  }

  const proposal = loadProposal(id);
  if (!proposal) {
    return {
      found: false,
      error: `Proposal not found: "${id}".`,
      warning: "",
    };
  }

  // Load existing operator reviews from proposal safety notes
  const operatorReviews: OperatorReviewEvent[] = extractOperatorReviews(proposal);

  const routes = determineApprovalRoutes(
    proposal.productId,
    proposal.actionType,
    proposal.riskLevel
  );

  const requirements = buildApprovalRequirements(
    proposal.productId,
    proposal.actionType,
    proposal.riskLevel,
    operatorReviews
  );

  const bundle = buildEvidenceBundle(proposal, operatorReviews, 0);

  return {
    found: true,
    proposalId: proposal.proposalId,
    productId: proposal.productId,
    actionType: proposal.actionType,
    riskLevel: proposal.riskLevel,
    approvalRoutes: routes,
    requirements,
    evidenceBundle: bundle,
    executionStatus: proposal.executionStatus,
    warning:
      "APPROVAL IS METADATA ONLY. No proposal has been executed. No product has been modified. Execution remains blocked in P3A.",
  };
}

/**
 * Extract operator review events from proposal safety notes (stored as serialized JSON).
 */
function extractOperatorReviews(proposal: DryRunProposal): OperatorReviewEvent[] {
  const reviews: OperatorReviewEvent[] = [];

  // Check safety notes for serialized operator reviews
  const prefix = "OPERATOR_REVIEW:";
  for (const note of proposal.safetyNotes) {
    if (note.startsWith(prefix)) {
      try {
        const json = note.slice(prefix.length);
        const review = JSON.parse(json) as OperatorReviewEvent;
        reviews.push(review);
      } catch {
        // skip malformed entries
      }
    }
  }

  return reviews;
}

/**
 * Get review role display names.
 */
export function getRoleDisplayName(role: string): string {
  switch (role) {
    case "founder": return "Founder";
    case "operator": return "Operator";
    case "safecommit": return "SafeCommit";
    case "product_owner": return "Product Owner";
    case "system": return "System (Automated)";
    default: return role;
  }
}
