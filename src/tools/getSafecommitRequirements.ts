// chanter.get_safecommit_requirements â€” determine SafeCommit review requirements.
// Metadata only. No execution, no commit, no push, no deploy.

import { loadProposal } from "../proposals/proposalStore.js";
import {
  detectSafecommitRequirement,
  buildValidationChecks,
  type SafecommitRequirements,
} from "../safecommit/safecommitTypes.js";

export async function handleGetSafecommitRequirements(
  proposalId: string
): Promise<{ found: boolean; error?: string } & Partial<SafecommitRequirements>> {
  const id = proposalId.trim();
  if (!id) return { found: false, error: "proposalId is required." };

  const proposal = loadProposal(id);
  if (!proposal) return { found: false, error: `Proposal not found: "${id}".` };

  const detection = detectSafecommitRequirement(
    proposal.productId,
    proposal.actionType,
    proposal.objective,
    proposal.scope,
    proposal.requiredGates
  );

  // Build validation checks based on available scripts from snapshots if any
  const scripts = (proposal.snapshots?.validation as any)?.scripts ?? {};
  const validationChecks = buildValidationChecks(scripts);

  // Extract any existing SafeCommit review from safety notes
  const existingReview = extractSafecommitReview(proposal);
  let currentStatus: SafecommitRequirements["currentStatus"] = detection.required
    ? (existingReview ? "pending" : "required")
    : "not_required";

  if (existingReview) {
    switch (existingReview.verdict) {
      case "safe_to_review": currentStatus = "passed_metadata_only"; break;
      case "needs_changes": currentStatus = "needs_changes"; break;
      case "blocked": currentStatus = "blocked"; break;
      case "unsafe": currentStatus = "failed_metadata_only"; break;
    }
  }

  return {
    found: true,
    proposalId: proposal.proposalId,
    safecommitReviewRequired: detection.required,
    reason: detection.reason,
    requiredGates: { safecommit_review: proposal.requiredGates.safecommit_review },
    requiredValidationChecks: detection.required ? validationChecks : [],
    availableValidationScripts: scripts,
    gitSnapshot: {
      available: !!proposal.snapshots?.git,
      dirty: proposal.snapshots?.git?.dirty as boolean | undefined,
      branch: proposal.snapshots?.git?.branch as string | null | undefined,
      commit: proposal.snapshots?.git?.shortCommit as string | null | undefined,
    },
    blockers: existingReview?.blockers?.map((b: { message: string }) => b.message) ?? [],
    currentStatus,
    warning: "SafeCommit review is metadata only and self-reported by whoever calls attach_safecommit_review — it is NOT independently verified by a real SafeCommit run. It does NOT authorize commit, push, or execution. All proposals remain not_executed. Treat as advisory only, never as a safety gate.",
  };
}

function extractSafecommitReview(proposal: any): any | null {
  const prefix = "SAFECOMMIT_REVIEW:";
  for (const note of proposal.safetyNotes ?? []) {
    if (note.startsWith(prefix)) {
      try { return JSON.parse(note.slice(prefix.length)); } catch { /* skip */ }
    }
  }
  return null;
}

