// Permission model – 21 tools: C1(5) + P1(3) + P2(4) + P3A(2) + P3B(3) + P4(4)
// write_runtime_gated (P4): MCP itself never executes the write — the call is
// delegated to the Agent Runtime, which enforces its own approval gate,
// action policy, idempotency, and redaction. Distinct from write_approved
// (still forbidden): a missing approval returns approval_required, never an
// execution.
export type PermissionLevel = "read_public" | "read_internal" | "write_proposed" | "write_runtime_gated" | "write_approved" | "dangerous_forbidden";
export interface PermissionEntry {
  toolName: string; level: PermissionLevel; description: string;
  requiresAudit: boolean; requiresApproval: boolean; requiresDryRun: boolean;
  requiresSafeCommitGate: boolean; requiresOperatorGate: boolean;
}
export const PERMISSIONS: Record<string, PermissionEntry> = {
  "chanter.list_products": { toolName: "chanter.list_products", level: "read_public", description: "List CHANTER products.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_product_status": { toolName: "chanter.get_product_status", level: "read_internal", description: "Get product status.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.list_safe_tools": { toolName: "chanter.list_safe_tools", level: "read_public", description: "List safe tools.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.inspect_workspace": { toolName: "chanter.inspect_workspace", level: "read_internal", description: "Inspect workspace.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_readiness": { toolName: "chanter.get_readiness", level: "read_public", description: "Get readiness checklist.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.git_status": { toolName: "chanter.git_status", level: "read_internal", description: "Git status summary.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.test_summary": { toolName: "chanter.test_summary", level: "read_internal", description: "Package.json script inspection.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.product_readiness": { toolName: "chanter.product_readiness", level: "read_internal", description: "Product readiness score.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.propose_action": { toolName: "chanter.propose_action", level: "write_proposed", description: "Create dry-run proposal.", requiresAudit: true, requiresApproval: false, requiresDryRun: true, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.list_proposals": { toolName: "chanter.list_proposals", level: "read_internal", description: "List proposals.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.get_proposal": { toolName: "chanter.get_proposal", level: "read_internal", description: "Get proposal by ID.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.review_proposal": { toolName: "chanter.review_proposal", level: "write_proposed", description: "Record human review.", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: true },
  "chanter.get_approval_requirements": { toolName: "chanter.get_approval_requirements", level: "read_internal", description: "Operator approval requirements.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.attach_operator_review": { toolName: "chanter.attach_operator_review", level: "write_proposed", description: "Attach Operator review.", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: true },
  "chanter.get_safecommit_requirements": { toolName: "chanter.get_safecommit_requirements", level: "read_internal", description: "SafeCommit review requirements.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: true, requiresOperatorGate: false },
  "chanter.attach_safecommit_review": { toolName: "chanter.attach_safecommit_review", level: "write_proposed", description: "Attach self-reported SafeCommit review (not independently verified; advisory only).", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: true, requiresOperatorGate: false },
  "chanter.get_proposal_evidence_bundle": { toolName: "chanter.get_proposal_evidence_bundle", level: "read_internal", description: "Get evidence bundle. Summaries only.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.autoposter_list_queue": { toolName: "chanter.autoposter_list_queue", level: "read_internal", description: "List AutoPoster queue via Agent Runtime.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.autoposter_get_post_status": { toolName: "chanter.autoposter_get_post_status", level: "read_internal", description: "Get AutoPoster post status via Agent Runtime.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.autoposter_validate_media": { toolName: "chanter.autoposter_validate_media", level: "read_internal", description: "Validate media against AutoPoster's video-only policy via Agent Runtime.", requiresAudit: true, requiresApproval: false, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
  "chanter.autoposter_schedule_post": { toolName: "chanter.autoposter_schedule_post", level: "write_runtime_gated", description: "Schedule one AutoPoster queue item via Agent Runtime (approval-gated, idempotent, never publishes).", requiresAudit: true, requiresApproval: true, requiresDryRun: false, requiresSafeCommitGate: false, requiresOperatorGate: false },
};
export function isSafeLevel(level: PermissionLevel): boolean {
  return level === "read_public" || level === "read_internal" || level === "write_proposed";
}
export function validateReadOnly(): string[] {
  const v: string[] = [];
  for (const [n, e] of Object.entries(PERMISSIONS)) { if (e.level === "write_approved" || e.level === "dangerous_forbidden") v.push(`${n}: ${e.level} forbidden`); }
  return v;
}
export const FUTURE_WRITE_TOOL_REQUIREMENTS = {
  explicitHumanApproval: true, auditEntry: true, dryRunPreview: true, safeCommitReviewGate: true, operatorApprovalGate: true,
} as const;
