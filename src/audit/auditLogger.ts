// Audit logger – writes structured JSONL audit events.
// Stores in .mcp-audit/audit.jsonl within the MCP server package.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AuditEvent, AuditResultStatus } from "./auditTypes.js";
import { generateRequestId, sanitizeInput } from "./auditTypes.js";
import { redactSensitiveValues } from "../safety/redaction.js";

const AUDIT_DIR = resolve(
  process.env.CHANTER_MCP_AUDIT_DIR?.trim()
    || join(import.meta.dirname!, "..", "..", ".mcp-audit"),
);

function ensureAuditDir(): void {
  if (!existsSync(AUDIT_DIR)) {
    mkdirSync(AUDIT_DIR, { recursive: true });
  }
}

async function getAuditFilePath(): Promise<string> {
  return join(AUDIT_DIR, "audit.jsonl");
}

export interface LogCallParams {
  toolName: string;
  permissionLevel: string;
  productId?: string;
  input: unknown;
  resultStatus: AuditResultStatus;
  safetyNotes?: string[];
}

/**
 * Log a tool call to the audit file.
 * Redacts sensitive values before writing.
 */
export async function logCall(params: LogCallParams): Promise<string> {
  ensureAuditDir();

  const requestId = generateRequestId();
  const safeInput = redactSensitiveValues(sanitizeInput(params.input));

  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    toolName: params.toolName,
    permissionLevel: params.permissionLevel,
    productId: params.productId,
    inputSummary: safeInput,
    resultStatus: params.resultStatus,
    safetyNotes: params.safetyNotes ?? [],
    requestId,
  };

  const filePath = await getAuditFilePath();
  appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");

  return requestId;
}
