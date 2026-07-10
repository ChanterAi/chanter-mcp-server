// Tests: P4 AutoPoster Runtime Control — the four MCP tools drive the REAL
// chanter-agent-runtime mission executor and AutoPoster mission adapter; only
// the AutoPoster operations port (the HTTP boundary) is faked. This is the
// end-to-end contract proof: MCP request -> runtime mission -> policy +
// approval -> adapter -> mocked queue item creation -> truthful structured
// evidence, plus the failure equivalent.

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AutoPosterOperationsPort, RuntimeMissionResult } from "chanter-agent-runtime";
import {
  configureAutoPosterGatewayForTesting,
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
  scheduleParams: unknown[];
}

function makePort(overrides: Partial<AutoPosterOperationsPort> = {}): { port: AutoPosterOperationsPort; calls: PortCalls } {
  const calls: PortCalls = { listQueue: 0, getPostStatus: 0, validateMedia: 0, schedulePost: 0, scheduleParams: [] };
  const port: AutoPosterOperationsPort = {
    async listQueue(params) {
      calls.listQueue += 1;
      return { ok: true, items: [], count: 0, scope: { accountId: params.accountId ?? "all" } };
    },
    async getPostStatus(params) {
      calls.getPostStatus += 1;
      return {
        ok: true,
        post: {
          id: params.postId, accountId: "account-a", username: "creator_a", status: "scheduled",
          scheduledAt: "2099-07-11T09:00:00.000Z", approved: false, mediaType: "video", captionSummary: "",
          createdAt: null, updatedAt: null, approvedAt: null, approvedBy: "", postedAt: null,
          publishId: "", claimAttempts: 0, lastErrorMessage: "",
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
        post: { id: "queue-item-1", accountId: params.accountId, status: "scheduled", scheduledAt: params.scheduledAt, approved: false },
      };
    },
    ...overrides,
  };
  return { port, calls };
}

function futureIso(minutes = 60): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

beforeEach(() => configureAutoPosterGatewayForTesting(null));
after(() => configureAutoPosterGatewayForTesting(null));

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
  it("schedule tool declares required approval/idempotency fields in its schema", () => {
    const tool = EXPOSED_TOOLS.find(t => t.name === "chanter.autoposter_schedule_post")!;
    const required = tool.parameters.filter(p => p.required).map(p => p.name).sort();
    assert.deepEqual(required, ["accountId", "idempotencyKey", "mediaUrl", "scheduledAtUtc"]);
    assert.ok(tool.parameters.some(p => p.name === "approvedBy"));
    // Provider selection stays optional: TikTok by default, YouTube opt-in.
    assert.ok(tool.parameters.some(p => p.name === "provider" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "title" && !p.required));
    assert.ok(tool.parameters.some(p => p.name === "description" && !p.required));
    assert.equal(PERMISSIONS[tool.name]!.level, "write_runtime_gated");
  });
});

describe("P4 — MCP goes through the Agent Runtime, never AutoPoster directly", () => {
  it("tool handlers contain no direct HTTP/AutoPoster access; only the gateway", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(here, "..", "src", "tools", "autoposterRuntimeTools.ts"), "utf8");
    assert.ok(source.includes('from "../runtime/autoposterGateway.js"'), "handlers must import the runtime gateway");
    assert.equal(/\bfetch\s*\(/.test(source), false, "handlers must not call fetch()");
    assert.equal(source.includes("/api/runtime"), false, "handlers must not know AutoPoster routes");
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

describe("P4 — end-to-end schedule contract (success path)", () => {
  it("MCP schedule -> runtime mission -> approval + policy pass -> adapter -> mocked queue item -> structured evidence", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const scheduledAt = futureIso();
    const result = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: scheduledAt,
      idempotencyKey: "e2e-key-1",
      caption: "Launch",
      approvedBy: "founder",
      requestedBy: "e2e-test",
    });

    assert.equal(result.status, "succeeded");
    assert.ok(isNonErrorStatus(result.status));
    assert.equal(calls.schedulePost, 1, "exactly one queue item creation");
    // Approval decision recorded truthfully.
    assert.deepEqual(result.approvalDecision, { required: true, approved: true, approvedBy: "founder" });
    // Policy decision present and allowing.
    assert.equal(result.policyDecision!.allowed, true);
    // Idempotency outcome recorded.
    assert.deepEqual(result.idempotency, { key: "e2e-key-1", outcome: "first_execution" });
    // Output names the created queue item and the publishing block.
    const output = result.output as { post: { id: string; approved: boolean }; publishing: string };
    assert.equal(output.post.id, "queue-item-1");
    assert.equal(output.post.approved, false);
    assert.equal(output.publishing, "blocked_until_human_approval");
    // Structured evidence: completed task, evidence items, event log.
    assert.ok(result.evidence);
    assert.equal(result.evidence!.status, "completed");
    assert.ok(result.evidence!.evidence.length >= 1);
    assert.ok(result.evidence!.eventLogSummary.some(e => e.type === "TASK_APPROVED"));
    assert.ok(result.startedAt <= result.completedAt);
  });

  it("a YouTube schedule passes provider/title/description through to the port; MCP stays thin", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "UC-chanter",
      provider: "youtube",
      mediaUrl: "https://cdn.example.com/teaser.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-yt-key-1",
      title: "Private launch teaser",
      description: "Supervised test upload",
      approvedBy: "founder",
    });
    assert.equal(result.status, "succeeded");
    assert.equal(calls.schedulePost, 1);
    const params = calls.scheduleParams[0] as Record<string, unknown>;
    assert.equal(params.provider, "youtube");
    assert.equal(params.title, "Private launch teaser");
    assert.equal(params.description, "Supervised test upload");
  });

  it("a YouTube schedule without a title fails in the runtime and never reaches AutoPoster", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "UC-chanter",
      provider: "youtube",
      mediaUrl: "https://cdn.example.com/teaser.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-yt-key-2",
      approvedBy: "founder",
    });
    assert.equal(result.status, "validation_failed");
    assert.ok(result.errors.some(e => e.code === "MISSING_YOUTUBE_TITLE"));
    assert.equal(calls.schedulePost, 0);
  });

  it("duplicate idempotency key returns duplicate and does not execute twice", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const args = {
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-dup",
      approvedBy: "founder",
    };
    const first = await handleAutoposterSchedulePost(args);
    const second = await handleAutoposterSchedulePost(args);
    assert.equal(first.status, "succeeded");
    assert.equal(second.status, "duplicate");
    assert.ok(isNonErrorStatus(second.status), "a duplicate is reported without an error flag but with duplicate status");
    assert.equal(second.idempotency.outcome, "duplicate");
    assert.equal(second.idempotency.originalMissionId, first.missionId);
    assert.equal(calls.schedulePost, 1, "the second mission never executed");
  });

  it("missing approval maps to approval_required and never reaches AutoPoster", async () => {
    const { port, calls } = makePort();
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-2",
    });
    assert.equal(result.status, "approval_required");
    assert.equal(isNonErrorStatus(result.status), false, "MCP must flag this as non-success");
    assert.equal(calls.schedulePost, 0);
    assert.equal(result.approvalDecision.required, true);
    assert.equal(result.approvalDecision.approved, false);
  });
});

describe("P4 — end-to-end schedule contract (failure path)", () => {
  it("AutoPoster scheduling failure stays failed at adapter, runtime, and MCP — no success language", async () => {
    const { port } = makePort({
      async schedulePost() { return { ok: false, code: "internal", message: "Queue write failed." }; },
    });
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-3",
      approvedBy: "founder",
    });

    assert.equal(result.status, "failed");
    assert.equal(isNonErrorStatus(result.status), false, "MCP maps runtime failure to failure");
    assert.equal(result.errors[0]!.code, "AUTOPOSTER_INTERNAL");
    assert.equal(result.evidence!.status, "failed");
    assert.equal(result.evidence!.result!.success, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('"status":"succeeded"'), false);
    assert.equal(serialized.includes('"success":true'), false);
  });

  it("unauthorized account scope from AutoPoster maps to a denial", async () => {
    const { port } = makePort({
      async schedulePost() { return { ok: false, code: "forbidden", message: "Account is not owned by this tenant." }; },
    });
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "account-x",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-4",
      approvedBy: "founder",
    });
    assert.equal(result.status, "denied");
    assert.equal(isNonErrorStatus(result.status), false);
  });

  it("evidence and errors are redacted — no secrets survive into the MCP response", async () => {
    const { port } = makePort({
      async schedulePost() {
        return { ok: false, code: "internal", message: `Queue write failed. TOKEN=${SERVICE_TOKEN_CANARY}` };
      },
    });
    configureAutoPosterGatewayForTesting({ port });
    const result = await handleAutoposterSchedulePost({
      accountId: "account-a",
      mediaUrl: "https://cdn.example.com/launch.mp4",
      scheduledAtUtc: futureIso(),
      idempotencyKey: "e2e-key-5",
      approvedBy: "founder",
    });
    assert.equal(result.status, "failed");
    assert.equal(JSON.stringify(result).includes(SERVICE_TOKEN_CANARY), false, "secret canary must be redacted everywhere");
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
