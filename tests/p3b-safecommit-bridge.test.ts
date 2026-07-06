// Tests: P3B SafeCommit Review Bridge

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EXPOSED_TOOLS } from "../src/registry/tools.js";
import { PERMISSIONS, validateReadOnly } from "../src/registry/permissions.js";
import { handleProposeAction } from "../src/tools/proposeAction.js";
import { handleGetSafecommitRequirements } from "../src/tools/getSafecommitRequirements.js";
import { handleAttachSafecommitReview } from "../src/tools/attachSafecommitReview.js";
import { handleGetProposalEvidenceBundle } from "../src/tools/getProposalEvidenceBundle.js";
import { detectSafecommitRequirement } from "../src/safecommit/safecommitTypes.js";

describe("P3B — Tool Registry (17 tools)", () => {
  it("exposes 17 tools total", () => { assert.equal(EXPOSED_TOOLS.length, 17); });
  it("includes P3B tools", () => {
    const n = EXPOSED_TOOLS.map(t => t.name);
    assert.ok(n.includes("chanter.get_safecommit_requirements"));
    assert.ok(n.includes("chanter.attach_safecommit_review"));
    assert.ok(n.includes("chanter.get_proposal_evidence_bundle"));
  });
  it("no write_approved or dangerous_forbidden", () => { assert.deepEqual(validateReadOnly(), []); });
});

describe("P3B — SafeCommit Requirements Detection", () => {
  it("detects safecommit_review gate", () => {
    const r = detectSafecommitRequirement("loop_governor", "run_validation", "test something", [], { safecommit_review: true });
    assert.equal(r.required, true);
    assert.ok(r.triggers.some(t => t.includes("requiredGates")));
  });
  it("detects prepare_commit_review action", () => {
    const r = detectSafecommitRequirement("loop_governor", "prepare_commit_review", "review changes", [], { safecommit_review: false });
    assert.equal(r.required, true);
  });
  it("detects SafeCommit product", () => {
    const r = detectSafecommitRequirement("safecommit", "run_validation", "check status", [], { safecommit_review: false });
    assert.equal(r.required, true);
  });
  it("detects code keywords", () => {
    const r = detectSafecommitRequirement("loop_governor", "inspect_product_health", "check code and test results", [], { safecommit_review: false });
    assert.equal(r.required, true);
    assert.ok(r.triggers.some(t => t.includes("code")));
  });
  it("not required for low-risk non-code proposals", () => {
    const r = detectSafecommitRequirement("chanter_site", "inspect_product_health", "check site status", [], { safecommit_review: false });
    assert.equal(r.required, false);
  });
});

describe("P3B — Get SafeCommit Requirements", () => {
  it("returns requirements for existing proposal", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "prepare_commit_review", objective: "Review code changes" });
    assert.equal(c.success, true);
    const r = await handleGetSafecommitRequirements(c.proposalId!);
    assert.equal(r.found, true);
    assert.equal(r.safecommitReviewRequired, true);
  });
  it("returns not required for unrelated proposal", async () => {
    const c = await handleProposeAction({ productId: "chanter_site", actionType: "inspect_product_health", objective: "Check site" });
    assert.equal(c.success, true);
    const r = await handleGetSafecommitRequirements(c.proposalId!);
    assert.equal(r.safecommitReviewRequired, false);
  });
  it("rejects unknown proposal", async () => {
    const r = await handleGetSafecommitRequirements("nonexistent-prop-xyz");
    assert.equal(r.found, false);
  });
});

describe("P3B — Attach SafeCommit Review", () => {
  it("appends safe_to_review and sets passed_metadata_only", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "prepare_commit_review", objective: "Review commit" });
    assert.equal(c.success, true);
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC Bot", verdict: "safe_to_review", riskLevel: "low" });
    assert.equal(r.success, true);
    assert.equal(r.reviewStatus, "passed_metadata_only");
    assert.equal(r.executionStatus, "not_executed");
  });
  it("needs_changes sets needs_changes", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "run_validation", objective: "Needs changes test" });
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC Bot", verdict: "needs_changes", riskLevel: "medium", notes: "Add more tests" });
    assert.equal(r.success, true);
    assert.equal(r.reviewStatus, "needs_changes");
  });
  it("blocked sets blocked", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "inspect_product_health", objective: "Blocked test" });
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC Bot", verdict: "blocked", riskLevel: "critical" });
    assert.equal(r.reviewStatus, "blocked");
  });
  it("executionStatus remains not_executed after safe_to_review", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "propose_repair_plan", objective: "Exec status test" });
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC", verdict: "safe_to_review", riskLevel: "low" });
    assert.equal(r.executionStatus, "not_executed");
  });
  it("rejects invalid verdict", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "inspect_product_health", objective: "Bad verdict test" });
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC", verdict: "auto_commit", riskLevel: "low" });
    assert.equal(r.success, false);
    assert.ok(r.error!.includes("Invalid verdict"));
  });
  it("rejects unknown proposal", async () => {
    const r = await handleAttachSafecommitReview({ proposalId: "nonexistent", reviewer: "SC", verdict: "safe_to_review", riskLevel: "low" });
    assert.equal(r.success, false);
  });
  it("redacts sensitive notes", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "inspect_product_health", objective: "Redaction test" });
    const r = await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC", verdict: "safe_to_review", riskLevel: "low", notes: "token: sk-abcdefghijklmnopqrstuvwxyz123456" });
    assert.equal(r.success, true);
  });
});

describe("P3B — Evidence Bundle", () => {
  it("returns bundle for existing proposal", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "run_validation", objective: "Bundle test" });
    const r = await handleGetProposalEvidenceBundle(c.proposalId!);
    assert.equal(r.found, true);
    assert.ok(r.bundle);
    assert.equal((r.bundle!.proposal as any).proposalId, c.proposalId);
  });
  it("excludes file contents (only summaries)", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "inspect_product_health", objective: "No file test" });
    const r = await handleGetProposalEvidenceBundle(c.proposalId!);
    const b = r.bundle!;
    // Snapshots only have "available" flag, not actual data
    assert.equal((b.snapshots as any).git.available, false);
    if ((b.snapshots as any).validation.available) {
      // Should not have raw output
      assert.ok(!(JSON.stringify(b).includes("stdout")));
    }
  });
  it("includes safecommit review state after review", async () => {
    const c = await handleProposeAction({ productId: "safecommit", actionType: "prepare_commit_review", objective: "Review state test" });
    await handleAttachSafecommitReview({ proposalId: c.proposalId!, reviewer: "SC", verdict: "safe_to_review", riskLevel: "low" });
    const r = await handleGetProposalEvidenceBundle(c.proposalId!);
    assert.equal((r.bundle!.safecommitReview as any).totalReviews, 1);
  });
  it("rejects unknown proposal", async () => {
    const r = await handleGetProposalEvidenceBundle("nonexistent");
    assert.equal(r.found, false);
  });
});

describe("P3B — Regression", () => {
  it("all tools have permission entries", () => {
    for (const t of EXPOSED_TOOLS) { assert.ok(PERMISSIONS[t.name], `${t.name} missing`); }
  });
  it("no write_approved exposed", () => { assert.deepEqual(validateReadOnly(), []); });
});
