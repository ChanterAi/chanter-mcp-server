// Tests: P3A Operator Approval Bridge â€” metadata only

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EXPOSED_TOOLS } from "../src/registry/tools.js";
import { PERMISSIONS, validateReadOnly, isSafeLevel } from "../src/registry/permissions.js";
import { handleProposeAction } from "../src/tools/proposeAction.js";
import { handleGetApprovalRequirements } from "../src/tools/getApprovalRequirements.js";
import { handleAttachOperatorReview } from "../src/tools/attachOperatorReview.js";
import {
  determineApprovalRoutes,
  VALID_REVIEWER_ROLES,
  VALID_DECISIONS,
} from "../src/operator/approvalTypes.js";

describe("P3A â€” Tool Registry (14 tools)", () => {
  it("tool count is correct (12 prev + 2 P3A)", () => {
    assert.ok(EXPOSED_TOOLS.length >= 14, `expected >=14 got ${EXPOSED_TOOLS.length}`);
  });

  it("includes both new P3A tools", () => {
    const names = EXPOSED_TOOLS.map(t => t.name);
    assert.ok(names.includes("chanter.get_approval_requirements"));
    assert.ok(names.includes("chanter.attach_operator_review"));
  });

  it("attach_operator_review is write_proposed", () => {
    assert.equal(PERMISSIONS["chanter.attach_operator_review"].level, "write_proposed");
  });

  it("get_approval_requirements is read_internal", () => {
    assert.equal(PERMISSIONS["chanter.get_approval_requirements"].level, "read_internal");
  });

  it("no write_approved or dangerous_forbidden tools exposed", () => {
    const violations = validateReadOnly();
    assert.deepEqual(violations, []);
  });
});

describe("P3A â€” Approval Routes", () => {
  it("critical proposals require founder + operator review", () => {
    const routes = determineApprovalRoutes("autoposter", "draft_autoposter_campaign", "critical");
    assert.ok(routes.includes("founder_review"));
    assert.ok(routes.includes("operator_review"));
    assert.ok(routes.includes("blocked_for_p3_execution"));
  });

  it("high risk proposals require operator review", () => {
    const routes = determineApprovalRoutes("safecommit", "prepare_commit_review", "high");
    assert.ok(routes.includes("operator_review"));
    assert.ok(routes.includes("safecommit_review"));
    assert.ok(routes.includes("blocked_for_p3_execution"));
  });

  it("low risk proposals still blocked for execution", () => {
    const routes = determineApprovalRoutes("chanter_site", "inspect_product_health", "low");
    assert.ok(routes.includes("blocked_for_p3_execution"));
  });

  it("autoposter always requires product_owner review", () => {
    const routes = determineApprovalRoutes("autoposter", "run_validation", "medium");
    assert.ok(routes.includes("product_owner_review"));
  });

  it("operator product always requires founder review", () => {
    const routes = determineApprovalRoutes("operator", "review_readiness", "medium");
    assert.ok(routes.includes("founder_review"));
  });
});

describe("P3A â€” Get Approval Requirements", () => {
  it("returns requirements for existing proposal", async () => {
    // Create a test proposal
    const created = await handleProposeAction({
      productId: "autoposter",
      actionType: "draft_autoposter_campaign",
      objective: "Test campaign for approval requirements",
    });
    assert.equal(created.success, true);

    const result = await handleGetApprovalRequirements(created.proposalId!);
    assert.equal(result.found, true);
    assert.ok(result.approvalRoutes!.length > 0);
    assert.ok(result.requirements!.length > 0);
    assert.ok(result.warning.includes("METADATA ONLY"));
    assert.equal(result.executionStatus, "not_executed");
  });

  it("returns requirements for critical proposal", async () => {
    const created = await handleProposeAction({
      productId: "autoposter",
      actionType: "draft_autoposter_campaign",
      objective: "Critical campaign draft",
    });
    assert.equal(created.success, true);

    const result = await handleGetApprovalRequirements(created.proposalId!);
    assert.equal(result.riskLevel, "critical");
    // Critical should have founder_review
    assert.ok(result.approvalRoutes!.includes("founder_review"));
  });

  it("returns requirements for SafeCommit proposal", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "prepare_commit_review",
      objective: "Review pending code changes",
    });
    assert.equal(created.success, true);

    const result = await handleGetApprovalRequirements(created.proposalId!);
    // Should include safecommit_review route
    assert.ok(
      result.approvalRoutes!.includes("safecommit_review") ||
      result.requirements!.some(r => r.role === "safecommit")
    );
  });

  it("rejects unknown proposal ID", async () => {
    const result = await handleGetApprovalRequirements("nonexistent-prop-xyz");
    assert.equal(result.found, false);
    assert.ok(result.error);
  });

  it("includes evidence bundle", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "run_validation",
      objective: "Evidence bundle test",
    });
    assert.equal(created.success, true);

    const result = await handleGetApprovalRequirements(created.proposalId!);
    assert.ok(result.evidenceBundle);
    const bundle = result.evidenceBundle as any;
    assert.equal(bundle.proposalId, created.proposalId);
    assert.ok(bundle.requiredGates);
    assert.ok(bundle.safetyWarning);
  });
});

describe("P3A â€” Attach Operator Review", () => {
  it("appends operator review to proposal", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "run_validation",
      objective: "Test operator review attachment",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "TestOperator",
      reviewerRole: "operator",
      decision: "approved_metadata_only",
      notes: "Approved for future execution planning",
    });
    assert.equal(result.success, true);
    assert.equal(result.approvalStage, "approved_metadata_only");
    assert.equal(result.executionStatus, "not_executed");
    assert.ok(result.reviewEvent);
    assert.equal(result.reviewEvent.reviewerRole, "operator");
  });

  it("appends founder review", async () => {
    const created = await handleProposeAction({
      productId: "operator",
      actionType: "review_readiness",
      objective: "Founder review test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "FounderUser",
      reviewerRole: "founder",
      decision: "approved_metadata_only",
      notes: "Founder approved for archival",
    });
    assert.equal(result.success, true);
    assert.equal(result.reviewEvent!.reviewerRole, "founder");
    assert.equal(result.executionStatus, "not_executed");
  });

  it("keeps executionStatus not_executed after rejection", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Rejection test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "Rejector",
      reviewerRole: "operator",
      decision: "rejected",
      notes: "Not needed at this time",
    });
    assert.equal(result.success, true);
    assert.equal(result.executionStatus, "not_executed");
    assert.equal(result.approvalStage, "rejected");
  });

  it("keeps executionStatus not_executed after needs_changes", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "propose_repair_plan",
      objective: "Needs changes test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "ReviewerWithFeedback",
      reviewerRole: "product_owner",
      decision: "needs_changes",
      notes: "Add more detail about scope",
    });
    assert.equal(result.success, true);
    assert.equal(result.executionStatus, "not_executed");
  });

  it("rejects invalid reviewerRole", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Bad role test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "Hacker",
      reviewerRole: "admin",  // not in VALID_REVIEWER_ROLES
      decision: "approved_metadata_only",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("Invalid reviewerRole"));
  });

  it("rejects invalid decision", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Bad decision test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "Reviewer",
      reviewerRole: "operator",
      decision: "auto_execute",  // invalid
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("Invalid decision"));
  });

  it("rejects unknown proposal", async () => {
    const result = await handleAttachOperatorReview({
      proposalId: "nonexistent-prop-id-xyz",
      reviewer: "Reviewer",
      reviewerRole: "operator",
      decision: "approved_metadata_only",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not found"));
  });

  it("redacts sensitive notes", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Redaction test",
    });
    assert.equal(created.success, true);

    const result = await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "Reviewer",
      reviewerRole: "operator",
      decision: "approved_metadata_only",
      notes: "bearer abc123def456ghi789jkl is needed",  // should be redacted
    });
    assert.equal(result.success, true);
    if (result.reviewEvent?.notes) {
      assert.ok(!result.reviewEvent.notes.includes("abc123def456ghi789jkl"));
      assert.ok(result.reviewEvent.notes.includes("REDACTED"));
    }
  });

  it("multiple reviews accumulate in approval requirements", async () => {
    const created = await handleProposeAction({
      productId: "autoposter",
      actionType: "draft_autoposter_campaign",
      objective: "Multi-review test",
    });
    assert.equal(created.success, true);

    // Add operator review
    await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "Op1",
      reviewerRole: "operator",
      decision: "approved_metadata_only",
    });

    // Add product_owner review
    await handleAttachOperatorReview({
      proposalId: created.proposalId!,
      reviewer: "PO1",
      reviewerRole: "product_owner",
      decision: "approved_metadata_only",
    });

    // Get requirements â€” should show some as satisfied
    const reqs = await handleGetApprovalRequirements(created.proposalId!);
    assert.equal(reqs.found, true);
    const satisfied = reqs.requirements!.filter(r => r.satisfied);
    assert.ok(satisfied.length >= 2, `expected >=2 satisfied, got ${satisfied.length}`);
  });
});

