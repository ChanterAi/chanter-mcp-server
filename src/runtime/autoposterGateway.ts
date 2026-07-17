// AutoPoster runtime gateway — the ONLY path MCP tools may use to reach
// AutoPoster. Read-only tools (list, status, validate) go through the real
// chanter-agent-runtime executor directly. The schedule (write) tool goes
// through the Operator Mission Gateway, which owns durable mission identity,
// approval, and execution supervision.
//
// Read-only Runtime wiring (all optional — fail closed when absent):
//   AUTOPOSTER_BASE_URL       e.g. http://localhost:3010
//   AUTOPOSTER_RUNTIME_TOKEN  the AutoPoster RUNTIME_CONTROL_TOKEN value
//   AUTOPOSTER_TENANT_ID      tenant label recorded in missions
//   AUTOPOSTER_TIMEOUT_MS     per-call HTTP timeout (default 10000)
//
// Operator Mission Gateway (required for schedule):
//   OPERATOR_BASE_URL               e.g. http://127.0.0.1:3001
//   OPERATOR_MISSION_SUBMIT_TOKEN   submission-only capability token

import { randomUUID } from "node:crypto";
import {
  createAutoPosterHttpPort,
  createAutoPosterMissionAdapter,
  createMissionAdapterRegistry,
  executeMission,
  type AutoPosterOperationsPort,
  type JsonValue,
  type RuntimeMissionRequest,
  type RuntimeMissionResult,
} from "chanter-agent-runtime";
import {
  configureOperatorClientForTesting,
  operatorGraphResponseToRuntimeResult,
  submitScheduleGraphToOperator,
  type OperatorClientWiring,
  type OperatorScheduleMissionInput,
} from "./operatorClient.js";

export interface AutoPosterMissionInput {
  action: string;
  input: Record<string, JsonValue>;
  requestedBy?: string;
  workspaceId?: string;
  accountId?: string;
  idempotencyKey?: string;
  traceId?: string;
  missionId?: string;
}

interface GatewayWiring {
  port: AutoPosterOperationsPort;
}

let injectedWiring: GatewayWiring | null = null;
let defaultWiring: GatewayWiring | null = null;

export const READ_ONLY_AUTOPOSTER_ACTIONS = new Set([
  "autoposter.queue.list",
  "autoposter.post.get_status",
  "autoposter.media.validate",
]);

/** Test seam: inject a fake port. Operator client wiring is separate. */
export function configureAutoPosterGatewayForTesting(wiring: {
  port: AutoPosterOperationsPort;
} | null): void {
  injectedWiring = wiring
    ? { port: wiring.port }
    : null;
}

/** Test seam: object = fake Operator, null = disabled, undefined = production env. */
export function configureOperatorClientForTestingMcp(
  wiring: OperatorClientWiring | null | undefined,
): void {
  configureOperatorClientForTesting(wiring);
}

function resolveWiring(): GatewayWiring | { unavailableReason: string } {
  if (injectedWiring) return injectedWiring;
  if (defaultWiring) return defaultWiring;
  const baseUrl = (process.env.AUTOPOSTER_BASE_URL || "").trim();
  const serviceToken = (process.env.AUTOPOSTER_RUNTIME_TOKEN || "").trim();
  if (!baseUrl || !serviceToken) {
    return {
      unavailableReason:
        "AutoPoster runtime control is not configured on this MCP server (AUTOPOSTER_BASE_URL / AUTOPOSTER_RUNTIME_TOKEN are required).",
    };
  }
  const timeoutMs = Number(process.env.AUTOPOSTER_TIMEOUT_MS || 10_000);
  defaultWiring = {
    port: createAutoPosterHttpPort({ baseUrl, serviceToken, timeoutMs }),
  };
  return defaultWiring;
}

function tenantUserId(): string {
  return (process.env.AUTOPOSTER_TENANT_ID || "owner").trim() || "owner";
}

/** Builds the mission envelope and executes read-only actions through the real Agent Runtime. */
async function executeReadOnlyMission(request: AutoPosterMissionInput, action: string): Promise<RuntimeMissionResult> {
  const wiring = resolveWiring();
  const missionId = `mcp-${randomUUID()}`;
  const mission: RuntimeMissionRequest = {
    missionId,
    ...(request.traceId ? { traceId: request.traceId } : {}),
    product: "auto_poster",
    action,
    actor: { id: request.requestedBy?.trim() || "mcp-client", kind: "agent" },
    tenant: {
      userId: tenantUserId(),
      ...(request.workspaceId?.trim() ? { workspaceId: request.workspaceId.trim() } : {}),
      ...(request.accountId ? { accountId: request.accountId } : {}),
    },
    input: request.input,
    metadata: { origin: "chanter-mcp-server" },
    requestedAt: new Date().toISOString(),
  };

  if ("unavailableReason" in wiring) {
    return {
      missionId,
      traceId: mission.traceId ?? missionId,
      product: "auto_poster",
      action,
      status: "unavailable",
      output: null,
      evidence: null,
      warnings: [],
      errors: [{ code: "RUNTIME_NOT_CONFIGURED", message: wiring.unavailableReason }],
      policyDecision: null,
      approvalDecision: {
        required: false,
        approved: false,
        approvedBy: null,
      },
      idempotency: { key: request.idempotencyKey ?? null, outcome: "not_applicable" },
      startedAt: mission.requestedAt!,
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  const registry = createMissionAdapterRegistry([createAutoPosterMissionAdapter(wiring.port)]);
  return executeMission(mission, { registry });
}

/** Executes a schedule (write) mission through the Operator Mission Gateway. */
async function executeScheduleMission(request: AutoPosterMissionInput): Promise<RuntimeMissionResult> {
  const operatorInput: OperatorScheduleMissionInput = {
    accountId: String(request.input.accountId ?? request.accountId ?? ""),
    provider: String(request.input.provider ?? "tiktok"),
    mediaUrl: String(request.input.mediaUrl ?? ""),
    caption: String(request.input.caption ?? ""),
    hashtags: String(request.input.hashtags ?? ""),
    scheduledAt: String(request.input.scheduledAt ?? ""),
    idempotencyKey: request.idempotencyKey ?? "",
    requestedBy: request.requestedBy?.trim() || "mcp-client",
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    ...(request.input.title !== undefined ? { title: String(request.input.title) } : {}),
    ...(request.input.description !== undefined ? { description: String(request.input.description) } : {}),
    ...(request.missionId !== undefined ? { missionId: request.missionId } : {}),
    ...(request.traceId !== undefined ? { traceId: request.traceId } : {}),
  };

  const response = await submitScheduleGraphToOperator(operatorInput);
  return operatorGraphResponseToRuntimeResult(operatorInput, response, "autoposter.post.schedule");
}

/** Main gateway entry — routes read vs write actions. */
export async function executeAutoPosterMission(request: AutoPosterMissionInput): Promise<RuntimeMissionResult> {
  if (request.action === "autoposter.post.schedule") {
    return executeScheduleMission(request);
  }
  if (READ_ONLY_AUTOPOSTER_ACTIONS.has(request.action)) {
    return executeReadOnlyMission(request, request.action);
  }

  const now = new Date().toISOString();
  return {
    missionId: request.missionId ?? "not-created",
    traceId: request.traceId ?? request.missionId ?? "not-created",
    product: "auto_poster",
    action: request.action,
    status: "validation_failed",
    output: null,
    evidence: null,
    warnings: [],
    errors: [{
      code: "MCP_RUNTIME_ACTION_NOT_ALLOWLISTED",
      message: `Action "${request.action}" is not an allowlisted read action or the Operator-routed schedule action.`,
    }],
    policyDecision: null,
    approvalDecision: { required: false, approved: false, approvedBy: null },
    idempotency: { key: request.idempotencyKey ?? null, outcome: "not_applicable" },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
  };
}

/** Mission statuses that an MCP response may present as non-error. */
export function isNonErrorStatus(status: RuntimeMissionResult["status"]): boolean {
  return status === "succeeded" || status === "duplicate";
}
