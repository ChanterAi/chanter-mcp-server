// CHANTER MCP Server – Main server setup.
// Checkpoint P4: AutoPoster Runtime Control. 21 tools total.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

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
import { handleGetApprovalRequirements } from "./tools/getApprovalRequirements.js";
import { handleAttachOperatorReview } from "./tools/attachOperatorReview.js";
import { handleGetSafecommitRequirements } from "./tools/getSafecommitRequirements.js";
import { handleAttachSafecommitReview } from "./tools/attachSafecommitReview.js";
import { handleGetProposalEvidenceBundle } from "./tools/getProposalEvidenceBundle.js";
import {
  handleAutoposterListQueue,
  handleAutoposterGetPostStatus,
  handleAutoposterValidateMedia,
  handleAutoposterSchedulePost,
} from "./tools/autoposterRuntimeTools.js";
import { isNonErrorStatus } from "./runtime/autoposterGateway.js";
import type { RuntimeMissionResult } from "chanter-agent-runtime";
import { logCall } from "./audit/auditLogger.js";
import { checkSafetyPolicy, rejectionResponse } from "./safety/policy.js";

export function createChantermcpServer(): Server {
  const server = new Server({ name: "chanter-mcp-server", version: "0.6.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: EXPOSED_TOOLS.map(t => ({
      name: t.name, description: t.description,
      inputSchema: {
        type: "object" as const,
        properties: Object.fromEntries(t.parameters.map(p => [p.name, { type: p.type, description: p.description }])),
        required: t.parameters.filter(p => p.required).map(p => p.name),
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const input = args ?? {};
    const safety = checkSafetyPolicy(name, input);
    if (!safety.allowed) {
      await logCall({ toolName: name, permissionLevel: "dangerous_forbidden", input, resultStatus: "rejected", safetyNotes: safety.notes });
      return { content: [{ type: "text" as const, text: rejectionResponse(name, safety.reason!, safety.notes) }], isError: true };
    }
    const perm = PERMISSIONS[name];
    try {
      let result: unknown; let pid: string | undefined; const a = args as Record<string, unknown>;
      // AutoPoster reads use Runtime directly; the schedule write uses
      // Operator authority first. Truthful mission status decides the MCP
      // error flag, so denial/failure/refusal never appears as success.
      let missionResult: RuntimeMissionResult | undefined;
      switch (name) {
        case "chanter.list_products": result = await handleListProducts(); break;
        case "chanter.get_product_status": pid = a.productId as string; if (!pid?.trim()) throw new Error("productId required"); result = await handleGetProductStatus(pid); break;
        case "chanter.list_safe_tools": result = await handleListSafeTools(); break;
        case "chanter.inspect_workspace": result = await handleInspectWorkspace(); break;
        case "chanter.get_readiness": result = await handleGetReadiness(); break;
        case "chanter.git_status": pid = typeof a.productId === "string" ? a.productId : undefined; result = await handleGitStatus(pid, a.includeFiles === true, typeof a.maxFiles === "number" ? a.maxFiles : 25); break;
        case "chanter.test_summary": pid = a.productId as string; if (!pid?.trim()) throw new Error("productId required"); result = await handleTestSummary(pid, a.runMode === "latest_known" ? "latest_known" : "metadata_only"); break;
        case "chanter.product_readiness": pid = a.productId as string; if (!pid?.trim()) throw new Error("productId required"); result = await handleProductReadiness(pid); break;
        case "chanter.propose_action": { pid = a.productId as string; const sc = Array.isArray(a.scope) ? a.scope.filter((s): s is string => typeof s === "string") : undefined; result = await handleProposeAction({ productId: pid!, actionType: a.actionType as string, objective: a.objective as string, scope: sc, requestedBy: typeof a.requestedBy === "string" ? a.requestedBy : undefined, riskTolerance: typeof a.riskTolerance === "string" ? a.riskTolerance as any : undefined }); break; }
        case "chanter.list_proposals": result = await handleListProposals(typeof a.productId === "string" ? a.productId : undefined, typeof a.status === "string" ? a.status : undefined, typeof a.limit === "number" ? a.limit : 20); break;
        case "chanter.get_proposal": result = await handleGetProposal(a.proposalId as string); break;
        case "chanter.review_proposal": result = await handleReviewProposal({ proposalId: a.proposalId as string, decision: a.decision as string, reviewer: a.reviewer as string, notes: typeof a.notes === "string" ? a.notes : undefined }); break;
        case "chanter.get_approval_requirements": result = await handleGetApprovalRequirements(a.proposalId as string); break;
        case "chanter.attach_operator_review": result = await handleAttachOperatorReview({ proposalId: a.proposalId as string, reviewer: a.reviewer as string, reviewerRole: a.reviewerRole as string, decision: a.decision as string, notes: typeof a.notes === "string" ? a.notes : undefined }); break;
        case "chanter.get_safecommit_requirements": result = await handleGetSafecommitRequirements(a.proposalId as string); break;
        case "chanter.attach_safecommit_review": result = await handleAttachSafecommitReview({ proposalId: a.proposalId as string, reviewer: a.reviewer as string, verdict: a.verdict as string, riskLevel: a.riskLevel as string, notes: typeof a.notes === "string" ? a.notes : undefined, validationChecks: Array.isArray(a.validationChecks) ? a.validationChecks as any : undefined, blockers: Array.isArray(a.blockers) ? a.blockers as any : undefined }); break;
        case "chanter.get_proposal_evidence_bundle": result = await handleGetProposalEvidenceBundle(a.proposalId as string); break;
        case "chanter.autoposter_list_queue": pid = "autoposter"; missionResult = await handleAutoposterListQueue(a); result = missionResult; break;
        case "chanter.autoposter_get_post_status": pid = "autoposter"; missionResult = await handleAutoposterGetPostStatus(a); result = missionResult; break;
        case "chanter.autoposter_validate_media": pid = "autoposter"; missionResult = await handleAutoposterValidateMedia(a); result = missionResult; break;
        case "chanter.autoposter_schedule_post": pid = "autoposter"; missionResult = await handleAutoposterSchedulePost(a); result = missionResult; break;
        default:
          await logCall({ toolName: name, permissionLevel: "read_public", input, resultStatus: "error", safetyNotes: [`Unknown tool: ${name}`] });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: "${name}"`, knownTools: EXPOSED_TOOLS.map(t => t.name) }, null, 2) }], isError: true };
      }
      if (missionResult && !isNonErrorStatus(missionResult.status)) {
        await logCall({ toolName: name, permissionLevel: perm?.level ?? "read_public", productId: pid, input, resultStatus: "error", safetyNotes: [...safety.notes, `mission status: ${missionResult.status}`] });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: true };
      }
      await logCall({ toolName: name, permissionLevel: perm?.level ?? "read_public", productId: pid, input, resultStatus: "success", safetyNotes: missionResult ? [...safety.notes, `mission status: ${missionResult.status}`] : safety.notes });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await logCall({ toolName: name, permissionLevel: perm?.level ?? "read_public", input, resultStatus: "error", safetyNotes: [...safety.notes, `error: ${msg}`] });
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg, tool: name }, null, 2) }], isError: true };
    }
  });
  return server;
}

export async function startServer(): Promise<void> {
  const server = createChantermcpServer();
  await server.connect(new StdioServerTransport());
  console.error("CHANTER MCP Server – Max Edition v0.6.0 started");
  console.error("Checkpoint: P4 – AutoPoster Runtime Control");
  console.error("Transport: stdio");
}
