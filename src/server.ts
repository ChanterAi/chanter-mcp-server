// CHANTER MCP Server – Main server setup.
// Wires registry, tools, audit, and safety policy into a single MCP server.
// Checkpoint P2: Dry-Run Proposal & Approval Foundation

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EXPOSED_TOOLS } from "./registry/tools.js";
import { PERMISSIONS } from "./registry/permissions.js";
import { handleListProducts } from "./tools/listProducts.js";
import { handleGetProductStatus } from "./tools/getProductStatus.js";
import { handleListSafeTools } from "./tools/listSafeTools.js";
import { handleInspectWorkspace } from "./tools/inspectWorkspace.js";
import { handleGetReadiness } from "./tools/getReadiness.js";
import { handleGitStatus } from "./tools/gitStatus.js";
import { handleTestSummary } from "./tools/testSummary.js";
import { handleProductReadiness } from "./tools/productReadiness.js";
import { handleProposeAction } from "./tools/proposeAction.js";
import { handleListProposals } from "./tools/listProposals.js";
import { handleGetProposal } from "./tools/getProposal.js";
import { handleReviewProposal } from "./tools/reviewProposal.js";
import { logCall } from "./audit/auditLogger.js";
import {
  checkSafetyPolicy,
  rejectionResponse,
} from "./safety/policy.js";

export function createChantermcpServer(): Server {
  const server = new Server(
    {
      name: "chanter-mcp-server",
      version: "0.3.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: EXPOSED_TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: "object" as const,
          properties: Object.fromEntries(
            tool.parameters.map((p) => [
              p.name,
              {
                type: p.type,
                description: p.description,
              },
            ])
          ),
          required: tool.parameters
            .filter((p) => p.required)
            .map((p) => p.name),
        },
      })),
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = args ?? {};

    // Safety policy check
    const safety = checkSafetyPolicy(name, input);
    if (!safety.allowed) {
      await logCall({
        toolName: name,
        permissionLevel: "dangerous_forbidden",
        input,
        resultStatus: "rejected",
        safetyNotes: safety.notes,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: rejectionResponse(name, safety.reason!, safety.notes),
          },
        ],
        isError: true,
      };
    }

    const perm = PERMISSIONS[name];

    try {
      let result: unknown;
      let productIdForAudit: string | undefined;

      switch (name) {
        // === Checkpoint 1 ===
        case "chanter.list_products":
          result = await handleListProducts();
          break;

        case "chanter.get_product_status": {
          const pid = (args as Record<string, unknown>)?.productId;
          if (typeof pid !== "string" || !pid.trim()) {
            throw new Error('Missing or invalid parameter: "productId" (string required)');
          }
          productIdForAudit = pid;
          result = await handleGetProductStatus(pid);
          break;
        }

        case "chanter.list_safe_tools":
          result = await handleListSafeTools();
          break;

        case "chanter.inspect_workspace":
          result = await handleInspectWorkspace();
          break;

        case "chanter.get_readiness":
          result = await handleGetReadiness();
          break;

        // === P1: Read-Only System Intelligence ===
        case "chanter.git_status": {
          const ga = args as Record<string, unknown>;
          const pid = typeof ga?.productId === "string" ? ga.productId : undefined;
          productIdForAudit = pid;
          result = await handleGitStatus(pid, ga?.includeFiles === true, typeof ga?.maxFiles === "number" ? ga.maxFiles : 25);
          break;
        }

        case "chanter.test_summary": {
          const ta = args as Record<string, unknown>;
          const pid = ta?.productId;
          if (typeof pid !== "string" || !pid.trim()) {
            throw new Error('Missing or invalid parameter: "productId" (string required)');
          }
          productIdForAudit = pid;
          const runMode = (ta?.runMode === "latest_known" ? "latest_known" : "metadata_only") as "metadata_only" | "latest_known";
          result = await handleTestSummary(pid, runMode);
          break;
        }

        case "chanter.product_readiness": {
          const pid = (args as Record<string, unknown>)?.productId;
          if (typeof pid !== "string" || !pid.trim()) {
            throw new Error('Missing or invalid parameter: "productId" (string required)');
          }
          productIdForAudit = pid;
          result = await handleProductReadiness(pid);
          break;
        }

        // === P2: Dry-Run Proposal & Approval Foundation ===
        case "chanter.propose_action": {
          const pa = args as Record<string, unknown>;
          if (typeof pa.productId !== "string" || !pa.productId.trim()) {
            throw new Error('Missing or invalid parameter: "productId" (string required)');
          }
          if (typeof pa.actionType !== "string" || !pa.actionType.trim()) {
            throw new Error('Missing or invalid parameter: "actionType" (string required)');
          }
          if (typeof pa.objective !== "string" || !pa.objective.trim()) {
            throw new Error('Missing or invalid parameter: "objective" (string required)');
          }
          productIdForAudit = pa.productId;
          
          const scopeParam = pa.scope;
          const scopeArray = Array.isArray(scopeParam)
            ? scopeParam.filter((s): s is string => typeof s === "string")
            : undefined;

          result = await handleProposeAction({
            productId: pa.productId,
            actionType: pa.actionType,
            objective: pa.objective,
            scope: scopeArray,
            requestedBy: typeof pa.requestedBy === "string" ? pa.requestedBy : undefined,
            riskTolerance: typeof pa.riskTolerance === "string"
              ? (pa.riskTolerance as "low" | "medium" | "high")
              : undefined,
          });
          break;
        }

        case "chanter.list_proposals": {
          const lp = args as Record<string, unknown>;
          result = await handleListProposals(
            typeof lp.productId === "string" ? lp.productId : undefined,
            typeof lp.status === "string" ? lp.status : undefined,
            typeof lp.limit === "number" ? lp.limit : 20
          );
          break;
        }

        case "chanter.get_proposal": {
          const gp = args as Record<string, unknown>;
          if (typeof gp.proposalId !== "string" || !gp.proposalId.trim()) {
            throw new Error('Missing or invalid parameter: "proposalId" (string required)');
          }
          result = await handleGetProposal(gp.proposalId);
          break;
        }

        case "chanter.review_proposal": {
          const rp = args as Record<string, unknown>;
          if (typeof rp.proposalId !== "string" || !rp.proposalId.trim()) {
            throw new Error('Missing or invalid parameter: "proposalId" (string required)');
          }
          if (typeof rp.decision !== "string" || !rp.decision.trim()) {
            throw new Error('Missing or invalid parameter: "decision" (string required)');
          }
          if (typeof rp.reviewer !== "string" || !rp.reviewer.trim()) {
            throw new Error('Missing or invalid parameter: "reviewer" (string required)');
          }
          result = await handleReviewProposal({
            proposalId: rp.proposalId,
            decision: rp.decision,
            reviewer: rp.reviewer,
            notes: typeof rp.notes === "string" ? rp.notes : undefined,
          });
          break;
        }

        default:
          await logCall({
            toolName: name,
            permissionLevel: "read_public",
            input,
            resultStatus: "error",
            safetyNotes: [`Unknown tool: ${name}`],
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { error: `Unknown tool: "${name}"`, knownTools: EXPOSED_TOOLS.map((t) => t.name) },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
      }

      // Log success
      await logCall({
        toolName: name,
        permissionLevel: perm?.level ?? "read_public",
        productId: productIdForAudit,
        input,
        resultStatus: "success",
        safetyNotes: safety.notes,
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await logCall({
        toolName: name,
        permissionLevel: perm?.level ?? "read_public",
        input,
        resultStatus: "error",
        safetyNotes: [...safety.notes, `error: ${errorMessage}`],
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: errorMessage, tool: name }, null, 2) },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = createChantermcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CHANTER MCP Server – Max Edition v0.3.0 started");
  console.error("Checkpoint: P2 – Dry-Run Proposal & Approval Foundation");
  console.error("Transport: stdio");
}
