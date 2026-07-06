// Permission model for CHANTER MCP tools.
// P3A: write_proposed is allowed (proposals + operator reviews), write_approved/dangerous_forbidden blocked.

export type PermissionLevel = "read_public" | "read_internal" | "write_proposed" | "write_approved" | "dangerous_forbidden";

export interface PermissionEntry {
  toolName: string; level: PermissionLevel; description: string;
  requiresAudit: boolean; requiresApproval: boolean; requiresDryRun: boolean;
  requiresSafeCommitGate: boolean; requiresOperatorGate: boolean;
}

export const PERMISSIONS: Record<string, PermissionEntry> = {
  "chanter.list_products": { toolName: "chanter.list_products", level: "read_public", description: "List all CHANTER products in the registry.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_product_status": { toolName: "chanter.get_product_status", level: "read_internal", description: "Get detailed status for a specific CHANTER product.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.list_safe_tools": { toolName: "chanter.list_safe_tools", level: "read_public", description: "List all currently exposed MCP tools.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.inspect_workspace": { toolName: "chanter.inspect_workspace", level: "read_internal", description: "Inspect high-level workspace presence.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_readiness": { toolName: "chanter.get_readiness", level: "read_public", description: "Get readiness checklist.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.git_status": { toolName: "chanter.git_status", level: "read_internal", description: "Safe read-only git status summary.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.test_summary": { toolName: "chanter.test_summary", level: "read_internal", description: "Inspect package.json scripts.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.product_readiness": { toolName: "chanter.product_readiness", level: "read_internal", description: "Product readiness score.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.propose_action": { toolName: "chanter.propose_action", level: "write_proposed", description: "Create dry-run action proposal.", requiresAudit: true, requiresApproval: false, requiresDryRun: true, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.list_proposals": { toolName: "chanter.list_proposals", level: "read_internal", description: "List recent dry-run proposals.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_proposal": { toolName: "chanter.get_proposal", level: "read_internal", description: "Read single proposal by ID.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.review_proposal": { toolName: "chanter.review_proposal", level: "write_proposed", description: "Record human review decision.", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: true },
  "chanter.get_approval_requirements": { toolName: "chanter.get_approval_requirements", level: "read_internal", description: "Get Operator approval requirements and evidence bundle.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.attach_operator_review": { toolName: "chanter.attach_operator_review", level: "write_proposed", description: "Attach Operator-style review event.", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: true },
};

export function isSafeLevel(level: PermissionLevel): boolean {
  return level === "read_public" || level === "read_internal" || level === "write_proposed";
}

export function validateReadOnly(): string[] {
  const violations: string[] = [];
  for (const [name, entry] of Object.entries(PERMISSIONS)) {
    if (entry.level === "write_approved" || entry.level === "dangerous_forbidden") {
      violations.push(`${name}: has level ${entry.level} (forbidden in P3A)`);
    }
  }
  return violations;
}

export const FUTURE_WRITE_TOOL_REQUIREMENTS = {
  explicitHumanApproval: true, auditEntry: true, dryRunPreview: true,
  safeCommitReviewGate: true, operatorApprovalGate: true,
} as const;
