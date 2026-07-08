// Tool registry – 17 MCP tools: C1(5) + P1(3) + P2(4) + P3A(2) + P3B(3)

import type { ChantProduct } from "./products.js";
import type { PermissionLevel } from "./permissions.js";

export interface McpToolParameter {
  name: string; description: string; type: "string" | "number" | "boolean"; required: boolean; default?: unknown;
}
export interface McpToolDefinition {
  name: string; description: string; permissionLevel: PermissionLevel; productScope?: string; parameters: McpToolParameter[];
}

export const EXPOSED_TOOLS: McpToolDefinition[] = [
  { name: "chanter.list_products", description: "List all CHANTER products in the registry with summary metadata.", permissionLevel: "read_public", parameters: [] },
  { name: "chanter.get_product_status", description: "Get detailed status for a specific CHANTER product by ID.", permissionLevel: "read_internal", productScope: "any", parameters: [{ name: "productId", description: "The product ID (autoposter, clean_engine, etc.)", type: "string", required: true }] },
  { name: "chanter.list_safe_tools", description: "List all exposed safe MCP tools and their permission levels.", permissionLevel: "read_public", parameters: [] },
  { name: "chanter.inspect_workspace", description: "Inspect workspace directory presence. No secrets, no .env.", permissionLevel: "read_internal", parameters: [] },
  { name: "chanter.get_readiness", description: "Get MCP server readiness checklist.", permissionLevel: "read_public", parameters: [] },
  { name: "chanter.git_status", description: "Safe read-only git status summary. Allowlisted commands only.", permissionLevel: "read_internal", productScope: "any", parameters: [
    { name: "productId", description: "Optional product ID.", type: "string", required: false },
    { name: "includeFiles", description: "Include file paths (default false).", type: "boolean", required: false, default: false },
    { name: "maxFiles", description: "Max files (default 25).", type: "number", required: false, default: 25 },
  ]},
  { name: "chanter.test_summary", description: "Inspect package.json scripts. Does NOT execute npm.", permissionLevel: "read_internal", productScope: "any", parameters: [
    { name: "productId", description: "The product ID.", type: "string", required: true },
    { name: "runMode", description: "metadata_only (default) or latest_known.", type: "string", required: false, default: "metadata_only" },
  ]},
  { name: "chanter.product_readiness", description: "Product readiness score (0-100).", permissionLevel: "read_internal", productScope: "any", parameters: [
    { name: "productId", description: "Product ID.", type: "string", required: true },
  ]},
  { name: "chanter.propose_action", description: "Create dry-run action proposal. Does NOT execute.", permissionLevel: "write_proposed", productScope: "any", parameters: [
    { name: "productId", description: "Target product ID.", type: "string", required: true },
    { name: "actionType", description: "Action type (run_validation, review_readiness, etc.)", type: "string", required: true },
    { name: "objective", description: "What the proposal aims to accomplish.", type: "string", required: true },
    { name: "scope", description: "Optional scope qualifiers.", type: "string", required: false },
    { name: "requestedBy", description: "Requestor. Default: system.", type: "string", required: false },
    { name: "riskTolerance", description: "low, medium, high.", type: "string", required: false },
  ]},
  { name: "chanter.list_proposals", description: "List proposals with product/status/limit filters.", permissionLevel: "read_internal", parameters: [
    { name: "productId", description: "Optional product filter.", type: "string", required: false },
    { name: "status", description: "Optional status filter.", type: "string", required: false },
    { name: "limit", description: "Max results (default 20, max 50).", type: "number", required: false, default: 20 },
  ]},
  { name: "chanter.get_proposal", description: "Read one proposal by ID with full details.", permissionLevel: "read_internal", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
  ]},
  { name: "chanter.review_proposal", description: "Record human review decision. Metadata only.", permissionLevel: "write_proposed", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
    { name: "decision", description: "approved_for_future_execution, rejected, needs_changes.", type: "string", required: true },
    { name: "reviewer", description: "Reviewer name.", type: "string", required: true },
    { name: "notes", description: "Optional notes.", type: "string", required: false },
  ]},
  { name: "chanter.get_approval_requirements", description: "Get Operator approval routes, roles, gates, evidence bundle. Metadata only.", permissionLevel: "read_internal", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
  ]},
  { name: "chanter.attach_operator_review", description: "Attach Operator-style review event. Metadata only.", permissionLevel: "write_proposed", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
    { name: "reviewer", description: "Reviewer name.", type: "string", required: true },
    { name: "reviewerRole", description: "founder, operator, safecommit, product_owner, system.", type: "string", required: true },
    { name: "decision", description: "approved_metadata_only, rejected, needs_changes.", type: "string", required: true },
    { name: "notes", description: "Optional notes.", type: "string", required: false },
  ]},
  { name: "chanter.get_safecommit_requirements", description: "Get SafeCommit review requirements. Metadata only.", permissionLevel: "read_internal", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
  ]},
  { name: "chanter.attach_safecommit_review", description: "Attach a SELF-REPORTED SafeCommit review (caller-supplied verdict, not independently verified by a real SafeCommit run — advisory only). Does NOT commit or execute.", permissionLevel: "write_proposed", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
    { name: "reviewer", description: "SafeCommit reviewer name.", type: "string", required: true },
    { name: "verdict", description: "safe_to_review, needs_changes, blocked, unsafe.", type: "string", required: true },
    { name: "riskLevel", description: "low, medium, high, critical.", type: "string", required: true },
    { name: "notes", description: "Optional notes.", type: "string", required: false },
    { name: "validationChecks", description: "Optional validation check results.", type: "string", required: false },
    { name: "blockers", description: "Optional review blockers.", type: "string", required: false },
  ]},
  { name: "chanter.get_proposal_evidence_bundle", description: "Complete evidence bundle. Summaries only — no file contents, diffs, or secrets.", permissionLevel: "read_internal", parameters: [
    { name: "proposalId", description: "Proposal ID.", type: "string", required: true },
  ]},
];

export function findTool(name: string): McpToolDefinition | undefined {
  return EXPOSED_TOOLS.find(t => t.name === name);
}

export function validateToolRegistry(): string[] {
  const issues: string[] = [];
  const names = new Set<string>();
  for (const t of EXPOSED_TOOLS) {
    if (names.has(t.name)) issues.push(`Duplicate: ${t.name}`);
    names.add(t.name);
    if (!t.permissionLevel) issues.push(`${t.name}: missing permission level`);
    if (t.permissionLevel === "write_approved" || t.permissionLevel === "dangerous_forbidden")
      issues.push(`${t.name}: forbidden level ${t.permissionLevel}`);
  }
  return issues;
}
