// Tests: AutoPoster reads use the real Agent Runtime with a fake AutoPoster
// port. The production-impacting schedule action uses a controlled fake
// Operator HTTP boundary; MCP must never call the fake AutoPoster write port.

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AutoPosterOperationsPort, RuntimeMissionResult } from "chanter-agent-runtime";
import {
  configureAutoPosterGatewayForTesting,
  configureOperatorClientForTestingMcp,
  executeAutoPosterMission,
  isNonErrorStatus,
} from "../src/runtime/autoposterGateway.js";
import {
  handleAutoposterListQueue,
  handleAutoposterGetPostStatus,
  handleAutoposterValidateMedia,
  handleAutoposterSchedulePost,
} from "../src/tools/autoposterRuntimeTools.js";
import { EXPOSED_TOOLS } from "../src/registry/tools.js";
import { PERMISSIONS } from "../src/registry/permissions.js";
import { checkSafetyPolicy } from "../src/safety/policy.js";

const SERVICE_TOKEN_CANARY = "sk-canaryFAKEservicetoken1234567890";

interface PortCalls {
  listQueue: number;
  getPostStatus: number;
  validateMedia: number;
  schedulePost: number;
  listParams: unknown[];
  statusParams: unknown[];
  scheduleParams: unknown[];
}

function makePort(overrides: Partial<AutoPosterOperationsPort> = {}): { port: AutoPosterOperationsPort; calls: PortCalls } {
  const calls: PortCalls = {
    listQueue: 0,
    getPostStatus: 0,
    validateMedia: 0,
    schedulePost: 0,
    listParams: [],
    statusParams: [],
    scheduleParams: [],
  };
  const port: AutoPosterOperationsPort = {
    async listQueue(params) {
      calls.listQueue += 1;
      calls.listParams.push(params);
      return { ok: true, items: [], count: 0, scope: { accountId: params.accountId ?? "all" } };
    },
    async getPostStatus(params) {
      calls.getPostStatus += 1;
      calls.statusParams.push(params);
      return {
        ok: true,
        post: {
          id: params.postId,
          provider: "tiktok",
          connectedAccountId: "tiktok:account-a",
          accountId: "account-a",
          username: "creator_a",
          workspaceId: params.workspaceId ?? "workspace-a",
          status: "scheduled",
          scheduledAt: "2099-07-11T09:00:00.000Z",
          approved: false,
          approvalState: "unapproved",
          approvedAt: null,
          approvedBy: "",
          mediaType: "video",
          captionSummary: "",
          createdAt: null,
          updatedAt: "2099-07-11T08:00:00.000Z",
          postedAt: null,
          publishId: "",
          providerStatus: "scheduled",
          providerVerification: null,
          providerOperation: null,
          lockedAt: null,
          claimAttempts: 0,
          publishAttemptBudget: 5,
          attemptBudgetExhausted: false,
          runtimeMissionId: "mission-status-1",
          runtimeIdempotencyKey: "status-idempotency-1",
          runtimeAction: "autoposter.post.schedule",
          runtimePayloadHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          lastResult: null,
          history: [],
          lastErrorMessage: "",
        },
      };
    },
    async validateMedia() {
      calls.validateMedia += 1;
      return { ok: true, valid: true, classification: "video", policy: { videoOnly: true, allowedExtensions: [".mp4", ".mov", ".webm"] } };
    },
    async schedulePost(params) {
      calls.schedulePost += 1;
      calls.scheduleParams.push(params);
      return {
        ok: true,
        duplicate: false,
        post: { id: "queue-item-1", accountId: params.accountId, provider: params.provider ?? "tiktok", status: "scheduled", scheduledAt: params.scheduledAt, approved: false },
      };
    },
    ...overrides,
  };
  return { port, calls };
}

function futureIso(minutes = 60): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

interface FakeOperatorMission {
  missionId: string;
  traceId: string;
  product: "auto_poster";
  action: "autoposter.post.schedule";
  actorId: string;
  status: string;
  workspaceId: string;
  accountId: string;
  provider: string;
  mediaUrl: string;
  caption: string;
  hashtags: string;
  title: string | null;
  description: string | null;
  graphId: string;
  providerProofMode: boolean;
  approvedMedia: Record<string, unknown> | null;
  scheduledAt: string;
  idempotencyKey: string;
  requestedBy: string;
  approvalRequired: true;
  approvedBy: string | null;
  runtimeResult: RuntimeMissionResult | null;
  execution: unknown;
  executionJournal: unknown[];
  evidenceSummary: unknown;
  createdAt: string;
  updatedAt: string;
  binding: string;
}

interface FakeOperatorOptions {
  execute?: (mission: FakeOperatorMission) => RuntimeMissionResult;
}

function fakeRuntimeResult(
  mission: FakeOperatorMission,
  overrides: Partial<RuntimeMissionResult> = {},
): RuntimeMissionResult {
  const now = new Date().toISOString();
  return {
    missionId: mission.missionId,
    traceId: mission.traceId,
    product: "auto_poster",
    action: "autoposter.post.schedule",
    status: "succeeded",
    output: {
      post: {
        id: `queue-${mission.missionId}`,
        accountId: mission.accountId,
        provider: mission.provider,
        status: "scheduled",
        scheduledAt: mission.scheduledAt,
        approved: false,
      },
      publishing: "blocked_until_human_approval",
    },
    evidence: {
      taskId: `task-${mission.missionId}`,
      product: "auto_poster",
      objective: "Create one unapproved AutoPoster queue draft.",
      riskLevel: "high",
      executionPolicy: "publish_guarded",
      status: "completed",
      approvalRequired: true,
      planSummary: "Persist approval, then create one unapproved queue draft.",
      evidence: [{
        id: "evidence-1",
        type: "note",
        label: "Adapter result",
        detail: "Draft created.",
        createdAt: now,
      }],
      validationCommands: [],
      validationResult: null,
      result: {
        success: true,
        summary: "Draft created.",
        output: { queueId: `queue-${mission.missionId}` },
        completedAt: now,
      },
      nextRecommendation: null,
      eventLogSummary: [{ type: "TASK_APPROVED", timestamp: now, message: "Approved." }],
      createdAt: now,
      updatedAt: now,
      generatedAt: now,
    },
    warnings: [],
    errors: [],
    policyDecision: {
      allowed: true,
      approvalRequired: false,
      blocked: false,
      reasons: ["Operator approval persisted."],
    },
    approvalDecision: { required: true, approved: true, approvedBy: mission.approvedBy },
    idempotency: { key: mission.idempotencyKey, outcome: "first_execution" },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    ...overrides,
  };
}

function fakeFailureResult(
  mission: FakeOperatorMission,
  status: "failed" | "denied",
  code: string,
  message: string,
  output: RuntimeMissionResult["output"] = null,
): RuntimeMissionResult {
  const result = fakeRuntimeResult(mission);
  const now = new Date().toISOString();
  return {
    ...result,
    status,
    output,
    errors: [{ code, message }],
    evidence: {
      ...result.evidence!,
      status: "failed",
      result: { success: false, summary: message, completedAt: now },
      updatedAt: now,
      generatedAt: now,
    },
  };
}

function makeFakeOperator(options: FakeOperatorOptions = {}) {
  const recordsById = new Map<string, FakeOperatorMission>();
  const missionIdByKey = new Map<string, string>();
  const missionIdByTrace = new Map<string, string>();
  const calls = {
    create: 0,
    approvalHttpRequests: 0,
    independentApprovals: 0,
    downstreamWrites: 0,
    createBodies: [] as Array<Record<string, unknown>>,
  };
  let nextMission = 1;

  const publicMission = (mission: FakeOperatorMission, replayed?: boolean) => {
    const { binding: _binding, requestedBy: _requestedBy, ...record } = mission;
    return replayed === undefined ? record : { ...record, replayed };
  };

  // Phase 2F-A: the unified graph-backed route wraps the same underlying
  // mission record in the {graph, childMissionId, childMission} envelope.
  // The graph's own coarse status only ever needs approval_required or
  // completed here — a child result's presence (regardless of whether that
  // result itself is succeeded/failed/denied) is what makes it "completed",
  // exactly mirroring how a real AutoPoster graph node only leaves
  // approval_required once its child mission has produced *some* result.
  const graphSubmissionBody = (mission: FakeOperatorMission, replayed: boolean) => {
    const completed = Boolean(mission.runtimeResult);
    return {
      graph: {
        graphId: `graph-${mission.missionId}`,
        traceId: mission.traceId,
        idempotencyKey: mission.idempotencyKey,
        status: completed ? "completed" : "approval_required",
        approvedBy: mission.approvedBy,
        replayed,
        createdAt: mission.createdAt,
        updatedAt: mission.updatedAt,
        nodes: [{
          nodeId: "autoposter_schedule",
          status: completed ? "completed" : "blocked",
          resultStatus: mission.runtimeResult?.status ?? null,
          resultSummary: null,
          typedError: null,
        }],
      },
      childMissionId: mission.missionId,
      childMission: completed ? publicMission(mission) : null,
    };
  };

  const bindingFor = (body: Record<string, unknown>, fallbackTraceId: string) => JSON.stringify({
    traceId: typeof body.traceId === "string" ? body.traceId : fallbackTraceId,
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "legacy-default",
    accountId: body.accountId,
    provider: body.provider,
    mediaUrl: body.mediaUrl,
    caption: body.caption,
    hashtags: body.hashtags,
    title: body.title ?? null,
    description: body.description ?? null,
    providerProofMode: body.providerProofMode === true,
    approvedMedia: body.approvedMedia ?? null,
    scheduledAt: body.scheduledAt,
    requestedBy: body.requestedBy,
  });

  const independentlyApprove = (missionId: string, approvedBy = "founder"): FakeOperatorMission => {
    const mission = recordsById.get(missionId);
    assert.ok(mission, "independent Operator approval needs an existing mission");
    calls.independentApprovals += 1;
    if (!mission.runtimeResult) {
      mission.approvedBy = approvedBy;
      calls.downstreamWrites += 1;
      mission.runtimeResult = options.execute
        ? options.execute(mission)
        : fakeRuntimeResult(mission);
      mission.status = mission.runtimeResult.status;
      mission.updatedAt = new Date().toISOString();
    }
    return mission;
  };

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization !== "Bearer fake-operator-token") {
      return new Response(JSON.stringify({
        code: "CAPABILITY_TOKEN_INVALID",
        error: "Mission Gateway capability token is invalid.",
      }), { status: 401, headers: { "content-type": "application/json" } });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (url.pathname === "/api/mission-graphs/autoposter-schedule") {
      calls.create += 1;
      calls.createBodies.push(body);

      if (
        (body.missionId !== undefined && (typeof body.missionId !== "string" || !body.missionId)) ||
        (body.traceId !== undefined && (typeof body.traceId !== "string" || !body.traceId))
      ) {
        return new Response(JSON.stringify({
          code: "OPERATOR_MISSION_IDENTITY_INVALID",
          error: "missionId and traceId must be exact nonblank identifiers.",
        }), { status: 400, headers: { "content-type": "application/json" } });
      }

      if (body.provider === "youtube" && !body.title) {
        return new Response(JSON.stringify({
          code: "MISSING_YOUTUBE_TITLE",
          error: "title is required when provider is youtube.",
        }), { status: 400, headers: { "content-type": "application/json" } });
      }

      const requestedMissionId = typeof body.missionId === "string" ? body.missionId : undefined;
      const requestedTraceId = typeof body.traceId === "string" ? body.traceId : undefined;
      const idempotencyKey = String(body.idempotencyKey ?? "");
      const byMission = requestedMissionId !== undefined ? recordsById.get(requestedMissionId) : undefined;
      const indexedId = missionIdByKey.get(idempotencyKey);
      const byKey = indexedId ? recordsById.get(indexedId) : undefined;
      const indexedTraceId = requestedTraceId ? missionIdByTrace.get(requestedTraceId) : undefined;
      const byTrace = indexedTraceId ? recordsById.get(indexedTraceId) : undefined;
      const resolvedIds = new Set(
        [byMission, byKey, byTrace]
          .filter((mission): mission is FakeOperatorMission => Boolean(mission))
          .map(mission => mission.missionId),
      );
      if (resolvedIds.size > 1) {
        return new Response(JSON.stringify({
          code: "OPERATOR_MISSION_BINDING_MISMATCH",
          error: "Mission, trace, and idempotency identities resolve to different durable records.",
        }), { status: 409, headers: { "content-type": "application/json" } });
      }
      const existing = byMission ?? byKey ?? byTrace;
      if (existing) {
        const binding = bindingFor(body, existing.traceId);
        if (
          existing.idempotencyKey !== idempotencyKey ||
          existing.binding !== binding ||
          (requestedMissionId !== undefined && requestedMissionId !== existing.missionId) ||
          (requestedTraceId !== undefined && requestedTraceId !== existing.traceId)
        ) {
          return new Response(JSON.stringify({
            code: "OPERATOR_MISSION_BINDING_MISMATCH",
            error: "The request does not match the durable mission identity, scope, or payload.",
          }), { status: 409, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify(graphSubmissionBody(existing, true)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const missionId = requestedMissionId ?? `operator-mission-${nextMission++}`;
      const traceId = requestedTraceId ?? `trace-${missionId}`;
      const now = new Date().toISOString();
      const record: FakeOperatorMission = {
        missionId,
        traceId,
        product: "auto_poster",
        action: "autoposter.post.schedule",
        actorId: String(body.requestedBy ?? ""),
        status: "approval_required",
        workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "legacy-default",
        accountId: String(body.accountId ?? ""),
        provider: String(body.provider ?? "tiktok"),
        mediaUrl: String(body.mediaUrl ?? ""),
        caption: String(body.caption ?? ""),
        hashtags: String(body.hashtags ?? ""),
        title: typeof body.title === "string" ? body.title : null,
        description: typeof body.description === "string" ? body.description : null,
        graphId: `graph-${missionId}`,
        providerProofMode: body.providerProofMode === true,
        approvedMedia: body.approvedMedia && typeof body.approvedMedia === "object"
          ? body.approvedMedia as Record<string, unknown>
          : null,
        scheduledAt: String(body.scheduledAt ?? ""),
        idempotencyKey,
        requestedBy: String(body.requestedBy ?? ""),
        approvalRequired: true,
        approvedBy: null,
        runtimeResult: null,
        execution: { state: "approval_required" },
        executionJournal: [],
        evidenceSummary: {},
        createdAt: now,
        updatedAt: now,
        binding: bindingFor(body, traceId),
      };
      recordsById.set(missionId, record);
      missionIdByKey.set(idempotencyKey, missionId);
      missionIdByTrace.set(traceId, missionId);
      return new Response(JSON.stringify(graphSubmissionBody(record, false)), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    if (/^\/api\/runtime-missions\/[^/]+\/approve$/.test(url.pathname)) {
      calls.approvalHttpRequests += 1;
    }

    return new Response(JSON.stringify({ code: "NOT_FOUND", error: "Not found." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    recordsById,
    independentlyApprove,
    wiring: {
      config: {
        baseUrl: "http://127.0.0.1:3001",
        token: "fake-operator-token",
      },
      fetchImpl,
    },
    governedRecover(missionId: string, result: RuntimeMissionResult): void {
      const mission = recordsById.get(missionId);
      assert.ok(mission, "governed recovery needs an existing mission");
      calls.downstreamWrites += 1;
      mission.runtimeResult = result;
      mission.status = result.status;
      mission.updatedAt = new Date().toISOString();
    },
  };
}

beforeEach(() => {
  configureAutoPosterGatewayForTesting(null);
  configureOperatorClientForTestingMcp(null);
});
after(() => {
  configureAutoPosterGatewayForTesting(null);
  configureOperatorClientForTestingMcp(undefined);
});

describe("P4 — Tool registry and permissions", () => {
  const names = [
    "chanter.autoposter_list_queue",
    "chanter.autoposter_get_post_status",
    "chanter.autoposter_validate_media",
    "chanter.autoposter_schedule_post",
  ];
  it("exposes the four AutoPoster runtime tools with permission entries", () => {
    for (const name of names) {
      assert.ok(EXPOSED_TOOLS.some(t => t.name === name), `${name} missing from registry`);
      assert.ok(PERMISSIONS[name], `${name} missing from permissions`);
      assert.ok(checkSafetyPolicy(name, {}).allowed, `${name} must pass safety policy`);
    }
  });
  it("schedule tool exposes submission identity but no approval field", () => {
    const tool = EXPOSED_TOOLS.find(t => t.name === "chanter.autoposter_schedule_post")!;
    const required = tool.parameters.filter(p => p.required).map(p => p.name).sort();
    assert.deepEqual(required, ["accountId", "idempotencyKey", "mediaUrl", "scheduledAtUtc"]);
    assert.equal(tool.parameters.some(p => p.name === "approvedBy"), false);
    // Provider selection stays optional: TikTok by default, YouTube opt-in.
    assert.ok(tool.parameters.some(p => p.name === "provider" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "title" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "description" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "missionId" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "traceId" && !p.required));
    assert.equal(tool.parameters.some(p => p.name === "approvalNote"), false);
    assert.equal(tool.parameters.some(p => p.name === "approval"), false);
    assert.equal(PERMISSIONS[tool.name]!.level, "write_runtime_gated");
    assert.equal(PERMISSIONS[tool.name]!.requiresOperatorGate, true);
  });
  it("declares workspaceId only on workspace-scoped list, status, and schedule tools", () => {
    for (const name of [
      "chanter.autoposter_list_queue",
      "chanter.autoposter_get_post_status",
      "chanter.autoposter_schedule_post",
    ]) {
      const tool = EXPOSED_TOOLS.find(candidate => candidate.name === name)!;
      assert.ok(tool.parameters.some(parameter => parameter.name === "workspaceId" && !parameter.required), name);
    }
    const media = EXPOSED_TOOLS.find(candidate => candidate.name === "chanter.autoposter_validate_media")!;
    assert.equal(media.parameters.some(parameter => parameter.name === "workspaceId"), false);
  });
});

describe("P4 — MCP reads use Runtime and writes use Operator", () => {
  it("tool handlers contain no direct HTTP/AutoPoster access; only the gateway", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "..", "src", "tools", "autoposterRuntimeTools.ts"), "utf8");
    assert.ok(source.includes('from "../runtime/autoposterGateway.js"'), "handlers must import the runtime gateway");
    assert.equal(/\bfetch\s*\(/.test(source), false, "handlers must not call fetch()");
    assert.equal(source.includes("/api/runtime"), false, "handlers must not know AutoPoster routes");
  });
  it("the gateway has an explicit three-read allowlist and no MCP-owned write idempotency store", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "..", "src", "runtime", "autoposterGateway.ts"), "utf8");
    assert.ok(source.includes("submitScheduleGraphToOperator"), "writes must use the Operator client");
    assert.equal(source.includes("createInMemoryIdempotencyStore"), false, "MCP must not own durable write identity");

    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const result = await executeAutoPosterMission({
      action: "autoposter.future.write" as "autoposter.post.schedule",
      input: {},
    });
    assert.equal(result.status, "validation_failed");
    assert.equal(result.errors[0]!.code, "MCP_RUNTIME_ACTION_NOT_ALLOWLISTED");
    assert.equal(calls.schedulePost, 0);
    assert.equal(operator.calls.create, 0);
  });
  it("the production Operator client contains no approval endpoint request", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "..", "src", "runtime", "operatorClient.ts"), "utf8");
    assert.equal(source.includes("/approve"), false);
    assert.equal(source.includes("submitApprovalToOperator"), false);
  });
  it("every handler result is a runtime mission result with trace identity", async () => {
    configureAutoPosterGatewayForTesting({ port: makePort().port });
    const result = await handleAutoposterListQueue({});
    assert.equal(result.product, "auto_poster");
    assert.equal(result.action, "autoposter.queue.list");
    assert.match(result.missionId, /^mcp-/);
    assert.equal(result.traceId, result.missionId);
  });
});

describe("P4 — schema validation", () => {
  it("rejects unknown fields without creating a mission", async () => {
    configureAutoPosterGatewayForTesting({ port: makePort().port });
    const result = await handleAutoposterListQueue({ nope: "x" });
    assert.equal(result.status, "validation_failed");
    assert.equal(result.errors[0]!.code, "SCHEMA_VALIDATION_FAILED");
    assert.equal(result.missionId, "not-created");
  });
  it("rejects missing required fields and wrong types", async () => {
    configureAutoPosterGatewayForTesting({ port: makePort().port });
    const missing = await handleAutoposterGetPostStatus({});
    assert.equal(missing.status, "validation_failed");
    const wrongType = await handleAutoposterSchedulePost({ accountId: 5, mediaUrl: "https://x/a.mp4", scheduledAtUtc: futureIso(), idempotencyKey: "k" });
    assert.equal(wrongType.status, "validation_failed");
    const noMedia = await handleAutoposterValidateMedia({});
    assert.equal(noMedia.status, "validation_failed");
  });
  it("rejects caller-supplied plan, quota, and entitlement claims before mission creation", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });

    const claimedPlan = await handleAutoposterListQueue({ planId: "studio" });
    const claimedQuota = await handleAutoposterGetPostStatus({ postId: "post-1", quota: 999_999 });
    const claimedEntitlements = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "caller-commercial-claim",
      entitlements: { monthlyPosts: 999_999 },
    });

    for (const result of [claimedPlan, claimedQuota, claimedEntitlements]) {
      assert.equal(result.status, "validation_failed");
      assert.equal(result.missionId, "not-created");
      assert.ok(result.errors.some(error => error.code === "SCHEMA_VALIDATION_FAILED"));
    }
    assert.deepEqual(
      { listQueue: calls.listQueue, getPostStatus: calls.getPostStatus, schedulePost: calls.schedulePost },
      { listQueue: 0, getPostStatus: 0, schedulePost: 0 },
    );
  });
  it("rejects caller-supplied approval fields before Operator submission", async () => {
    for (const approvalField of ["approvedBy", "approvalNote", "approval"] as const) {
      const operator = makeFakeOperator();
      configureOperatorClientForTestingMcp(operator.wiring);
      const result = await handleAutoposterSchedulePost({
        accountId: "account-a",
        mediaUrl: "https://cdn.example.com/launch.mp4",
        scheduledAtUtc: futureIso(),
        idempotencyKey: `approval-field-${approvalField}`,
        [approvalField]: approvalField === "approval" ? { approved: true } : "founder",
      });
      assert.equal(result.status, "validation_failed", approvalField);
      assert.equal(result.missionId, "not-created", approvalField);
      assert.match(result.errors[0]!.message, new RegExp(`Unknown field "${approvalField}"`));
      assert.equal(operator.calls.create, 0, approvalField);
      assert.equal(operator.calls.approvalHttpRequests, 0, approvalField);
      assert.equal(operator.calls.downstreamWrites, 0, approvalField);
    }
  });
});

describe("P4 — workspace context parity", () => {
  it("propagates optional workspaceId through reads and the Operator write boundary", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);

    const list = await handleAutoposterListQueue({ workspaceId: "workspace-a", limit: 10 });
    const status = await handleAutoposterGetPostStatus({ workspaceId: "workspace-a", postId: "post-1" });
    const schedule = await handleAutoposterSchedulePost({
      workspaceId: "workspace-a",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "workspace-propagation-1",
    });

    assert.equal(list.status, "succeeded");
    assert.equal(status.status, "succeeded");
    assert.equal(schedule.status, "approval_required");
    assert.equal((calls.listParams[0] as Record<string, unknown>).workspaceId, "workspace-a");
    assert.equal((calls.statusParams[0] as Record<string, unknown>).workspaceId, "workspace-a");
    assert.equal(operator.calls.createBodies[0]!.workspaceId, "workspace-a");
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(calls.schedulePost, 0, "MCP must not call the AutoPoster write port");
  });

  it("keeps legacy calls valid when workspaceId is omitted", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterListQueue({ limit: 1 });
    assert.equal(result.status, "succeeded");
    assert.equal(Object.hasOwn(calls.listParams[0] as object, "workspaceId"), false);
  });
});

describe("P4 — read actions through the full chain", () => {
  it("queue list returns a truthful empty result", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterListQueue({ accountId: "account-a", limit: 10 });
    assert.equal(result.status, "succeeded");
    assert.ok(isNonErrorStatus(result.status));
    assert.equal(calls.listQueue, 1);
    const output = result.output as { count: number; empty: boolean };
    assert.equal(output.count, 0);
    assert.equal(output.empty, true);
  });
  it("queue list downstream failure maps to MCP failure, not empty success", async () => {
    const { port } = makePort({
      async listQueue() { return { ok: false, code: "internal", message: "Firestore read failed." }; },
    });
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterListQueue({});
    assert.equal(result.status, "failed");
    assert.equal(isNonErrorStatus(result.status), false);
  });
  it("post status and media validation succeed through the runtime", async () => {
    const { port } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const status = await handleAutoposterGetPostStatus({ postId: "post-1" });
    assert.equal(status.status, "succeeded");
    const media = await handleAutoposterValidateMedia({ mediaUrl: "https://cdn.example.com/a.mp4" });
    assert.equal(media.status, "succeeded");
    assert.equal((media.output as { valid: boolean }).valid, true);
  });
  it("an unreachable AutoPoster is a truthful unavailable", async () => {
    const { port } = makePort({
      async listQueue() { return { ok: false, code: "unavailable", message: "AutoPoster is unreachable." }; },
    });
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterListQueue({});
    assert.equal(result.status, "unavailable");
    assert.equal(isNonErrorStatus(result.status), false);
  });
  it("an unconfigured gateway is a truthful unavailable, not a crash or fake success", async () => {
    delete process.env.AUTOPOSTER_BASE_URL;
    delete process.env.AUTOPOSTER_RUNTIME_TOKEN;
    const result = await handleAutoposterListQueue({});
    assert.equal(result.status, "unavailable");
    assert.equal(result.errors[0]!.code, "RUNTIME_NOT_CONFIGURED");
  });
});

describe("P4 — submit-only schedule contract", () => {
  it("MCP submit stops at approval_required; independent control approval writes once; MCP replay is duplicate", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const scheduledAt = futureIso();
    const args = {
      missionId: "mission-stable-1",
      traceId: "trace-stable-1",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: scheduledAt,
      idempotencyKey: "e2e-key-1",
      caption: "Launch",
      requestedBy: "e2e-test",
    };
    const submitted = await handleAutoposterSchedulePost(args);

    assert.equal(submitted.status, "approval_required");
    assert.equal(submitted.missionId, "mission-stable-1");
    assert.equal(submitted.traceId, "trace-stable-1");
    assert.equal(isNonErrorStatus(submitted.status), false);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 0, "submission must not execute downstream");
    assert.deepEqual(submitted.approvalDecision, { required: true, approved: false, approvedBy: null });

    const controlledResult = operator.independentlyApprove(submitted.missionId, "founder").runtimeResult!;
    assert.equal(controlledResult.status, "succeeded");
    assert.equal(operator.calls.independentApprovals, 1);
    assert.equal(operator.calls.downstreamWrites, 1, "independent approval executes exactly once");

    const replay = await handleAutoposterSchedulePost(args);
    assert.equal(replay.status, "duplicate");
    assert.equal(replay.missionId, "mission-stable-1");
    assert.equal(replay.traceId, "trace-stable-1");
    assert.ok(isNonErrorStatus(replay.status));
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 1, "MCP replay must not execute again");
    assert.equal(calls.schedulePost, 0, "MCP never calls the AutoPoster write port");
    assert.deepEqual(replay.approvalDecision, { required: true, approved: true, approvedBy: "founder" });
    assert.equal(replay.policyDecision!.allowed, true);
    assert.equal(replay.idempotency.outcome, "duplicate");
    const output = replay.output as { post: { id: string; approved: boolean }; publishing: string };
    assert.equal(output.post.id, "queue-mission-stable-1");
    assert.equal(output.post.approved, false);
    assert.equal(output.publishing, "blocked_until_human_approval");
    assert.ok(replay.evidence);
    assert.equal(replay.evidence!.status, "completed");
    assert.ok(replay.evidence!.evidence.length >= 1);
    assert.ok(replay.evidence!.eventLogSummary.some(e => e.type === "TASK_APPROVED"));
    assert.ok(replay.startedAt <= replay.completedAt);
    assert.equal(operator.calls.createBodies[0]!.missionId, "mission-stable-1");
    assert.equal(operator.calls.createBodies[0]!.traceId, "trace-stable-1");
    assert.equal(operator.calls.createBodies[0]!.requestedBy, "e2e-test");
  });

  it("passes YouTube provider/title/description through Operator; MCP stays thin", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const result = await handleAutoposterSchedulePost({
      accountId: "UC-chanter",
      provider: "youtube",
      mediaUrl: "https://cdn.example.com/teaser.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-yt-key-1",
      title: "Private launch teaser",
      description: "Supervised test upload",
    });
    assert.equal(result.status, "approval_required");
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(calls.schedulePost, 0);
    const params = operator.calls.createBodies[0]!;
    assert.equal(params.provider, "youtube");
    assert.equal(params.title, "Private launch teaser");
    assert.equal(params.description, "Supervised test upload");
    assert.equal(params.requestedBy, "mcp-client");
  });

  it("a YouTube schedule without a title fails at Operator and never reaches a downstream write", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const result = await handleAutoposterSchedulePost({
      accountId: "UC-chanter",
      provider: "youtube",
      mediaUrl: "https://cdn.example.com/teaser.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-yt-key-2",
    });
    assert.equal(result.status, "validation_failed");
    assert.ok(result.errors.some(e => e.code === "MISSING_YOUTUBE_TITLE"));
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(calls.schedulePost, 0);
  });

  it("exact pre-approval replay stays approval_required; post-control replay is duplicate", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-dup",
    };
    const first = await handleAutoposterSchedulePost(args);
    const preApprovalReplay = await handleAutoposterSchedulePost(args);
    assert.equal(first.status, "approval_required");
    assert.equal(preApprovalReplay.status, "approval_required");
    assert.equal(preApprovalReplay.idempotency.outcome, "duplicate");
    assert.equal(preApprovalReplay.missionId, first.missionId);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 0);

    operator.independentlyApprove(first.missionId);
    const completedReplay = await handleAutoposterSchedulePost(args);
    assert.equal(completedReplay.status, "duplicate");
    assert.ok(isNonErrorStatus(completedReplay.status));
    assert.equal(completedReplay.idempotency.outcome, "duplicate");
    assert.equal(completedReplay.idempotency.originalMissionId, first.missionId);
    assert.equal(completedReplay.missionId, first.missionId);
    assert.equal(operator.calls.downstreamWrites, 1);
    assert.equal(calls.schedulePost, 0);
  });

  it("workspace or trace substitution is a 409 mismatch, never a second write", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const base = {
      missionId: "mission-binding-stable",
      traceId: "trace-binding-stable",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "same-caller-key",
    };

    const first = await handleAutoposterSchedulePost({ ...base, workspaceId: "workspace-a" });
    const second = await handleAutoposterSchedulePost({ ...base, workspaceId: "workspace-b" });
    const traceMismatch = await handleAutoposterSchedulePost({
      ...base,
      workspaceId: "workspace-a",
      traceId: "trace-binding-substituted",
    });

    assert.equal(first.status, "approval_required");
    for (const mismatch of [second, traceMismatch]) {
      assert.equal(mismatch.status, "validation_failed");
      assert.equal(mismatch.errors[0]!.code, "OPERATOR_MISSION_BINDING_MISMATCH");
      assert.equal(mismatch.idempotency.outcome, "mismatch");
      assert.equal(mismatch.output, null);
      assert.equal(mismatch.evidence, null);
    }
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(calls.schedulePost, 0);
  });

  it("forwards blank mission and trace identities to Operator for fail-closed rejection", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const result = await handleAutoposterSchedulePost({
      missionId: "",
      traceId: "",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "blank-identity-key",
    });
    assert.equal(operator.calls.createBodies[0]!.missionId, "");
    assert.equal(operator.calls.createBodies[0]!.traceId, "");
    assert.equal(result.status, "validation_failed");
    assert.equal(result.errors[0]!.code, "OPERATOR_MISSION_IDENTITY_INVALID");
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(calls.schedulePost, 0);
  });

  it("every new MCP submission requires independent approval and never executes downstream", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator();
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const result = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-2",
    });
    assert.equal(result.status, "approval_required");
    assert.equal(isNonErrorStatus(result.status), false);
    assert.equal(operator.calls.downstreamWrites, 0);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(operator.calls.independentApprovals, 0);
    assert.equal(calls.schedulePost, 0);
    assert.equal(result.approvalDecision.required, true);
    assert.equal(result.approvalDecision.approved, false);
  });
});

describe("P4 — end-to-end schedule contract (failure path)", () => {
  it("a downstream write failure stays failed through Operator and MCP with no success language", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator({
      execute: mission => fakeFailureResult(mission, "failed", "AUTOPOSTER_INTERNAL", "Queue write failed."),
    });
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-3",
    };
    const submitted = await handleAutoposterSchedulePost(args);
    assert.equal(submitted.status, "approval_required");
    assert.equal(operator.calls.downstreamWrites, 0);
    operator.independentlyApprove(submitted.missionId);
    const result = await handleAutoposterSchedulePost(args);

    assert.equal(result.status, "failed");
    assert.equal(isNonErrorStatus(result.status), false, "MCP maps runtime failure to failure");
    assert.equal(result.errors[0]!.code, "AUTOPOSTER_INTERNAL");
    assert.equal(result.evidence!.status, "failed");
    assert.equal(result.evidence!.result!.success, false);
    assert.equal(operator.calls.downstreamWrites, 1);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(calls.schedulePost, 0);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('"status":"succeeded"'), false);
    assert.equal(serialized.includes('"success":true'), false);
  });

  it("unauthorized account scope remains a denial", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator({
      execute: mission => fakeFailureResult(
        mission,
        "denied",
        "AUTOPOSTER_FORBIDDEN",
        "Account is not owned by this tenant.",
      ),
    });
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      accountId: "account-x",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-4",
    };
    const submitted = await handleAutoposterSchedulePost(args);
    assert.equal(submitted.status, "approval_required");
    assert.equal(operator.calls.downstreamWrites, 0);
    operator.independentlyApprove(submitted.missionId);
    const result = await handleAutoposterSchedulePost(args);
    assert.equal(result.status, "denied");
    assert.equal(isNonErrorStatus(result.status), false);
    assert.equal(operator.calls.downstreamWrites, 1);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(calls.schedulePost, 0);
  });

  it("preserves safe structured commercial denial facts without turning the denial into success", async () => {
    const details = {
      reasonCode: "monthly_post_limit_reached",
      current: 10,
      limit: 10,
      remaining: 0,
      planId: "starter",
      workspaceId: "workspace-a",
    };
    const { port, calls } = makePort();
    const operator = makeFakeOperator({
      execute: mission => fakeFailureResult(
        mission,
        "denied",
        "AUTOPOSTER_FORBIDDEN",
        "Monthly scheduling limit reached.",
        details,
      ),
    });
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      workspaceId: "workspace-a",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "commercial-denial-1",
    };
    const submitted = await handleAutoposterSchedulePost(args);
    assert.equal(submitted.status, "approval_required");
    assert.equal(operator.calls.downstreamWrites, 0);
    operator.independentlyApprove(submitted.missionId);
    const result = await handleAutoposterSchedulePost(args);

    assert.equal(result.status, "denied");
    assert.equal(isNonErrorStatus(result.status), false);
    assert.equal(result.errors[0]!.code, "AUTOPOSTER_FORBIDDEN");
    assert.deepEqual(result.output, details);
    assert.equal(operator.calls.downstreamWrites, 1);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(calls.schedulePost, 0);
    assert.equal(JSON.stringify(result).includes('"status":"succeeded"'), false);
  });

  it("an exact denial replay remains denied until governed recovery updates durable truth", async () => {
    const details = {
      reasonCode: "monthly_post_limit_reached",
      current: 10,
      limit: 10,
      remaining: 0,
      planId: "starter",
      workspaceId: "workspace-a",
    };
    const { port, calls } = makePort();
    const operator = makeFakeOperator({
      execute: mission => fakeFailureResult(
        mission,
        "denied",
        "AUTOPOSTER_FORBIDDEN",
        "Monthly scheduling limit reached.",
        details,
      ),
    });
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      workspaceId: "workspace-a",
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "commercial-denial-retry",
    };

    const submitted = await handleAutoposterSchedulePost(args);
    assert.equal(submitted.status, "approval_required");
    assert.equal(operator.calls.downstreamWrites, 0);
    operator.independentlyApprove(submitted.missionId);
    const first = await handleAutoposterSchedulePost(args);
    const repeatedDenial = await handleAutoposterSchedulePost(args);
    assert.equal(first.status, "denied");
    assert.equal(repeatedDenial.status, "denied");
    assert.equal(isNonErrorStatus(repeatedDenial.status), false);
    assert.equal(repeatedDenial.errors[0]!.code, "AUTOPOSTER_FORBIDDEN");
    assert.equal(repeatedDenial.idempotency.outcome, "duplicate");
    assert.ok(repeatedDenial.warnings.some(warning => warning.includes("governed reconcile/resume")));
    assert.equal(operator.calls.downstreamWrites, 1, "raw replay must not retry the write");
    assert.equal(operator.calls.approvalHttpRequests, 0);

    const record = operator.recordsById.get(first.missionId)!;
    operator.governedRecover(first.missionId, fakeRuntimeResult(record, {
      output: {
        post: {
          id: "queue-after-quota-reset",
          accountId: record.accountId,
          provider: record.provider,
          status: "scheduled",
          scheduledAt: record.scheduledAt,
          approved: false,
        },
        publishing: "blocked_until_human_approval",
      },
    }));
    const duplicateSuccess = await handleAutoposterSchedulePost(args);

    assert.equal(duplicateSuccess.status, "duplicate");
    assert.equal((duplicateSuccess.output as { post: { id: string } }).post.id, "queue-after-quota-reset");
    assert.equal(operator.calls.downstreamWrites, 2, "only governed recovery performs another write");
    assert.equal(calls.schedulePost, 0);
  });

  it("Operator evidence and errors are redacted before the MCP response", async () => {
    const { port, calls } = makePort();
    const operator = makeFakeOperator({
      execute: mission => fakeFailureResult(
        mission,
        "failed",
        "AUTOPOSTER_INTERNAL",
        `Queue write failed. TOKEN=${SERVICE_TOKEN_CANARY}`,
      ),
    });
    configureAutoPosterGatewayForTesting({ port });
    configureOperatorClientForTestingMcp(operator.wiring);
    const args = {
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-5",
    };
    const submitted = await handleAutoposterSchedulePost(args);
    assert.equal(submitted.status, "approval_required");
    assert.equal(operator.calls.downstreamWrites, 0);
    operator.independentlyApprove(submitted.missionId);
    const result = await handleAutoposterSchedulePost(args);
    assert.equal(result.status, "failed");
    assert.equal(JSON.stringify(result).includes(SERVICE_TOKEN_CANARY), false, "secret canary must be redacted everywhere");
    assert.equal(operator.calls.downstreamWrites, 1);
    assert.equal(operator.calls.approvalHttpRequests, 0);
    assert.equal(calls.schedulePost, 0);
  });
});
describe("P4 — status mapping table", () => {
  it("only succeeded and duplicate are non-error MCP responses", () => {
    const nonError: RuntimeMissionResult["status"][] = ["succeeded", "duplicate"];
    const error: RuntimeMissionResult["status"][] = ["failed", "denied", "validation_failed", "approval_required", "unavailable"];
    for (const status of nonError) assert.ok(isNonErrorStatus(status), status);
    for (const status of error) assert.equal(isNonErrorStatus(status), false, status);
  });
  it("executeAutoPosterMission preserves a caller-supplied traceId end to end", async () => {
    configureAutoPosterGatewayForTesting({ port: makePort().port });
    const result = await executeAutoPosterMission({
      action: "autoposter.queue.list",
      input: {},
      traceId: "trace-e2e-77",
    });
    assert.equal(result.traceId, "trace-e2e-77");
    assert.equal(result.status, "succeeded");
  });
});
