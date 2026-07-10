// AutoPoster runtime gateway — the ONLY path MCP tools may use to reach
// AutoPoster. Every tool builds a RuntimeMissionRequest and hands it to the
// real chanter-agent-runtime executor, which owns policy, approval,
// idempotency, redaction, and evidence. MCP never talks to AutoPoster
// directly and holds no queue/media/ownership/scheduling logic.
//
// Wiring (env, all optional — fail closed to 'unavailable' when absent):
//   AUTOPOSTER_BASE_URL       e.g. http://localhost:3010
//   AUTOPOSTER_RUNTIME_TOKEN  the AutoPoster RUNTIME_CONTROL_TOKEN value
//   AUTOPOSTER_TENANT_ID      tenant label recorded in missions (default
//                             'owner'; AutoPoster re-derives the real tenant
//                             server-side from the service token)
//   AUTOPOSTER_TIMEOUT_MS     per-call HTTP timeout (default 10000)

import { randomUUID } from "node:crypto";
import {
  createAutoPosterHttpPort,
  createAutoPosterMissionAdapter,
  createInMemoryIdempotencyStore,
  createMissionAdapterRegistry,
  executeMission,
  type AutoPosterOperationsPort,
  type JsonValue,
  type RuntimeMissionApproval,
  type RuntimeMissionRequest,
  type RuntimeMissionResult,
  type RuntimeMissionIdempotencyStore,
} from "chanter-agent-runtime";

export interface AutoPosterMissionInput {
  action: string;
  input: Record<string, JsonValue>;
  requestedBy?: string;
  accountId?: string;
  approval?: RuntimeMissionApproval;
  idempotencyKey?: string;
  traceId?: string;
}

interface GatewayWiring {
  port: AutoPosterOperationsPort;
  idempotencyStore: RuntimeMissionIdempotencyStore;
}

let injectedWiring: GatewayWiring | null = null;
let defaultWiring: GatewayWiring | null = null;

/** Test seam: inject a fake port (and optionally a fresh idempotency store). */
export function configureAutoPosterGatewayForTesting(wiring: {
  port: AutoPosterOperationsPort;
  idempotencyStore?: RuntimeMissionIdempotencyStore;
} | null): void {
  injectedWiring = wiring
    ? { port: wiring.port, idempotencyStore: wiring.idempotencyStore ?? createInMemoryIdempotencyStore() }
    : null;
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
    idempotencyStore: createInMemoryIdempotencyStore(),
  };
  return defaultWiring;
}

function tenantUserId(): string {
  return (process.env.AUTOPOSTER_TENANT_ID || "owner").trim() || "owner";
}

/** Builds the mission envelope and executes it through the real Agent Runtime. */
export async function executeAutoPosterMission(request: AutoPosterMissionInput): Promise<RuntimeMissionResult> {
  const missionId = `mcp-${randomUUID()}`;
  const wiring = resolveWiring();
  const mission: RuntimeMissionRequest = {
    missionId,
    ...(request.traceId ? { traceId: request.traceId } : {}),
    product: "auto_poster",
    action: request.action,
    actor: { id: request.requestedBy?.trim() || "mcp-client", kind: "agent" },
    tenant: { userId: tenantUserId(), ...(request.accountId ? { accountId: request.accountId } : {}) },
    input: request.input,
    ...(request.approval ? { approval: request.approval } : {}),
    ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
    metadata: { origin: "chanter-mcp-server" },
    requestedAt: new Date().toISOString(),
  };

  if ("unavailableReason" in wiring) {
    // Truthful unavailable result without inventing a runtime execution.
    return {
      missionId,
      traceId: mission.traceId ?? missionId,
      product: "auto_poster",
      action: request.action,
      status: "unavailable",
      output: null,
      evidence: null,
      warnings: [],
      errors: [{ code: "RUNTIME_NOT_CONFIGURED", message: wiring.unavailableReason }],
      policyDecision: null,
      approvalDecision: {
        required: false,
        approved: Boolean(request.approval?.approved),
        approvedBy: request.approval?.approvedBy ?? null,
      },
      idempotency: { key: request.idempotencyKey ?? null, outcome: "not_applicable" },
      startedAt: mission.requestedAt!,
      completedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  const registry = createMissionAdapterRegistry([createAutoPosterMissionAdapter(wiring.port)]);
  return executeMission(mission, { registry, idempotencyStore: wiring.idempotencyStore });
}

/** Mission statuses that an MCP response may present as non-error. */
export function isNonErrorStatus(status: RuntimeMissionResult["status"]): boolean {
  return status === "succeeded" || status === "duplicate";
}
