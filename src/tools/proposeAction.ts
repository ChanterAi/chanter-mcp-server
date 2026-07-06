// chanter.propose_action — create a dry-run action proposal.
// Never executes the action. Only creates a structured proposal record.

import { CHANTER_PRODUCTS } from "../registry/products.js";
import {
  ALLOWED_ACTION_TYPES,
  generateProposalId,
  calculateExpiry,
  type AllowedActionType,
  type DryRunProposal,
} from "../proposals/proposalTypes.js";
import { classifyRisk } from "../proposals/riskClassifier.js";
import { saveProposal } from "../proposals/proposalStore.js";
import { redactSensitiveValues } from "../safety/redaction.js";

export interface ProposeActionInput {
  productId: string;
  actionType: string;
  objective: string;
  scope?: string[];
  requestedBy?: string;
  riskTolerance?: "low" | "medium" | "high";
}

export interface ProposeActionResult {
  success: boolean;
  error?: string;
  proposalId?: string;
  proposal?: DryRunProposal;
  blocked?: boolean;
  blockReasons?: string[];
}

export async function handleProposeAction(
  input: ProposeActionInput
): Promise<ProposeActionResult> {
  const productId = input.productId.trim().toLowerCase();

  // 1. Validate product
  const product = CHANTER_PRODUCTS[productId];
  if (!product) {
    return {
      success: false,
      error: `Unknown product: "${input.productId}". Known products: ${Object.keys(CHANTER_PRODUCTS).join(", ")}`,
    };
  }

  // 2. Validate actionType
  if (!ALLOWED_ACTION_TYPES.includes(input.actionType as AllowedActionType)) {
    return {
      success: false,
      error: `Invalid actionType: "${input.actionType}". Allowed: ${ALLOWED_ACTION_TYPES.join(", ")}`,
    };
  }
  const actionType = input.actionType as AllowedActionType;

  // 3. Sanitize objective
  const objective = redactSensitiveValues(input.objective.trim());
  if (!objective) {
    return { success: false, error: "Objective must not be empty." };
  }

  const scope = (input.scope ?? []).map(s => redactSensitiveValues(s.trim())).filter(Boolean);
  const requestedBy = redactSensitiveValues((input.requestedBy ?? "system").trim());

  // 4. Risk classification
  const risk = classifyRisk(productId, actionType, objective, scope);

  if (risk.blocked) {
    return {
      success: false,
      error: "Proposal blocked by safety policy.",
      blocked: true,
      blockReasons: risk.blockReasons,
    };
  }

  // 5. Build proposal
  const now = new Date();
  const proposalId = generateProposalId();

  const proposal: DryRunProposal = {
    proposalId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    productId: product.id,
    productDisplayName: product.displayName,
    actionType,
    objective,
    scope,
    requestedBy,
    permissionLevel: "write_proposed",
    riskLevel: risk.riskLevel,
    status: "draft",
    executionStatus: "not_executed",
    requiredGates: risk.requiredGates,
    forbiddenActions: [...risk.productForbiddenActions],
    safetyNotes: risk.safetyNotes,
    snapshots: null, // Snapshots added by server layer
    reviewHistory: [],
    expiresAt: calculateExpiry(now),
    recommendedNextAction:
      risk.riskLevel === "critical"
        ? `Critical proposal requires Operator approval before any future execution.`
        : `Submit proposal for review. Execution is not available in P2.`,
  };

  // 6. Save proposal
  saveProposal(proposal);

  return {
    success: true,
    proposalId,
    proposal,
  };
}
