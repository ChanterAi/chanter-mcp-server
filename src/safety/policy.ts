// Central safety policy – evaluates tool calls against all safety gates.
// P2: write_proposed tools are allowed (proposals don't execute).

import { detectForbiddenAction } from "./forbiddenActions.js";
import { PERMISSIONS } from "../registry/permissions.js";
import type { PermissionLevel } from "../registry/permissions.js";

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  notes: string[];
}

export function checkSafetyPolicy(
  toolName: string,
  input: unknown
): SafetyCheckResult {
  const notes: string[] = [];
  const inputStr = typeof input === "string" ? input : JSON.stringify(input ?? {});

  // 1. Check if the tool is registered
  const perm = PERMISSIONS[toolName];
  if (!perm) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is not registered in the permission system.`,
      notes: ["unregistered tool blocked"],
    };
  }

  // 2. Check permission level
  // In P2: write_proposed is allowed, write_approved/dangerous_forbidden are blocked
  if (perm.level === "write_approved" || perm.level === "dangerous_forbidden") {
    return {
      allowed: false,
      reason: `Tool "${toolName}" has forbidden permission level: ${perm.level}. Only read_public, read_internal, and write_proposed are allowed in P2.`,
      notes: ["forbidden permission level"],
    };
  }

  // 3. Check for forbidden action patterns (applies to all tools including write_proposed)
  const forbidden = detectForbiddenAction(toolName, inputStr);
  if (forbidden) {
    return {
      allowed: false,
      reason: `Forbidden action detected: ${forbidden.description}`,
      notes: [`category: ${forbidden.category}`, `pattern: ${forbidden.pattern.source}`],
    };
  }

  // 4. Policy check passed
  if (perm.level === "write_proposed") {
    notes.push("P2 proposal layer: allowed (dry-run only, no execution)");
  } else {
    notes.push("read-only checkpoint: allowed");
  }
  notes.push(`permission level: ${perm.level}`);

  return { allowed: true, notes };
}

export function rejectionResponse(
  toolName: string,
  reason: string,
  notes: string[]
): string {
  return JSON.stringify(
    {
      blocked: true,
      tool: toolName,
      reason,
      policy: "CHANTER MCP Server Checkpoint P2 – Dry-Run Proposal & Approval Foundation",
      suggestion:
        "Write actions beyond dry-run proposals are not available in this checkpoint. Execution will be added in future checkpoints with full safety gates.",
      safetyNotes: notes,
    },
    null,
    2
  );
}
