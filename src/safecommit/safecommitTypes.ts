// SafeCommit review types — metadata-only review bridge.
// No execution. No commit. No push. No deploy.

export type SafecommitReviewStatus =
  | "not_required"
  | "required"
  | "pending"
  | "passed_metadata_only"
  | "failed_metadata_only"
  | "needs_changes"
  | "blocked";

export type SafecommitVerdict =
  | "safe_to_review"
  | "needs_changes"
  | "blocked"
  | "unsafe";

export type SafecommitRiskLevel = "low" | "medium" | "high" | "critical";

export interface ValidationCheck {
  name: string;
  commandLabel: string;
  required: boolean;
  status: "not_run" | "available" | "missing" | "passed_known" | "failed_known";
  notes: string;
}

export interface ReviewBlocker {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  source: string;
}

export interface SafecommitReviewEvent {
  timestamp: string;
  reviewer: string;
  verdict: SafecommitVerdict;
  riskLevel: SafecommitRiskLevel;
  notes?: string;
  validationChecks?: ValidationCheck[];
  blockers?: ReviewBlocker[];
}

export interface SafecommitRequirements {
  proposalId: string;
  safecommitReviewRequired: boolean;
  reason: string;
  requiredGates: {
    safecommit_review: boolean;
  };
  requiredValidationChecks: ValidationCheck[];
  availableValidationScripts: Record<string, string>;
  gitSnapshot: {
    available: boolean;
    dirty?: boolean;
    branch?: string | null;
    commit?: string | null;
  };
  blockers: string[];
  currentStatus: SafecommitReviewStatus;
  warning: string;
}

/**
 * Detect if SafeCommit review is required based on proposal metadata.
 */
export function detectSafecommitRequirement(
  productId: string,
  actionType: string,
  objective: string,
  scope: string[],
  requiredGates: { safecommit_review: boolean }
): { required: boolean; reason: string; triggers: string[] } {
  const triggers: string[] = [];

  // Gate-based trigger
  if (requiredGates.safecommit_review) {
    triggers.push("requiredGates.safecommit_review is true");
  }

  // Action-based trigger
  if (actionType === "prepare_commit_review") {
    triggers.push("actionType is prepare_commit_review");
  }

  // Product-based trigger
  if (productId === "safecommit") {
    triggers.push("productId is safecommit");
  }

  // Keyword-based trigger
  const CODE_KEYWORDS = [
    "code", "commit", "validation", "git", "repo",
    "build", "test", "deploy", "release", "push",
    "diff", "review", "patch", "merge", "branch",
  ];
  const combinedText = `${objective} ${scope.join(" ")}`.toLowerCase();
  const matchedKeywords = CODE_KEYWORDS.filter(kw => combinedText.includes(kw));
  if (matchedKeywords.length > 0) {
    triggers.push(`Keywords detected: ${matchedKeywords.join(", ")}`);
  }

  const required = triggers.length > 0;
  const reason = required
    ? `SafeCommit review required due to: ${triggers.join("; ")}`
    : "SafeCommit review not required for this proposal.";

  return { required, reason, triggers };
}

/**
 * Generate validation checks based on available scripts.
 */
export function buildValidationChecks(
  availableScripts: Record<string, string>
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const checkDefs: Array<{ name: string; label: string; required: boolean }> = [
    { name: "test", label: "npm test", required: true },
    { name: "build", label: "npm run build", required: true },
    { name: "typecheck", label: "npm run typecheck", required: true },
    { name: "lint", label: "npm run lint", required: false },
  ];

  for (const def of checkDefs) {
    checks.push({
      name: def.name,
      commandLabel: def.label,
      required: def.required,
      status: availableScripts[def.name] ? "available" : "missing",
      notes: availableScripts[def.name]
        ? `Script "${def.label}" is defined in package.json.`
        : `Script "${def.label}" is not defined in package.json.`,
    });
  }

  return checks;
}
