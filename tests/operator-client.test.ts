import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { RuntimeMissionResult } from "chanter-agent-runtime";
import {
  configureOperatorClientForTesting,
  operatorResponseToRuntimeResult,
  submitScheduleMissionToOperator,
  type OperatorMissionRecord,
  type OperatorScheduleMissionInput,
} from "../src/runtime/operatorClient.js";

const ACTION = "autoposter.post.schedule";
const ORIGINAL_ENV = {
  baseUrl: process.env.OPERATOR_BASE_URL,
  token: process.env.OPERATOR_MISSION_SUBMIT_TOKEN,
  timeout: process.env.OPERATOR_TIMEOUT_MS,
};

const INPUT: OperatorScheduleMissionInput = {
  workspaceId: "workspace-a",
  accountId: "account-a",
  provider: "tiktok",
  mediaUrl: "https://cdn.example.com/launch.mp4",
  caption: "Launch",
  hashtags: "#launch",
  scheduledAt: "2099-07-15T10:00:00.000Z",
  idempotencyKey: "operator-client-key-1",
  requestedBy: "mcp-client",
  missionId: "mission-stable-1",
  traceId: "trace-stable-1",
};

function restoreEnv(name: keyof typeof ORIGINAL_ENV, envName: string): void {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

afterEach(() => {
  configureOperatorClientForTesting(undefined);
  restoreEnv("baseUrl", "OPERATOR_BASE_URL");
  restoreEnv("token", "OPERATOR_MISSION_SUBMIT_TOKEN");
  restoreEnv("timeout", "OPERATOR_TIMEOUT_MS");
});

function runtimeResult(overrides: Partial<RuntimeMissionResult> = {}): RuntimeMissionResult {
  return {
    missionId: INPUT.missionId!,
    traceId: INPUT.traceId!,
    product: "auto_poster",
    action: ACTION,
    status: "succeeded",
    output: {
      post: { id: "draft-1", approved: false },
      publishing: "blocked_until_human_approval",
    },
    evidence: null,
    warnings: [],
    errors: [],
    policyDecision: {
      allowed: true,
      approvalRequired: false,
      blocked: false,
      reasons: ["Allowed."],
    },
    approvalDecision: { required: true, approved: true, approvedBy: "founder" },
    idempotency: { key: INPUT.idempotencyKey, outcome: "first_execution" },
    startedAt: "2099-07-15T09:00:00.000Z",
    completedAt: "2099-07-15T09:00:01.000Z",
    durationMs: 1_000,
    ...overrides,
  };
}

function mission(overrides: Partial<OperatorMissionRecord> = {}): OperatorMissionRecord {
  return {
    missionId: INPUT.missionId!,
    traceId: INPUT.traceId!,
    product: "auto_poster",
    action: ACTION,
    actorId: INPUT.requestedBy,
    status: "approval_required",
    workspaceId: INPUT.workspaceId!,
    accountId: INPUT.accountId,
    provider: INPUT.provider,
    mediaUrl: INPUT.mediaUrl,
    caption: INPUT.caption,
    hashtags: INPUT.hashtags,
    title: null,
    description: null,
    graphId: INPUT.providerProofMode ? "graph-proof" : null,
    providerProofMode: INPUT.providerProofMode === true,
    approvedMedia: INPUT.approvedMedia ?? null,
    scheduledAt: INPUT.scheduledAt,
    idempotencyKey: INPUT.idempotencyKey,
    approvalRequired: true,
    approvedBy: null,
    runtimeResult: null,
    execution: null,
    executionJournal: [],
    evidenceSummary: {},
    createdAt: "2099-07-15T09:00:00.000Z",
    updatedAt: "2099-07-15T09:00:00.000Z",
    replayed: false,
    ...overrides,
  };
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withLoopbackServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("Operator Mission Gateway client", () => {
  it("uses a true disabled test state instead of falling back to production env", async () => {
    process.env.OPERATOR_BASE_URL = "http://127.0.0.1:3001";
    process.env.OPERATOR_MISSION_SUBMIT_TOKEN = "must-not-be-used";
    configureOperatorClientForTesting(null);

    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      await submitScheduleMissionToOperator(INPUT),
      ACTION,
    );
    assert.equal(mapped.status, "unavailable");
    assert.equal(mapped.errors[0]?.code, "OPERATOR_NOT_CONFIGURED");
  });

  it("rejects non-loopback Operator URLs before fetch", async () => {
    let fetchCalls = 0;
    configureOperatorClientForTesting({
      config: { baseUrl: "https://operator.example.com", token: "test-token" },
      fetchImpl: (async () => {
        fetchCalls += 1;
        throw new Error("must not fetch");
      }) as typeof fetch,
    });

    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      await submitScheduleMissionToOperator(INPUT),
      ACTION,
    );
    assert.equal(mapped.status, "unavailable");
    assert.equal(mapped.errors[0]?.code, "OPERATOR_BASE_URL_NOT_LOOPBACK");
    assert.equal(fetchCalls, 0);
  });

  it("forwards stable identity, scope, actor, and capability header", async () => {
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    let capturedBody: Record<string, unknown> = {};
    configureOperatorClientForTesting({
      config: { baseUrl: "http://127.0.0.1:3001/", token: "test-capability" },
      fetchImpl: (async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = new Headers(init?.headers);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return response(mission({ replayed: false }), 201);
      }) as typeof fetch,
    });

    const submitted = await submitScheduleMissionToOperator(INPUT);
    const mapped = operatorResponseToRuntimeResult(INPUT, submitted, ACTION);
    assert.equal(capturedUrl, "http://127.0.0.1:3001/api/runtime-missions/autoposter/schedule");
    assert.equal(capturedHeaders.get("authorization"), "Bearer test-capability");
    assert.deepEqual(capturedBody, {
      workspaceId: INPUT.workspaceId,
      accountId: INPUT.accountId,
      provider: INPUT.provider,
      mediaUrl: INPUT.mediaUrl,
      caption: INPUT.caption,
      hashtags: INPUT.hashtags,
      scheduledAt: INPUT.scheduledAt,
      idempotencyKey: INPUT.idempotencyKey,
      requestedBy: INPUT.requestedBy,
      missionId: INPUT.missionId,
      traceId: INPUT.traceId,
    });
    assert.equal(mapped.status, "approval_required");
    assert.equal(mapped.missionId, INPUT.missionId);
    assert.equal(mapped.traceId, INPUT.traceId);
  });

  it("forwards supplied blank identity fields so Operator rejects instead of generating identities", async () => {
    let capturedBody: Record<string, unknown> = {};
    configureOperatorClientForTesting({
      config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
      fetchImpl: (async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return response({
          code: "OPERATOR_MISSION_IDENTITY_INVALID",
          error: "missionId and traceId must be exact nonblank identifiers.",
        }, 400);
      }) as typeof fetch,
    });

    const blankIdentityInput = { ...INPUT, missionId: "", traceId: "" };
    const mapped = operatorResponseToRuntimeResult(
      blankIdentityInput,
      await submitScheduleMissionToOperator(blankIdentityInput),
      ACTION,
    );
    assert.equal(Object.hasOwn(capturedBody, "missionId"), true);
    assert.equal(Object.hasOwn(capturedBody, "traceId"), true);
    assert.equal(capturedBody.missionId, "");
    assert.equal(capturedBody.traceId, "");
    assert.equal(mapped.status, "validation_failed");
    assert.equal(mapped.errors[0]?.code, "OPERATOR_MISSION_IDENTITY_INVALID");
  });

  it("submits only and cannot turn an extra caller approval property into an approval request", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    configureOperatorClientForTesting({
      config: { baseUrl: "http://localhost:3001", token: "test-capability" },
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return response(mission({ replayed: false }), 201);
      }) as typeof fetch,
    });

    const attemptedSelfApproval = {
      ...INPUT,
      approvedBy: "founder",
    } as OperatorScheduleMissionInput;
    const mapped = operatorResponseToRuntimeResult(
      attemptedSelfApproval,
      await submitScheduleMissionToOperator(attemptedSelfApproval),
      ACTION,
    );
    assert.equal(mapped.status, "approval_required");
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/api\/runtime-missions\/autoposter\/schedule$/);
    assert.equal(Object.hasOwn(calls[0]!.body as object, "approvedBy"), false);
  });

  it("maps an exact successful 200 replay to duplicate without mutating stored truth", () => {
    const stored = runtimeResult();
    const record = mission({ status: "succeeded", approvedBy: "founder", runtimeResult: stored, replayed: true });
    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      { ok: true, httpStatus: 200, replayed: true, mission: record },
      ACTION,
    );
    assert.equal(mapped.status, "duplicate");
    assert.deepEqual(mapped.idempotency, {
      key: INPUT.idempotencyKey,
      outcome: "duplicate",
      originalMissionId: INPUT.missionId,
    });
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.idempotency.outcome, "first_execution");
  });

  it("replays a denial without raw-create re-execution or false duplicate success", () => {
    const denied = runtimeResult({
      status: "denied",
      output: { reasonCode: "monthly_post_limit_reached" },
      errors: [{ code: "AUTOPOSTER_FORBIDDEN", message: "Monthly scheduling limit reached." }],
    });
    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      {
        ok: true,
        httpStatus: 200,
        replayed: true,
        mission: mission({ status: "denied", approvedBy: "founder", runtimeResult: denied, replayed: true }),
      },
      ACTION,
    );
    assert.equal(mapped.status, "denied");
    assert.equal(mapped.idempotency.outcome, "duplicate");
    assert.match(mapped.warnings.join(" "), /governed reconcile\/resume/);
  });

  it("maps 400, 409, 401, and 503 without leaking prior result data", async () => {
    const cases = [
      { http: 400, expected: "validation_failed", code: "INPUT_INVALID", outcome: "not_applicable" },
      { http: 409, expected: "validation_failed", code: "OPERATOR_MISSION_BINDING_MISMATCH", outcome: "mismatch" },
      { http: 401, expected: "denied", code: "CAPABILITY_TOKEN_INVALID", outcome: "not_applicable" },
      { http: 503, expected: "unavailable", code: "CAPABILITY_TOKEN_NOT_CONFIGURED", outcome: "not_applicable" },
    ] as const;

    for (const entry of cases) {
      configureOperatorClientForTesting({
        config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
        fetchImpl: (async () => response({ code: entry.code, error: "Rejected." }, entry.http)) as typeof fetch,
      });
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        await submitScheduleMissionToOperator(INPUT),
        ACTION,
      );
      assert.equal(mapped.status, entry.expected, String(entry.http));
      assert.equal(mapped.errors[0]?.code, entry.code, String(entry.http));
      assert.equal(mapped.idempotency.outcome, entry.outcome, String(entry.http));
      assert.equal(mapped.output, null, String(entry.http));
      assert.equal(mapped.evidence, null, String(entry.http));
    }
  });

  it("redacts Operator error text before it reaches MCP", async () => {
    const canary = "sk-canaryFAKEoperatorToken1234567890";
    configureOperatorClientForTesting({
      config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
      fetchImpl: (async () => response({ code: "OPERATOR_ERROR", error: `failed TOKEN=${canary}` }, 500)) as typeof fetch,
    });
    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      await submitScheduleMissionToOperator(INPUT),
      ACTION,
    );
    assert.equal(JSON.stringify(mapped).includes(canary), false);
    assert.match(mapped.errors[0]!.message, /\[REDACTED\]/);
  });

  it("fails closed when Operator outer identity, scope, actor, or payload differs from the request", () => {
    const cases: Array<[keyof OperatorMissionRecord, unknown]> = [
      ["missionId", "mission-substituted"],
      ["traceId", "trace-substituted"],
      ["idempotencyKey", "key-substituted"],
      ["workspaceId", "workspace-substituted"],
      ["actorId", "actor-substituted"],
      ["accountId", "account-substituted"],
      ["provider", "youtube"],
      ["mediaUrl", "https://cdn.example.com/substituted.mp4"],
      ["caption", "Substituted caption"],
      ["scheduledAt", "2099-07-16T10:00:00.000Z"],
    ];

    for (const [field, value] of cases) {
      const forged = mission({
        status: "succeeded",
        approvedBy: "founder",
        runtimeResult: runtimeResult(),
      }) as unknown as Record<string, unknown>;
      forged[field] = value;
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        { ok: true, replayed: false, mission: forged as unknown as OperatorMissionRecord },
        ACTION,
      );
      assert.equal(mapped.status, "failed", field);
      assert.equal(mapped.errors[0]?.code, "OPERATOR_RESPONSE_INVALID", field);
      assert.equal(mapped.output, null, field);
      assert.equal(mapped.evidence, null, field);
    }
  });

  it("fails closed on nested Runtime identity, idempotency, status, or array-shape substitution", () => {
    const cases: Array<[string, (result: Record<string, unknown>) => void]> = [
      ["missionId", result => { result.missionId = "runtime-mission-substituted"; }],
      ["traceId", result => { result.traceId = "runtime-trace-substituted"; }],
      ["product", result => { result.product = "other_product"; }],
      ["action", result => { result.action = "autoposter.other"; }],
      ["status", result => { result.status = "denied"; }],
      ["idempotency", result => {
        result.idempotency = { key: "wrong-key", outcome: "first_execution" };
      }],
      ["approval", result => {
        result.approvalDecision = { required: false, approved: false, approvedBy: "founder" };
      }],
      ["warnings", result => { result.warnings = "not-an-array"; }],
      ["errors", result => { result.errors = [{ code: 5, message: "malformed" }]; }],
    ];

    for (const [label, mutate] of cases) {
      const nested = runtimeResult() as unknown as Record<string, unknown>;
      mutate(nested);
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        {
          ok: true,
          replayed: false,
          mission: mission({
            status: "succeeded",
            approvedBy: "founder",
            runtimeResult: nested as unknown as RuntimeMissionResult,
          }),
        },
        ACTION,
      );
      assert.equal(mapped.status, "failed", label);
      assert.equal(mapped.errors[0]?.code, "OPERATOR_RESPONSE_INVALID", label);
      assert.equal(mapped.output, null, label);
      assert.equal(mapped.evidence, null, label);
    }
  });

  it("rejects a mismatched create response after exactly one submission", async () => {
    let fetchCalls = 0;
    configureOperatorClientForTesting({
      config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
      fetchImpl: (async () => {
        fetchCalls += 1;
        return response(mission({ accountId: "account-substituted", replayed: false }), 201);
      }) as typeof fetch,
    });
    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      await submitScheduleMissionToOperator(INPUT),
      ACTION,
    );
    assert.equal(mapped.status, "failed");
    assert.equal(mapped.errors[0]?.code, "OPERATOR_RESPONSE_INVALID");
    assert.equal(fetchCalls, 1, "invalid create must not trigger any second request");
  });

  it("fails closed if a fresh submission claims approval or a Runtime result", async () => {
    const invalidFreshMissions = [
      mission({ approvedBy: "founder", replayed: false }),
      mission({
        status: "succeeded",
        approvedBy: "founder",
        runtimeResult: runtimeResult(),
        execution: { status: "succeeded" },
        replayed: false,
      }),
    ];

    for (const invalidMission of invalidFreshMissions) {
      let fetchCalls = 0;
      configureOperatorClientForTesting({
        config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
        fetchImpl: (async () => {
          fetchCalls += 1;
          return response(invalidMission, 201);
        }) as typeof fetch,
      });
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        await submitScheduleMissionToOperator(INPUT),
        ACTION,
      );
      assert.equal(mapped.status, "failed");
      assert.equal(mapped.errors[0]?.code, "OPERATOR_RESPONSE_INVALID");
      assert.equal(mapped.output, null);
      assert.equal(mapped.evidence, null);
      assert.equal(fetchCalls, 1);
    }
  });

  it("rejects a create redirect without following the second request", async () => {
    let createCalls = 0;
    let followedCalls = 0;
    await withLoopbackServer((request, serverResponse) => {
      if (request.url === "/api/runtime-missions/autoposter/schedule") {
        createCalls += 1;
        serverResponse.writeHead(302, { location: "/followed" });
        serverResponse.end();
        return;
      }
      followedCalls += 1;
      serverResponse.writeHead(500).end();
    }, async baseUrl => {
      configureOperatorClientForTesting({
        config: { baseUrl, token: "test-capability" },
      });
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        await submitScheduleMissionToOperator(INPUT),
        ACTION,
      );
      assert.equal(mapped.status, "unavailable");
      assert.equal(mapped.errors[0]?.code, "OPERATOR_UNREACHABLE");
    });
    assert.equal(createCalls, 1);
    assert.equal(followedCalls, 0);
  });

  it("maps unreachable Operator transport to unavailable", async () => {
    configureOperatorClientForTesting({
      config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
      fetchImpl: (async () => { throw new Error("ECONNREFUSED secret detail"); }) as typeof fetch,
    });
    const mapped = operatorResponseToRuntimeResult(
      INPUT,
      await submitScheduleMissionToOperator(INPUT),
      ACTION,
    );
    assert.equal(mapped.status, "unavailable");
    assert.equal(mapped.errors[0]?.code, "OPERATOR_UNREACHABLE");
    assert.equal(JSON.stringify(mapped).includes("ECONNREFUSED"), false);
  });

  it("ADV-02 contains raw, URL-encoded, and base64 provider locators in MCP failures", async () => {
    const locator = "https://provider.invalid/upload/resumable/session-canary";
    for (const escaped of [locator, encodeURIComponent(locator), Buffer.from(locator).toString("base64")]) {
      configureOperatorClientForTesting({
        config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
        fetchImpl: (async () => new Response(JSON.stringify({ code: "OPERATOR_ERROR", error: escaped }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })) as typeof fetch,
      });
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        await submitScheduleMissionToOperator(INPUT),
        ACTION,
      );
      const serialized = JSON.stringify(mapped);
      assert.equal(serialized.includes("session-canary"), false);
      assert.equal(serialized.includes(escaped), false);
      assert.equal(mapped.errors[0]?.message, "[REDACTED_PROVIDER_LOCATOR]");
    }
  });

  it("does not relabel non-Runtime failed, denied, or executing mission states as approval_required", () => {
    for (const [operatorStatus, expected] of [
      ["failed", "failed"],
      ["denied", "denied"],
      ["executing", "unavailable"],
    ] as const) {
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        { ok: true, replayed: false, mission: mission({ status: operatorStatus }) },
        ACTION,
      );
      assert.equal(mapped.status, expected, operatorStatus);
      assert.notEqual(mapped.status, "approval_required", operatorStatus);
    }
  });

  it("fails closed on malformed success and replay contracts", async () => {
    for (const [status, body] of [
      [201, { replayed: false }],
      [200, mission({ replayed: false })],
    ] as const) {
      configureOperatorClientForTesting({
        config: { baseUrl: "http://127.0.0.1:3001", token: "test-capability" },
        fetchImpl: (async () => response(body, status)) as typeof fetch,
      });
      const mapped = operatorResponseToRuntimeResult(
        INPUT,
        await submitScheduleMissionToOperator(INPUT),
        ACTION,
      );
      assert.equal(mapped.status, "failed");
      assert.equal(mapped.errors[0]?.code, "OPERATOR_RESPONSE_INVALID");
    }
  });
});
