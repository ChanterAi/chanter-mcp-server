// Operator approval types — typed concepts for the P3A approval bridge.
// All metadata-only. No execution capability.

export type ApprovalRoute =
  | "founder_review"
  | "operator_review"
  | "safecommit_review"
  | "product_owner_review"
  | "blocked_for_p3_execution";

export type ReviewerRole =
  | "founder"
  | "operator"
  | "safecommit"
  | "product_owner"
  | "system";

export type ApprovalStage =
  | "proposed"
  | "under_review"
  | "approved_metadata_only"
  | "rejected"
  | "needs_changes"
  | "expired"
  | "blocked";

export interface OperatorReviewEvent {
  timestamp: string;
  reviewer: string;
  reviewerRole: ReviewerRole;
  decision: "approved_metadata_only" | "rejected" | "needs_changes";
  notes?: string;
  stage: ApprovalStage;
}

export interface ApprovalRequirement {
  stage: ApprovalStage;
  routes: ApprovalRoute[];
  role: ReviewerRole;
  required: boolean;
  satisfied: boolean;
  notes: string;
}

export interface EvidenceBundle {
  proposalId: string;
  productId: string;
  actionType: string;
  riskLevel: string;
  requiredGates: {
    human_approval: boolean;
    audit_log: boolean;
    dry_run_preview: boolean;
    safecommit_review: boolean;
    operator_approval: boolean;
  };
  gitSnapshot: {
    available: boolean;
    dirty?: boolean;
    branch?: string | null;
    commit?: string | null;
  };
  validationSnapshot: {
    available: boolean;
    test?: boolean;
    build?: boolean;
    typecheck?: boolean;
  };
  readinessSnapshot: {
    available: boolean;
    score?: number;
  };
  auditReferences: {
    totalEvents: number;
    latestEvent?: string;
  };
  reviewHistory: Array<{
    reviewer: string;
    role: string;
    decision: string;
    timestamp: string;
  }>;
  safetyWarning: string;
}

export const VALID_REVIEWER_ROLES: ReviewerRole[] = [
  "founder",
  "operator",
  "safecommit",
  "product_owner",
  "system",
];

export const VALID_DECISIONS: OperatorReviewEvent["decision"][] = [
  "approved_metadata_only",
  "rejected",
  "needs_changes",
];

/**
 * Determine approval routes for a proposal based on product and risk.
 */
export function determineApprovalRoutes(
  productId: string,
  actionType: string,
  riskLevel: string
): ApprovalRoute[] {
  const routes: ApprovalRoute[] = [];

  // Base routes by risk
  if (riskLevel === "critical") {
    routes.push("founder_review");
    routes.push("operator_review");
    routes.push("blocked_for_p3_execution");
  } else if (riskLevel === "high") {
    routes.push("operator_review");
    routes.push("blocked_for_p3_execution");
  } else {
    routes.push("blocked_for_p3_execution");
  }

  // Product-specific routes
  if (productId === "autoposter") {
    if (!routes.includes("operator_review")) routes.push("operator_review");
    routes.push("product_owner_review");
  }

  if (productId === "safecommit" || actionType === "prepare_commit_review") {
    routes.push("safecommit_review");
  }

  if (productId === "operator") {
    if (!routes.includes("founder_review")) routes.push("founder_review");
  }

  // Deduplicate
  return [...new Set(routes)];
}

/**
 * Get primary reviewer role for an approval route.
 */
export function routeToRole(route: ApprovalRoute): ReviewerRole {
  switch (route) {
    case "founder_review": return "founder";
    case "operator_review": return "operator";
    case "safecommit_review": return "safecommit";
    case "product_owner_review": return "product_owner";
    case "blocked_for_p3_execution": return "system";
  }
}

/**
 * Build approval requirements array for a proposal.
 */
export function buildApprovalRequirements(
  productId: string,
  actionType: string,
  riskLevel: string,
  existingReviews: OperatorReviewEvent[]
): ApprovalRequirement[] {
  const routes = determineApprovalRoutes(productId, actionType, riskLevel);
  const requirements: ApprovalRequirement[] = [];

  const reviewedRoles = new Set(
    existingReviews
      .filter(r => r.decision === "approved_metadata_only")
      .map(r => r.reviewerRole)
  );

  for (const route of routes) {
    const role = routeToRole(route);
    const satisfied = reviewedRoles.has(role);

    let notes: string;
    if (route === "blocked_for_p3_execution") {
      notes = "Execution is not available in P3A. All proposals remain not_executed regardless of approval status.";
    } else if (satisfied) {
      notes = `${role} has approved this proposal (metadata only). Execution remains blocked.`;
    } else {
      notes = `Requires ${role} review via chanter.attach_operator_review.`;
    }

    requirements.push({
      stage: satisfied ? "approved_metadata_only" : "under_review",
      routes: [route],
      role,
      required: true,
      satisfied,
      notes,
    });
  }

  return requirements;
}
