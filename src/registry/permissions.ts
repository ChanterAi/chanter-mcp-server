// Permission model for CHANTER MCP tools.
// In P2, write_proposed is allowed (proposals don't execute).
// write_approved and dangerous_forbidden remain forbidden.

export type PermissionLevel =
  | "read_public"
  | "read_internal"
  | "write_proposed"
  | "write_approved"
  | "dangerous_forbidden";

export interface PermissionEntry {
  toolName: string;
  level: PermissionLevel;
  description: string;
  requiresAudit: boolean;
  requiresApproval: boolean;
  requiresDryRun: boolean;
  requiresSafeCommitGate: boolean;
  requiresOperatorGate: boolean;
}

export const PERMISSIONS: Record<string, PermissionEntry> = {
  // === Checkpoint 1 ===
  "chanter.list_products": {
    toolName: "chanter.list_products",
    level: "read_public",
    description: "List all CHANTER products in the registry.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.get_product_status": {
    toolName: "chanter.get_product_status",
    level: "read_internal",
    description: "Get detailed status for a specific CHANTER product.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.list_safe_tools": {
    toolName: "chanter.list_safe_tools",
    level: "read_public",
    description: "List all currently exposed MCP tools and their permission levels.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.inspect_workspace": {
    toolName: "chanter.inspect_workspace",
    level: "read_internal",
    description: "Inspect high-level workspace presence.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.get_readiness": {
    toolName: "chanter.get_readiness",
    level: "read_public",
    description: "Get readiness checklist for the CHANTER MCP server itself.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },

  // === P1: Read-Only System Intelligence ===
  "chanter.git_status": {
    toolName: "chanter.git_status",
    level: "read_internal",
    description: "Safe read-only git status summary for a CHANTER product or workspace.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.test_summary": {
    toolName: "chanter.test_summary",
    level: "read_internal",
    description: "Inspect package.json test/build scripts without executing anything.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.product_readiness": {
    toolName: "chanter.product_readiness",
    level: "read_internal",
    description: "Product readiness score with git, validation, and registry assessment.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },

  // === P2: Dry-Run Proposal & Approval Foundation ===
  "chanter.propose_action": {
    toolName: "chanter.propose_action",
    level: "write_proposed",
    description: "Create a dry-run action proposal. Does NOT execute, deploy, post, commit, or delete. Creates a structured proposal record with risk classification.",
    requiresAudit: true,
    requiresApproval: false, // Creating a proposal itself doesn't require approval
    requiresDryRun: true,    // Proposals ARE the dry-run
    requiresSafeCommitGate: false, // Gate checked during review, not creation
    requiresOperatorGate: false,
  },
  "chanter.list_proposals": {
    toolName: "chanter.list_proposals",
    level: "read_internal",
    description: "List recent dry-run proposals with optional filters.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.get_proposal": {
    toolName: "chanter.get_proposal",
    level: "read_internal",
    description: "Read a single proposal by proposalId with full details.",
    requiresAudit: true,
    requiresApproval: false,
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: false,
  },
  "chanter.review_proposal": {
    toolName: "chanter.review_proposal",
    level: "write_proposed",
    description: "Record a human review decision for a proposal. Updates metadata only. Does NOT execute, deploy, or modify products.",
    requiresAudit: true,
    requiresApproval: true,      // Review IS the approval
    requiresDryRun: false,
    requiresSafeCommitGate: false,
    requiresOperatorGate: true,  // High/critical proposals need Operator awareness
  },
};

/**
 * Check if a permission level is safe for the current checkpoint.
 * In P2, write_proposed is allowed.
 */
export function isSafeLevel(level: PermissionLevel): boolean {
  return level === "read_public" || level === "read_internal" || level === "write_proposed";
}

/**
 * Validate that no exposed tool has a forbidden permission level.
 * In P2: write_approved and dangerous_forbidden are still blocked.
 */
export function validateReadOnly(): string[] {
  const violations: string[] = [];
  for (const [name, entry] of Object.entries(PERMISSIONS)) {
    if (entry.level === "write_approved" || entry.level === "dangerous_forbidden") {
      violations.push(`${name}: has level ${entry.level} (forbidden in P2)`);
    }
  }
  return violations;
}

export const FUTURE_WRITE_TOOL_REQUIREMENTS = {
  explicitHumanApproval: true,
  auditEntry: true,
  dryRunPreview: true,
  safeCommitReviewGate: true,
  operatorApprovalGate: true,
} as const;
