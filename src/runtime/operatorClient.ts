/**
 * Thin MCP -> Operator Mission Gateway client for the one production-impacting
 * AutoPoster schedule action. Operator owns durable identity, approval,
 * execution, and replay; this module owns only loopback HTTP transport and
 * caller-facing RuntimeMissionResult mapping.
 */
import {
  redactJsonValue,
  redactText,
  type JsonValue,
  type RuntimeMissionIdempotencyOutcome,
  type RuntimeMissionResult,
  type RuntimeMissionStatus,
} from "chanter-agent-runtime";

const SCHEDULE_ACTION = "autoposter.post.schedule";
const DEFAULT_TIMEOUT_MS = 30_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const OPERATOR_STATUSES = new Set([
  "approval_required",
  "executing",
  "succeeded",
  "duplicate",
  "failed",
  "denied",
  "validation_failed",
  "unavailable",
]);
const RUNTIME_STATUSES = new Set<RuntimeMissionStatus>([
  "succeeded",
  "duplicate",
  "failed",
  "denied",
  "validation_failed",
  "approval_required",
  "unavailable",
]);
const IDEMPOTENCY_OUTCOMES = new Set<RuntimeMissionIdempotencyOutcome>([
  "not_applicable",
  "first_execution",
  "duplicate",
  "mismatch",
]);

export interface OperatorScheduleMissionInput {
  workspaceId?: string;
  accountId: string;
  provider: string;
  mediaUrl: string;
  caption: string;
  hashtags: string;
  title?: string;
  description?: string;
  scheduledAt: string;
  idempotencyKey: string;
  requestedBy: string;
  missionId?: string;
  traceId?: string;
}

export interface OperatorClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export interface OperatorClientWiring {
  config: OperatorClientConfig;
  fetchImpl?: typeof fetch;
}

/**
 * undefined = production environment, null = explicitly disabled, object =
 * controlled wiring. The distinct null state prevents tests from falling back
 * to production environment variables.
 */
let injectedWiring: OperatorClientWiring | null | undefined;

export function configureOperatorClientForTesting(
  wiring: OperatorClientWiring | null | undefined,
): void {
  injectedWiring = wiring;
}

interface ResolvedClient {
  config: OperatorClientConfig;
  fetchImpl: typeof fetch;
}

interface ClientResolutionError {
  code: string;
  message: string;
}

function normalizeLoopbackBaseUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    return null;
  }
  return parsed.origin;
}

function resolveClient(): ResolvedClient | ClientResolutionError {
  if (injectedWiring === null) {
    return {
      code: "OPERATOR_NOT_CONFIGURED",
      message: "Operator Mission Gateway is disabled for this MCP client.",
    };
  }

  const wiring = injectedWiring;
  const baseUrl = wiring?.config.baseUrl ?? process.env.OPERATOR_BASE_URL ?? "";
  const token = wiring?.config.token ?? process.env.OPERATOR_MISSION_SUBMIT_TOKEN ?? "";
  const rawTimeout = wiring?.config.timeoutMs ?? Number(process.env.OPERATOR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  if (!baseUrl.trim() || !token.trim()) {
    return {
      code: "OPERATOR_NOT_CONFIGURED",
      message:
        "Operator Mission Gateway submission is not configured on this MCP server (OPERATOR_BASE_URL and OPERATOR_MISSION_SUBMIT_TOKEN are required).",
    };
  }

  const normalizedBaseUrl = normalizeLoopbackBaseUrl(baseUrl.trim());
  if (!normalizedBaseUrl) {
    return {
      code: "OPERATOR_BASE_URL_NOT_LOOPBACK",
      message: "OPERATOR_BASE_URL must be an HTTP loopback origin with no path, credentials, query, or fragment.",
    };
  }

  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    return {
      code: "OPERATOR_TIMEOUT_INVALID",
      message: "OPERATOR_TIMEOUT_MS must be a positive finite number.",
    };
  }

  const fetchImpl = wiring?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return {
      code: "OPERATOR_FETCH_UNAVAILABLE",
      message: "No fetch implementation is available for the Operator client.",
    };
  }

  return {
    config: {
      baseUrl: normalizedBaseUrl,
      token: token.trim(),
      timeoutMs: rawTimeout,
    },
    fetchImpl,
  };
}

/** Operator mission fields consumed by the MCP mapping boundary. */
export interface OperatorMissionRecord {
  missionId: string;
  traceId: string;
  product: string;
  action: string;
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
  scheduledAt: string;
  idempotencyKey: string;
  approvalRequired: true;
  approvedBy: string | null;
  runtimeResult: RuntimeMissionResult | null;
  execution: Record<string, unknown> | null;
  executionJournal: unknown[];
  evidenceSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  replayed?: boolean;
}

export interface OperatorMissionResponse {
  ok: boolean;
  httpStatus?: number;
  replayed?: boolean;
  status?: RuntimeMissionStatus;
  idempotencyOutcome?: RuntimeMissionIdempotencyOutcome;
  mission?: OperatorMissionRecord;
  errors?: Array<{ code: string; message: string }>;
}

function safeError(code: unknown, message: unknown, fallbackCode: string, fallbackMessage: string) {
  return {
    code: redactText(typeof code === "string" && code ? code : fallbackCode),
    message: redactText(typeof message === "string" && message ? message : fallbackMessage),
  };
}

function httpFailureStatus(httpStatus: number): RuntimeMissionStatus {
  if (httpStatus === 400 || httpStatus === 409 || httpStatus === 422) return "validation_failed";
  if (httpStatus === 401 || httpStatus === 403) return "denied";
  if (httpStatus === 503 || httpStatus === 504) return "unavailable";
  return "failed";
}

async function mapHttpFailure(
  response: Response,
  fallbackCode: string,
  fallbackMessage: string,
): Promise<OperatorMissionResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      httpStatus: response.status,
      status: response.status >= 500 ? "unavailable" : "failed",
      errors: [{
        code: "OPERATOR_RESPONSE_INVALID",
        message: "Operator returned a non-JSON error response.",
      }],
    };
  }

  return {
    ok: false,
    httpStatus: response.status,
    status: httpFailureStatus(response.status),
    idempotencyOutcome: response.status === 409 ? "mismatch" : "not_applicable",
    errors: [safeError(body.code, body.error, fallbackCode, fallbackMessage)],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOperatorMissionRecord(value: unknown): value is OperatorMissionRecord {
  if (!isRecord(value)) return false;
  const candidate = value;
  return (
    typeof candidate.missionId === "string" && Boolean(candidate.missionId) &&
    typeof candidate.traceId === "string" && Boolean(candidate.traceId) &&
    candidate.product === "auto_poster" &&
    candidate.action === SCHEDULE_ACTION &&
    typeof candidate.actorId === "string" && Boolean(candidate.actorId) &&
    typeof candidate.status === "string" && OPERATOR_STATUSES.has(candidate.status) &&
    typeof candidate.workspaceId === "string" && Boolean(candidate.workspaceId) &&
    typeof candidate.accountId === "string" && Boolean(candidate.accountId) &&
    (candidate.provider === "tiktok" || candidate.provider === "youtube") &&
    typeof candidate.mediaUrl === "string" &&
    typeof candidate.caption === "string" &&
    typeof candidate.hashtags === "string" &&
    (candidate.title === null || typeof candidate.title === "string") &&
    (candidate.description === null || typeof candidate.description === "string") &&
    typeof candidate.scheduledAt === "string" &&
    typeof candidate.idempotencyKey === "string" &&
    candidate.approvalRequired === true &&
    (candidate.approvedBy === null || typeof candidate.approvedBy === "string") &&
    (candidate.runtimeResult === null || isRecord(candidate.runtimeResult)) &&
    (candidate.execution === null || isRecord(candidate.execution)) &&
    Array.isArray(candidate.executionJournal) &&
    isRecord(candidate.evidenceSummary) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.replayed === undefined || typeof candidate.replayed === "boolean")
  );
}

function canonicalScheduledAt(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value.trim() : new Date(parsed).toISOString();
}

function validateRuntimeResultBinding(mission: OperatorMissionRecord): string | null {
  const result = mission.runtimeResult;
  if (result === null) return null;
  if (
    result.missionId !== mission.missionId ||
    result.traceId !== mission.traceId ||
    result.product !== "auto_poster" ||
    result.action !== SCHEDULE_ACTION
  ) {
    return "Operator Runtime result identity does not match the durable mission.";
  }
  if (!RUNTIME_STATUSES.has(result.status) || result.status !== mission.status) {
    return "Operator Runtime result status does not match the durable mission.";
  }
  if (!Array.isArray(result.warnings) || !result.warnings.every(item => typeof item === "string")) {
    return "Operator Runtime result warnings are malformed.";
  }
  if (
    !Array.isArray(result.errors) ||
    !result.errors.every(error => isRecord(error) && typeof error.code === "string" && typeof error.message === "string")
  ) {
    return "Operator Runtime result errors are malformed.";
  }
  if (
    !isRecord(result.idempotency) ||
    result.idempotency.key !== mission.idempotencyKey ||
    !IDEMPOTENCY_OUTCOMES.has(result.idempotency.outcome)
  ) {
    return "Operator Runtime result idempotency does not match the durable mission.";
  }
  if (
    result.idempotency.outcome === "duplicate" &&
    (typeof result.idempotency.originalMissionId !== "string" || !result.idempotency.originalMissionId)
  ) {
    return "Operator duplicate Runtime result omitted its original mission identity.";
  }
  if (
    !isRecord(result.approvalDecision) ||
    result.approvalDecision.required !== true ||
    result.approvalDecision.approved !== Boolean(mission.approvedBy) ||
    (result.approvalDecision.approvedBy !== null && typeof result.approvalDecision.approvedBy !== "string") ||
    result.approvalDecision.approvedBy !== mission.approvedBy
  ) {
    return "Operator Runtime result approval does not match the durable mission.";
  }
  if (result.policyDecision !== null && !isRecord(result.policyDecision)) {
    return "Operator Runtime result policy decision is malformed.";
  }
  if (result.evidence !== null && !isRecord(result.evidence)) {
    return "Operator Runtime result evidence is malformed.";
  }
  if (
    typeof result.startedAt !== "string" ||
    typeof result.completedAt !== "string" ||
    typeof result.durationMs !== "number" ||
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 0
  ) {
    return "Operator Runtime result timing is malformed.";
  }
  return null;
}

function validateMissionBinding(
  input: OperatorScheduleMissionInput,
  mission: OperatorMissionRecord,
): string | null {
  if (input.missionId !== undefined && mission.missionId !== input.missionId) {
    return "Operator response missionId does not match the request.";
  }
  if (input.traceId !== undefined && mission.traceId !== input.traceId) {
    return "Operator response traceId does not match the request.";
  }
  if (
    mission.idempotencyKey !== input.idempotencyKey ||
    mission.actorId !== input.requestedBy.trim() ||
    mission.accountId !== input.accountId ||
    mission.provider !== input.provider.trim().toLowerCase() ||
    mission.mediaUrl !== input.mediaUrl.trim() ||
    mission.caption !== input.caption.trim() ||
    mission.hashtags !== input.hashtags.trim() ||
    mission.title !== (input.title?.trim() || null) ||
    mission.description !== (input.description?.trim() || null) ||
    mission.scheduledAt !== canonicalScheduledAt(input.scheduledAt)
  ) {
    return "Operator response scope or payload does not match the request.";
  }
  if (input.workspaceId !== undefined && mission.workspaceId !== input.workspaceId) {
    return "Operator response workspaceId does not match the request.";
  }
  return validateRuntimeResultBinding(mission);
}

function invalidSuccessResponse(message: string, httpStatus: number): OperatorMissionResponse {
  return {
    ok: false,
    httpStatus,
    status: "failed",
    errors: [{ code: "OPERATOR_RESPONSE_INVALID", message }],
  };
}

async function parseMissionSuccess(
  response: Response,
  requireReplayFlag: boolean,
  input: OperatorScheduleMissionInput,
): Promise<OperatorMissionResponse> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidSuccessResponse("Operator returned a non-JSON success response.", response.status);
  }
  if (!isOperatorMissionRecord(body)) {
    return invalidSuccessResponse("Operator returned an invalid mission record.", response.status);
  }
  const bindingError = validateMissionBinding(input, body);
  if (bindingError) {
    return invalidSuccessResponse(bindingError, response.status);
  }
  if (requireReplayFlag && typeof body.replayed !== "boolean") {
    return invalidSuccessResponse("Operator create response omitted the replayed boolean.", response.status);
  }
  if (requireReplayFlag && ((response.status === 200) !== body.replayed)) {
    return invalidSuccessResponse("Operator create status and replayed flag disagree.", response.status);
  }
  if (
    requireReplayFlag &&
    response.status === 201 &&
    (
      body.status !== "approval_required" ||
      body.approvedBy !== null ||
      body.runtimeResult !== null
    )
  ) {
    return invalidSuccessResponse(
      "Operator fresh submission must stop at approval_required with no approval or Runtime result.",
      response.status,
    );
  }
  return {
    ok: true,
    httpStatus: response.status,
    replayed: requireReplayFlag ? body.replayed : false,
    mission: body,
  };
}

/** Submit or exactly replay one schedule request. MCP never approves missions. */
export async function submitScheduleMissionToOperator(
  input: OperatorScheduleMissionInput,
): Promise<OperatorMissionResponse> {
  const client = resolveClient();
  if (!("config" in client)) {
    return {
      ok: false,
      status: "unavailable",
      errors: [{ code: client.code, message: client.message }],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), client.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await client.fetchImpl(
      `${client.config.baseUrl}/api/runtime-missions/autoposter/schedule`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${client.config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          accountId: input.accountId,
          provider: input.provider,
          mediaUrl: input.mediaUrl,
          caption: input.caption,
          hashtags: input.hashtags,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          scheduledAt: input.scheduledAt,
          idempotencyKey: input.idempotencyKey,
          requestedBy: input.requestedBy,
          ...(input.missionId !== undefined ? { missionId: input.missionId } : {}),
          ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
        }),
        signal: controller.signal,
        redirect: "error",
      },
    );

    if (!response.ok) {
      return mapHttpFailure(response, "OPERATOR_ERROR", "Operator rejected the mission request.");
    }
    if (response.status !== 200 && response.status !== 201) {
      return invalidSuccessResponse("Operator create returned an unexpected success status.", response.status);
    }

    return parseMissionSuccess(response, true, input);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: "unavailable",
      errors: [{
        code: "OPERATOR_UNREACHABLE",
        message: timedOut
          ? `Operator timed out after ${client.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`
          : "Operator is unreachable.",
      }],
    };
  } finally {
    clearTimeout(timer);
  }
}

function baseResult(
  input: OperatorScheduleMissionInput,
  action: string,
  status: RuntimeMissionStatus,
  errors: Array<{ code: string; message: string }>,
  options: {
    missionId?: string;
    traceId?: string;
    approvedBy?: string | null;
    idempotencyOutcome?: RuntimeMissionIdempotencyOutcome;
    originalMissionId?: string;
    startedAt?: string;
    completedAt?: string;
  } = {},
): RuntimeMissionResult {
  const now = new Date().toISOString();
  const missionId = options.missionId ?? input.missionId ?? "not-created";
  const outcome = options.idempotencyOutcome ?? "not_applicable";
  return {
    missionId,
    traceId: options.traceId ?? input.traceId ?? input.missionId ?? "not-created",
    product: "auto_poster",
    action,
    status,
    output: null,
    evidence: null,
    warnings: [],
    errors: errors.map((error) => ({
      code: redactText(error.code),
      message: redactText(error.message),
    })),
    policyDecision: null,
    approvalDecision: {
      required: true,
      approved: Boolean(options.approvedBy),
      approvedBy: options.approvedBy ?? null,
    },
    idempotency: {
      key: input.idempotencyKey,
      outcome,
      ...(outcome === "duplicate" && options.originalMissionId
        ? { originalMissionId: options.originalMissionId }
        : {}),
    },
    startedAt: options.startedAt ?? now,
    completedAt: options.completedAt ?? now,
    durationMs: 0,
  };
}

function mapMissionWithoutRuntimeResult(
  input: OperatorScheduleMissionInput,
  response: OperatorMissionResponse,
  action: string,
): RuntimeMissionResult {
  const mission = response.mission!;
  const common = {
    missionId: mission.missionId,
    traceId: mission.traceId,
    approvedBy: mission.approvedBy,
    idempotencyOutcome: response.replayed ? "duplicate" as const : "not_applicable" as const,
    originalMissionId: response.replayed ? mission.missionId : undefined,
    startedAt: mission.createdAt,
    completedAt: mission.updatedAt,
  };

  if (mission.status === "approval_required") {
    return baseResult(input, action, "approval_required", [{
      code: "APPROVAL_REQUIRED",
      message: `Action "${action}" requires explicit Operator approval before execution.`,
    }], common);
  }
  if (mission.status === "executing") {
    return baseResult(input, action, "unavailable", [{
      code: "OPERATOR_MISSION_IN_PROGRESS",
      message: "Operator has durably accepted the mission and execution is still in progress.",
    }], common);
  }
  if (
    mission.status === "failed" ||
    mission.status === "denied" ||
    mission.status === "validation_failed" ||
    mission.status === "unavailable"
  ) {
    return baseResult(input, action, mission.status, [{
      code: `OPERATOR_MISSION_${mission.status.toUpperCase()}`,
      message: `Operator mission is ${mission.status.replaceAll("_", " ")} and has no Runtime result.`,
    }], common);
  }
  return baseResult(input, action, "failed", [{
    code: "OPERATOR_RUNTIME_RESULT_MISSING",
    message: `Operator mission status "${redactText(mission.status)}" has no authoritative Runtime result.`,
  }], common);
}

/** Map Operator authority truth into the existing MCP RuntimeMissionResult contract. */
export function operatorResponseToRuntimeResult(
  input: OperatorScheduleMissionInput,
  response: OperatorMissionResponse,
  action: string,
): RuntimeMissionResult {
  if (!response.ok || !response.mission) {
    return baseResult(
      input,
      action,
      response.status ?? "failed",
      response.errors ?? [{ code: "OPERATOR_ERROR", message: "Unknown Operator error." }],
      { idempotencyOutcome: response.idempotencyOutcome ?? "not_applicable" },
    );
  }

  const mission = response.mission;
  if (!isOperatorMissionRecord(mission)) {
    return baseResult(input, action, "failed", [{
      code: "OPERATOR_RESPONSE_INVALID",
      message: "Operator returned an invalid mission record.",
    }]);
  }
  const bindingError = validateMissionBinding(input, mission);
  if (bindingError) {
    return baseResult(input, action, "failed", [{
      code: "OPERATOR_RESPONSE_INVALID",
      message: bindingError,
    }]);
  }
  if (!mission.runtimeResult) {
    return mapMissionWithoutRuntimeResult(input, response, action);
  }

  const runtimeResult: RuntimeMissionResult = {
    ...mission.runtimeResult,
    output: mission.runtimeResult.output === null
      ? null
      : redactJsonValue(mission.runtimeResult.output),
    evidence: mission.runtimeResult.evidence === null
      ? null
      : redactJsonValue(
          mission.runtimeResult.evidence as unknown as JsonValue,
        ) as unknown as RuntimeMissionResult["evidence"],
    warnings: mission.runtimeResult.warnings.map(redactText),
    errors: mission.runtimeResult.errors.map((error) => ({
      code: redactText(error.code),
      message: redactText(error.message),
    })),
    idempotency: { ...mission.runtimeResult.idempotency },
  };

  if (!response.replayed) return runtimeResult;

  const successfulReplay = runtimeResult.status === "succeeded" || runtimeResult.status === "duplicate";
  return {
    ...runtimeResult,
    status: successfulReplay ? "duplicate" : runtimeResult.status,
    warnings: successfulReplay
      ? runtimeResult.warnings
      : [
          ...runtimeResult.warnings,
          "Operator replayed the authoritative non-success result; recovery requires an explicit governed reconcile/resume action.",
        ],
    idempotency: {
      key: mission.idempotencyKey,
      outcome: "duplicate",
      originalMissionId: mission.missionId,
    },
  };
}
