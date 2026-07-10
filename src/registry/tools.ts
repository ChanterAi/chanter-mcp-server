// Tool registry – 21 MCP tools: C1(5) + P1(3) + P2(4) + P3A(2) + P3B(3) + P4(4 AutoPoster runtime control)

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
  // ── P4: AutoPoster runtime control (every call goes MCP -> Agent Runtime -> AutoPoster adapter; MCP never calls AutoPoster directly) ──
  { name: "chanter.autoposter_list_queue", description: "List AutoPoster queue items via the Agent Runtime (bounded, redacted, truthful empty vs failure).", permissionLevel: "read_internal", productScope: "autoposter", parameters: [
    { name: "accountId", description: "Optional publishing channel (TikTok account) scope.", type: "string", required: false },
    { name: "limit", description: "Max items to return (integer 1-100, default 25).", type: "number", required: false, default: 25 },
    { name: "requestedBy", description: "Requesting actor identity. Default: mcp-client.", type: "string", required: false },
  ]},
  { name: "chanter.autoposter_get_post_status", description: "Get one AutoPoster post's normalized queue/publishing status via the Agent Runtime. Ownership-scoped; not-found is reported truthfully.", permissionLevel: "read_internal", productScope: "autoposter", parameters: [
    { name: "postId", description: "The AutoPoster post/job ID.", type: "string", required: true },
    { name: "accountId", description: "Optional publishing channel scope.", type: "string", required: false },
    { name: "requestedBy", description: "Requesting actor identity. Default: mcp-client.", type: "string", required: false },
  ]},
  { name: "chanter.autoposter_validate_media", description: "Validate media against AutoPoster's real video-only TikTok policy via the Agent Runtime. Provide mediaUrl, or fileName/mimeType. Returns valid true/false with a rejection code.", permissionLevel: "read_internal", productScope: "autoposter", parameters: [
    { name: "mediaUrl", description: "Public HTTPS media URL to check (must point directly at an MP4/MOV/WebM file).", type: "string", required: false },
    { name: "fileName", description: "Original file name (checked together with mimeType).", type: "string", required: false },
    { name: "mimeType", description: "MIME type (checked together with fileName).", type: "string", required: false },
    { name: "requestedBy", description: "Requesting actor identity. Default: mcp-client.", type: "string", required: false },
  ]},
  { name: "chanter.autoposter_schedule_post", description: "Schedule one video into the AutoPoster queue via the Agent Runtime. Creates ONE unapproved queue item only — publishing still requires human approval in AutoPoster; this tool can never publish. Requires approvedBy (runtime approval gate) and idempotencyKey (duplicate keys return the existing item).", permissionLevel: "write_runtime_gated", productScope: "autoposter", parameters: [
    { name: "accountId", description: "Publishing channel ID (TikTok account ID, or YouTube channel ID when provider=youtube). Required.", type: "string", required: true },
    { name: "provider", description: "Optional publishing provider: \"tiktok\" (default) or \"youtube\". YouTube uploads are locked to Private with subscriber notifications disabled.", type: "string", required: false },
    { name: "mediaUrl", description: "Public HTTPS video URL (MP4/MOV/WebM). Required.", type: "string", required: true },
    { name: "scheduledAtUtc", description: "ISO-8601 timestamp WITH explicit timezone (e.g. 2026-07-11T09:00:00Z or 2026-07-11T12:00:00+03:00); must be in the future. Required.", type: "string", required: true },
    { name: "idempotencyKey", description: "Caller-chosen unique key; resubmitting the same key returns the existing queue item instead of creating a duplicate. Required.", type: "string", required: true },
    { name: "caption", description: "Optional post caption (TikTok).", type: "string", required: false },
    { name: "hashtags", description: "Optional hashtags string.", type: "string", required: false },
    { name: "title", description: "YouTube video title. Required when provider=youtube; never auto-derived from the caption.", type: "string", required: false },
    { name: "description", description: "Optional YouTube video description.", type: "string", required: false },
    { name: "approvedBy", description: "Human approver identity. Omitting this returns approval_required and nothing executes.", type: "string", required: false },
    { name: "approvalNote", description: "Optional approval note recorded in evidence.", type: "string", required: false },
    { name: "requestedBy", description: "Requesting actor identity. Default: mcp-client.", type: "string", required: false },
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
