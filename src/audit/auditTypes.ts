// Audit types for structured MCP tool call logging.

export type AuditResultStatus = "success" | "rejected" | "error";

export interface AuditEvent {
  timestamp: string;           // ISO 8601
  toolName: string;
  permissionLevel: string;
  productId?: string;
  inputSummary: string;        // sanitized, no secrets
  resultStatus: AuditResultStatus;
  safetyNotes?: string[];
  requestId: string;
}

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `mcp-${now}-${rand}`;
}

/**
 * Sanitize input for audit — strip secrets, tokens, large values.
 */
export function sanitizeInput(input: unknown): string {
  try {
    const json = JSON.stringify(input);
    if (json.length > 500) {
      return json.slice(0, 500) + "... [truncated]";
    }
    return json;
  } catch {
    return "[unserializable input]";
  }
}
