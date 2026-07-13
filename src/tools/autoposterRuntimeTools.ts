// chanter.autoposter_* — the four AutoPoster runtime control tools.
//
// Each handler does exactly three things: strict argument validation,
// mission construction, and a call into the Agent Runtime gateway. All
// policy/approval/idempotency/redaction/evidence behavior lives in
// chanter-agent-runtime; all queue/media/ownership/scheduling behavior
// lives in AutoPoster. Handlers never fabricate success — the runtime's
// truthful mission status is returned verbatim.

import type { JsonValue, RuntimeMissionResult } from "chanter-agent-runtime";
import { executeAutoPosterMission } from "../runtime/autoposterGateway.js";

export const AUTOPOSTER_TOOL_ACTIONS = {
  "chanter.autoposter_list_queue": "autoposter.queue.list",
  "chanter.autoposter_get_post_status": "autoposter.post.get_status",
  "chanter.autoposter_validate_media": "autoposter.media.validate",
  "chanter.autoposter_schedule_post": "autoposter.post.schedule",
} as const;

interface FieldSpec {
  type: "string" | "number";
  required: boolean;
}

/** Strict schema check: required fields present, types correct, unknown fields rejected. */
function validateArgs(
  args: Record<string, unknown>,
  fields: Record<string, FieldSpec>
): { ok: true; values: Record<string, JsonValue> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const values: Record<string, JsonValue> = {};
  for (const key of Object.keys(args)) {
    if (!(key in fields)) errors.push(`Unknown field "${key}".`);
  }
  for (const [key, spec] of Object.entries(fields)) {
    const value = args[key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      if (spec.required) errors.push(`"${key}" is required.`);
      continue;
    }
    if (typeof value !== spec.type) {
      errors.push(`"${key}" must be a ${spec.type}.`);
      continue;
    }
    values[key] = value as JsonValue;
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, values };
}

/** Local, truthful validation_failed result — nothing was executed. */
function schemaRejection(action: string, errors: string[]): RuntimeMissionResult {
  const now = new Date().toISOString();
  return {
    missionId: "not-created",
    traceId: "not-created",
    product: "auto_poster",
    action,
    status: "validation_failed",
    output: null,
    evidence: null,
    warnings: [],
    errors: errors.map((message) => ({ code: "SCHEMA_VALIDATION_FAILED", message })),
    policyDecision: null,
    approvalDecision: { required: false, approved: false, approvedBy: null },
    idempotency: { key: null, outcome: "not_applicable" },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
  };
}

export async function handleAutoposterListQueue(args: Record<string, unknown>): Promise<RuntimeMissionResult> {
  const action = AUTOPOSTER_TOOL_ACTIONS["chanter.autoposter_list_queue"];
  const check = validateArgs(args, {
    workspaceId: { type: "string", required: false },
    accountId: { type: "string", required: false },
    limit: { type: "number", required: false },
    requestedBy: { type: "string", required: false },
  });
  if (!check.ok) return schemaRejection(action, check.errors);
  const { workspaceId, accountId, limit, requestedBy } = check.values;
  return executeAutoPosterMission({
    action,
    input: {
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(accountId !== undefined ? { accountId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    },
    ...(typeof workspaceId === "string" ? { workspaceId } : {}),
    ...(typeof requestedBy === "string" ? { requestedBy } : {}),
    ...(typeof accountId === "string" ? { accountId } : {}),
  });
}

export async function handleAutoposterGetPostStatus(args: Record<string, unknown>): Promise<RuntimeMissionResult> {
  const action = AUTOPOSTER_TOOL_ACTIONS["chanter.autoposter_get_post_status"];
  const check = validateArgs(args, {
    postId: { type: "string", required: true },
    workspaceId: { type: "string", required: false },
    accountId: { type: "string", required: false },
    requestedBy: { type: "string", required: false },
  });
  if (!check.ok) return schemaRejection(action, check.errors);
  const { postId, workspaceId, accountId, requestedBy } = check.values;
  return executeAutoPosterMission({
    action,
    input: {
      postId: postId!,
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(accountId !== undefined ? { accountId } : {}),
    },
    ...(typeof workspaceId === "string" ? { workspaceId } : {}),
    ...(typeof requestedBy === "string" ? { requestedBy } : {}),
    ...(typeof accountId === "string" ? { accountId } : {}),
  });
}

export async function handleAutoposterValidateMedia(args: Record<string, unknown>): Promise<RuntimeMissionResult> {
  const action = AUTOPOSTER_TOOL_ACTIONS["chanter.autoposter_validate_media"];
  const check = validateArgs(args, {
    fileName: { type: "string", required: false },
    mimeType: { type: "string", required: false },
    mediaUrl: { type: "string", required: false },
    requestedBy: { type: "string", required: false },
  });
  if (!check.ok) return schemaRejection(action, check.errors);
  const { fileName, mimeType, mediaUrl, requestedBy } = check.values;
  if (fileName === undefined && mimeType === undefined && mediaUrl === undefined) {
    return schemaRejection(action, ['Provide "mediaUrl", or "fileName"/"mimeType", to validate media.']);
  }
  return executeAutoPosterMission({
    action,
    input: {
      ...(fileName !== undefined ? { fileName } : {}),
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(mediaUrl !== undefined ? { mediaUrl } : {}),
    },
    ...(typeof requestedBy === "string" ? { requestedBy } : {}),
  });
}

export async function handleAutoposterSchedulePost(args: Record<string, unknown>): Promise<RuntimeMissionResult> {
  const action = AUTOPOSTER_TOOL_ACTIONS["chanter.autoposter_schedule_post"];
  const check = validateArgs(args, {
    workspaceId: { type: "string", required: false },
    accountId: { type: "string", required: true },
    // Optional publishing provider ("tiktok" | "youtube"; omitted = TikTok).
    // MCP stays thin: the value is passed through verbatim — the Agent
    // Runtime and AutoPoster own provider validation and publishing policy.
    provider: { type: "string", required: false },
    mediaUrl: { type: "string", required: true },
    scheduledAtUtc: { type: "string", required: true },
    idempotencyKey: { type: "string", required: true },
    caption: { type: "string", required: false },
    hashtags: { type: "string", required: false },
    // YouTube-only metadata (title is required downstream for YouTube).
    title: { type: "string", required: false },
    description: { type: "string", required: false },
    approvedBy: { type: "string", required: false },
    approvalNote: { type: "string", required: false },
    requestedBy: { type: "string", required: false },
  });
  if (!check.ok) return schemaRejection(action, check.errors);
  const { workspaceId, accountId, provider, mediaUrl, scheduledAtUtc, idempotencyKey, caption, hashtags, title, description, approvedBy, approvalNote, requestedBy } =
    check.values;

  // Approval context is passed through; the Agent Runtime decides whether it
  // satisfies the gate. No approvedBy -> the runtime returns approval_required.
  const approvedByName = typeof approvedBy === "string" ? approvedBy.trim() : "";
  return executeAutoPosterMission({
    action,
    input: {
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      accountId: accountId!,
      ...(provider !== undefined ? { provider } : {}),
      mediaUrl: mediaUrl!,
      scheduledAt: scheduledAtUtc!,
      ...(caption !== undefined ? { caption } : {}),
      ...(hashtags !== undefined ? { hashtags } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    },
    ...(typeof workspaceId === "string" ? { workspaceId } : {}),
    accountId: accountId as string,
    idempotencyKey: idempotencyKey as string,
    ...(approvedByName
      ? {
          approval: {
            approved: true,
            approvedBy: approvedByName,
            ...(typeof approvalNote === "string" ? { note: approvalNote } : {}),
          },
        }
      : {}),
    ...(typeof requestedBy === "string" ? { requestedBy } : {}),
  });
}
