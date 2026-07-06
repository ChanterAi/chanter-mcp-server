// Risk classifier for dry-run proposals.
// Classifies risk based on product, actionType, objective, and scope.

import type { AllowedActionType } from "./proposalTypes.js";
import type { RiskLevel } from "../registry/products.js";
import { CHANTER_PRODUCTS } from "../registry/products.js";

const FORBIDDEN_VERBS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\bdeploy\b/i, category: "deployment" },
  { pattern: /\bpost\s+now\b/i, category: "live_posting" },
  { pattern: /\bpublish\b/i, category: "publishing" },
  { pattern: /\bdelete\b/i, category: "destructive" },
  { pattern: /\bcommit\b/i, category: "vcs" },
  { pattern: /\bpush\b/i, category: "vcs" },
  { pattern: /\btoken\b/i, category: "secret_access" },
  { pattern: /\bsecret\b/i, category: "secret_access" },
  { pattern: /\bproduction\b/i, category: "production_change" },
  { pattern: /\boa?uth\b/i, category: "auth_change" },
  { pattern: /\blive\b/i, category: "live_operation" },
];

export interface RiskClassification {
  riskLevel: "low" | "medium" | "high" | "critical";
  blocked: boolean;
  blockReasons: string[];
  safetyNotes: string[];
  requiredGates: {
    human_approval: boolean;
    audit_log: boolean;
    dry_run_preview: boolean;
    safecommit_review: boolean;
    operator_approval: boolean;
  };
  productForbiddenActions: string[];
}

/**
 * Classify risk for a proposed action.
 */
export function classifyRisk(
  productId: string,
  actionType: AllowedActionType,
  objective: string,
  scope: string[]
): RiskClassification {
  const product = CHANTER_PRODUCTS[productId];
  const notes: string[] = [];
  const blockReasons: string[] = [];
  let riskLevel: RiskLevel = "low";

  const combinedText = `${actionType} ${objective} ${scope.join(" ")}`;

  // 1. Check for forbidden verbs
  const forbiddenHits: string[] = [];
  for (const verb of FORBIDDEN_VERBS) {
    if (verb.pattern.test(combinedText)) {
      forbiddenHits.push(`${verb.category}: matched "${verb.pattern.source}"`);
    }
  }

  // Critical forbidden hits explicitly block
  const criticalBlockers = ["deployment", "live_posting", "publishing", "destructive", "live_operation"];
  const hasCriticalBlocker = forbiddenHits.some(hit =>
    criticalBlockers.some(cb => hit.startsWith(cb))
  );

  if (hasCriticalBlocker) {
    blockReasons.push(...forbiddenHits);
    notes.push("BLOCKED: Critical forbidden verbs detected in objective/scope.");
  } else if (forbiddenHits.length > 0) {
    notes.push(`WARNING: Potentially risky terms detected: ${forbiddenHits.join("; ")}`);
  }

  // 2. Product-based risk
  const productRisk: RiskLevel = product?.riskLevel ?? "medium";
  notes.push(`Product base risk: ${productRisk}`);

  // 3. Action-type-based adjustment
  if (productId === "autoposter") {
    if (actionType === "draft_autoposter_campaign") {
      riskLevel = "critical";
      notes.push("AutoPoster campaign drafting is critical risk.");
    } else {
      riskLevel = productRisk;
    }
  } else if (productId === "operator") {
    // Operator always critical for any action
    riskLevel = "critical";
    notes.push("Operator actions are always critical risk.");
  } else if (productId === "safecommit") {
    if (actionType === "prepare_commit_review") {
      riskLevel = "high";
      notes.push("Commit review proposals are high risk.");
    } else {
      riskLevel = productRisk;
    }
  } else if (productId === "clean_engine") {
    if (actionType === "draft_clean_engine_job") {
      riskLevel = "high";
      notes.push("Clean Engine job proposals are high risk.");
    } else {
      riskLevel = productRisk;
    }
  } else if (productId === "chanter_site") {
    if (hasCriticalBlocker) {
      riskLevel = "critical";
    } else {
      riskLevel = productRisk;
    }
  } else if (productId === "loop_governor") {
    riskLevel = "high";
    notes.push("Loop Governor proposals are high risk.");
  } else {
    riskLevel = productRisk;
  }

  // 4. Required gates
  const requiredGates = {
    human_approval: true, // Always required in P2
    audit_log: true,       // Always required
    dry_run_preview: true, // Always required for proposals
    safecommit_review:
      actionType === "prepare_commit_review" ||
      (productId === "safecommit") ||
      riskLevel === "high" ||
      riskLevel === "critical",
    operator_approval:
      riskLevel === "high" || riskLevel === "critical",
  };

  // 5. Product forbidden actions
  const productForbiddenActions = product?.forbiddenActions ?? [];

  return {
    riskLevel,
    blocked: hasCriticalBlocker,
    blockReasons,
    safetyNotes: notes,
    requiredGates,
    productForbiddenActions,
  };
}
