// Tool registry – defines every MCP tool exposed by this server.
// Each tool maps to a handler and permission entry.
// C1 (5) + P1 (3) + P2 (4) + P3A (2) = 14 tools

import type { ChantProduct } from "./products.js";
import type { PermissionLevel } from "./permissions.js";

export interface McpToolParameter {
  name: string;
  description: string;
  type: "string" | "number" | "boolean";
  required: boolean;
  default?: unknown;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  permissionLevel: PermissionLevel;
  productScope?: string;
  parameters: McpToolParameter[];
}

export const EXPOSED_TOOLS: McpToolDefinition[] = [
  // === Checkpoint 1 ===
  {
    name: "chanter.list_products",
    description: "List all CHANTER products in the registry with summary metadata.",
    permissionLevel: "read_public",
    parameters: [],
  },
  {
    name: "chanter.get_product_status",
    description: "Get detailed status and metadata for a specific CHANTER product by ID.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      { name: "productId", description: "The product ID (e.g., autoposter, clean_engine, operator)", type: "string", required: true },
    ],
  },
  {
    name: "chanter.list_safe_tools",
    description: "List all currently exposed safe MCP tools and their permission levels.",
    permissionLevel: "read_public",
    parameters: [],
  },
  {
    name: "chanter.inspect_workspace",
    description: "Inspect high-level CHANTER workspace directory presence. Does NOT read secrets, scan large directories, or access .env files.",
    permissionLevel: "read_internal",
    parameters: [],
  },
  {
    name: "chanter.get_readiness",
    description: "Get the readiness checklist for the CHANTER MCP server itself, including product readiness states.",
    permissionLevel: "read_public",
    parameters: [],
  },

  // === P1: Read-Only System Intelligence ===
  {
    name: "chanter.git_status",
    description: "Return a safe, read-only git status summary for a CHANTER product or workspace root. Uses only allowlisted git commands.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      { name: "productId", description: "Optional product ID. If omitted, checks the CHANTER workspace root.", type: "string", required: false },
      { name: "includeFiles", description: "Whether to include changed file paths (default: false).", type: "boolean", required: false, default: false },
      { name: "maxFiles", description: "Maximum number of file paths to include (default: 25).", type: "number", required: false, default: 25 },
    ],
  },
  {
    name: "chanter.test_summary",
    description: "Return safe test/build command metadata for a CHANTER product. Inspects package.json scripts only. Does NOT execute npm scripts, read .env, or run tests.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      { name: "productId", description: "The product ID.", type: "string", required: true },
      { name: "runMode", description: "Inspection mode: 'metadata_only' (default) or 'latest_known'. Does not execute commands in P1.", type: "string", required: false, default: "metadata_only" },
    ],
  },
  {
    name: "chanter.product_readiness",
    description: "Return a product readiness score (0-100) using registry data, workspace presence, git status, and validation command availability.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      { name: "productId", description: "The product ID to assess readiness for.", type: "string", required: true },
    ],
  },

  // === P2: Dry-Run Proposal & Approval Foundation ===
  {
    name: "chanter.propose_action",
    description: "Create a dry-run action proposal for a CHANTER product. Does NOT execute, deploy, post, commit, or delete.",
    permissionLevel: "write_proposed",
    productScope: "any",
    parameters: [
      { name: "productId", description: "The target product ID.", type: "string", required: true },
      { name: "actionType", description: "Type: run_validation, review_readiness, prepare_commit_review, draft_autoposter_campaign, draft_clean_engine_job, inspect_product_health, propose_repair_plan.", type: "string", required: true },
      { name: "objective", description: "Plain-language description of what the proposal aims to accomplish.", type: "string", required: true },
      { name: "scope", description: "Optional array of scope qualifiers.", type: "string", required: false },
      { name: "requestedBy", description: "Who requested this proposal. Defaults to 'system'.", type: "string", required: false },
      { name: "riskTolerance", description: "Risk tolerance: low, medium, or high.", type: "string", required: false },
    ],
  },
  {
    name: "chanter.list_proposals",
    description: "List recent dry-run proposals with optional product and status filters.",
    permissionLevel: "read_internal",
    parameters: [
      { name: "productId", description: "Optional product ID to filter proposals.", type: "string", required: false },
      { name: "status", description: "Optional status filter: draft, pending_approval, approved, rejected, needs_changes, expired.", type: "string", required: false },
      { name: "limit", description: "Maximum proposals to return (default: 20, max: 50).", type: "number", required: false, default: 20 },
    ],
  },
  {
    name: "chanter.get_proposal",
    description: "Read a single proposal by proposalId. Returns full details including risk and review history.",
    permissionLevel: "read_internal",
    parameters: [
      { name: "proposalId", description: "The proposal ID to retrieve.", type: "string", required: true },
    ],
  },
  {
    name: "chanter.review_proposal",
    description: "Record a human review decision for a proposal. Updates metadata only. Does NOT execute.",
    permissionLevel: "write_proposed",
    parameters: [
      { name: "proposalId", description: "The proposal ID to review.", type: "string", required: true },
      { name: "decision", description: "Review decision: approved_for_future_execution, rejected, or needs_changes.", type: "string", required: true },
      { name: "reviewer", description: "Name or identifier of the reviewer.", type: "string", required: true },
      { name: "notes", description: "Optional review notes or feedback.", type: "string", required: false },
    ],
  },

  // === P3A: Operator Approval Bridge ===
  {
    name: "chanter.get_approval_requirements",
    description: "Get Operator approval requirements for a proposal. Returns approval routes, reviewer roles, required gates, evidence bundle. Does NOT execute, modify, or approve anything.",
    permissionLevel: "read_internal",
    parameters: [
      { name: "proposalId", description: "The proposal ID to get approval requirements for.", type: "string", required: true },
    ],
  },
  {
    name: "chanter.attach_operator_review",
    description: "Attach an Operator-style review event to a proposal. Updates approval stage only. Does NOT execute. executionStatus remains not_executed.",
    permissionLevel: "write_proposed",
    parameters: [
      { name: "proposalId", description: "The proposal ID to review.", type: "string", required: true },
      { name: "reviewer", description: "Name or identifier of the reviewer.", type: "string", required: true },
      { name: "reviewerRole", description: "Reviewer role: founder, operator, safecommit, product_owner, or system.", type: "string", required: true },
      { name: "decision", description: "Review decision: approved_metadata_only, rejected, or needs_changes.", type: "string", required: true },
      { name: "notes", description: "Optional review notes or feedback.", type: "string", required: false },
    ],
  },
];

export function findTool(name: string): McpToolDefinition | undefined {
  return EXPOSED_TOOLS.find((t) => t.name === name);
}

export function validateToolRegistry(): string[] {
  const issues: string[] = [];
  const names = new Set<string>();
  for (const tool of EXPOSED_TOOLS) {
    if (names.has(tool.name)) { issues.push(`Duplicate tool name: ${tool.name}`); }
    names.add(tool.name);
    if (!tool.permissionLevel) { issues.push(`${tool.name}: missing permission level`); }
    if (tool.permissionLevel === "write_approved" || tool.permissionLevel === "dangerous_forbidden") {
      issues.push(`${tool.name}: has forbidden permission level ${tool.permissionLevel}`);
    }
  }
  return issues;
}
