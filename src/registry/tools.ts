// Tool registry – defines every MCP tool exposed by this server.
// Each tool maps to a handler and permission entry.

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
  productScope?: string; // product id this tool relates to
  parameters: McpToolParameter[];
}

/**
 * All tools exposed in checkpoint 1, P1, and P2.
 */
export const EXPOSED_TOOLS: McpToolDefinition[] = [
  // === Checkpoint 1 ===
  {
    name: "chanter.list_products",
    description:
      "List all CHANTER products in the registry with summary metadata.",
    permissionLevel: "read_public",
    parameters: [],
  },
  {
    name: "chanter.get_product_status",
    description:
      "Get detailed status and metadata for a specific CHANTER product by ID.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      {
        name: "productId",
        description: "The product ID (e.g., autoposter, clean_engine, operator)",
        type: "string",
        required: true,
      },
    ],
  },
  {
    name: "chanter.list_safe_tools",
    description:
      "List all currently exposed safe MCP tools and their permission levels.",
    permissionLevel: "read_public",
    parameters: [],
  },
  {
    name: "chanter.inspect_workspace",
    description:
      "Inspect high-level CHANTER workspace directory presence. Does NOT read secrets, scan large directories, or access .env files.",
    permissionLevel: "read_internal",
    parameters: [],
  },
  {
    name: "chanter.get_readiness",
    description:
      "Get the readiness checklist for the CHANTER MCP server itself, including product readiness states.",
    permissionLevel: "read_public",
    parameters: [],
  },

  // === P1: Read-Only System Intelligence ===
  {
    name: "chanter.git_status",
    description:
      "Return a safe, read-only git status summary for a CHANTER product or workspace root. Uses only allowlisted git commands.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      {
        name: "productId",
        description: "Optional product ID. If omitted, checks the CHANTER workspace root.",
        type: "string",
        required: false,
      },
      {
        name: "includeFiles",
        description: "Whether to include changed file paths (default: false).",
        type: "boolean",
        required: false,
        default: false,
      },
      {
        name: "maxFiles",
        description: "Maximum number of file paths to include (default: 25).",
        type: "number",
        required: false,
        default: 25,
      },
    ],
  },
  {
    name: "chanter.test_summary",
    description:
      "Return safe test/build command metadata for a CHANTER product. Inspects package.json scripts only. Does NOT execute npm scripts, read .env, or run tests.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      {
        name: "productId",
        description: "The product ID.",
        type: "string",
        required: true,
      },
      {
        name: "runMode",
        description: "Inspection mode: 'metadata_only' (default) or 'latest_known'. Does not execute commands in P1.",
        type: "string",
        required: false,
        default: "metadata_only",
      },
    ],
  },
  {
    name: "chanter.product_readiness",
    description:
      "Return a product readiness score (0-100) using registry data, workspace presence, git status, and validation command availability.",
    permissionLevel: "read_internal",
    productScope: "any",
    parameters: [
      {
        name: "productId",
        description: "The product ID to assess readiness for.",
        type: "string",
        required: true,
      },
    ],
  },

  // === P2: Dry-Run Proposal & Approval Foundation ===
  {
    name: "chanter.propose_action",
    description:
      "Create a dry-run action proposal for a CHANTER product. Generates a structured proposal with risk classification, required gates, and safety notes. Does NOT execute the proposed action. Does NOT post, deploy, commit, delete, or call external APIs.",
    permissionLevel: "write_proposed",
    productScope: "any",
    parameters: [
      {
        name: "productId",
        description: "The target product ID.",
        type: "string",
        required: true,
      },
      {
        name: "actionType",
        description: "Type of action to propose: run_validation, review_readiness, prepare_commit_review, draft_autoposter_campaign, draft_clean_engine_job, inspect_product_health, propose_repair_plan.",
        type: "string",
        required: true,
      },
      {
        name: "objective",
        description: "Plain-language description of what the proposal aims to accomplish.",
        type: "string",
        required: true,
      },
      {
        name: "scope",
        description: "Optional array of scope qualifiers (e.g., affected paths, components).",
        type: "string",
        required: false,
      },
      {
        name: "requestedBy",
        description: "Who or what system requested this proposal. Defaults to 'system'.",
        type: "string",
        required: false,
      },
      {
        name: "riskTolerance",
        description: "Risk tolerance level: low, medium, or high.",
        type: "string",
        required: false,
      },
    ],
  },
  {
    name: "chanter.list_proposals",
    description:
      "List recent dry-run proposals with optional product and status filters. Proposals are read from local storage only and contain no product file data.",
    permissionLevel: "read_internal",
    parameters: [
      {
        name: "productId",
        description: "Optional product ID to filter proposals.",
        type: "string",
        required: false,
      },
      {
        name: "status",
        description: "Optional status filter: draft, pending_approval, approved, rejected, needs_changes, expired.",
        type: "string",
        required: false,
      },
      {
        name: "limit",
        description: "Maximum proposals to return (default: 20, max: 50).",
        type: "number",
        required: false,
        default: 20,
      },
    ],
  },
  {
    name: "chanter.get_proposal",
    description:
      "Read a single proposal by proposalId. Returns full proposal details including risk classification and review history. Does NOT execute anything.",
    permissionLevel: "read_internal",
    parameters: [
      {
        name: "proposalId",
        description: "The proposal ID to retrieve.",
        type: "string",
        required: true,
      },
    ],
  },
  {
    name: "chanter.review_proposal",
    description:
      "Record a human review decision for a proposal. Updates proposal metadata only. Does NOT execute the proposed action. Approval in P2 is metadata only — it does not authorize execution.",
    permissionLevel: "write_proposed",
    parameters: [
      {
        name: "proposalId",
        description: "The proposal ID to review.",
        type: "string",
        required: true,
      },
      {
        name: "decision",
        description: "Review decision: approved_for_future_execution, rejected, or needs_changes.",
        type: "string",
        required: true,
      },
      {
        name: "reviewer",
        description: "Name or identifier of the reviewer.",
        type: "string",
        required: true,
      },
      {
        name: "notes",
        description: "Optional review notes or feedback.",
        type: "string",
        required: false,
      },
    ],
  },
];

/**
 * Look up a tool by name. Returns undefined if not found.
 */
export function findTool(name: string): McpToolDefinition | undefined {
  return EXPOSED_TOOLS.find((t) => t.name === name);
}

/**
 * Validate the tool registry.
 * In P2, write_proposed tools are allowed (they don't execute).
 * write_approved and dangerous_forbidden remain forbidden.
 */
export function validateToolRegistry(): string[] {
  const issues: string[] = [];
  const names = new Set<string>();

  for (const tool of EXPOSED_TOOLS) {
    if (names.has(tool.name)) {
      issues.push(`Duplicate tool name: ${tool.name}`);
    }
    names.add(tool.name);

    if (!tool.permissionLevel) {
      issues.push(`${tool.name}: missing permission level`);
    }

    // Only reject write_approved and dangerous_forbidden
    // write_proposed is allowed in P2 (proposals don't execute)
    if (
      tool.permissionLevel === "write_approved" ||
      tool.permissionLevel === "dangerous_forbidden"
    ) {
      issues.push(
        `${tool.name}: has forbidden permission level ${tool.permissionLevel}`
      );
    }
  }

  return issues;
}
