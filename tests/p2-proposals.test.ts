// Tests: P2 Dry-Run Proposal & Approval Foundation

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Registry
import { EXPOSED_TOOLS } from "../src/registry/tools.js";
import { PERMISSIONS, isSafeLevel, validateReadOnly } from "../src/registry/permissions.js";

// Safety
import { checkSafetyPolicy } from "../src/safety/policy.js";

// Proposal tools
import { handleProposeAction } from "../src/tools/proposeAction.js";
import { handleListProposals } from "../src/tools/listProposals.js";
import { handleGetProposal } from "../src/tools/getProposal.js";
import { handleReviewProposal } from "../src/tools/reviewProposal.js";

// Risk classifier
import { classifyRisk } from "../src/proposals/riskClassifier.js";

// Proposal types
import { ALLOWED_ACTION_TYPES, generateProposalId, calculateExpiry } from "../src/proposals/proposalTypes.js";

describe("P2 — Tool Registry (12 tools)", () => {
  it("exposes 12 tools total (5 C1 + 3 P1 + 4 P2)", () => {
    assert.equal(EXPOSED_TOOLS.length, 12);
  });

  it("includes all 4 new P2 tools", () => {
    const names = EXPOSED_TOOLS.map(t => t.name);
    assert.ok(names.includes("chanter.propose_action"));
    assert.ok(names.includes("chanter.list_proposals"));
    assert.ok(names.includes("chanter.get_proposal"));
    assert.ok(names.includes("chanter.review_proposal"));
  });

  it("no tools have write_approved or dangerous_forbidden", () => {
    const violations = validateReadOnly();
    assert.deepEqual(violations, []);
  });

  it("write_proposed tools require audit", () => {
    assert.equal(PERMISSIONS["chanter.propose_action"].requiresAudit, true);
    assert.equal(PERMISSIONS["chanter.review_proposal"].requiresAudit, true);
  });

  it("list_safe_tools includes all 12 tools", () => {
    // All tools should appear in the permissions registry
    for (const tool of EXPOSED_TOOLS) {
      assert.ok(PERMISSIONS[tool.name], `${tool.name} missing from permissions`);
    }
  });
});

describe("P2 — Permission / Safety", () => {
  it("write_proposed tools pass safety policy check", () => {
    const result = checkSafetyPolicy("chanter.propose_action", {});
    assert.equal(result.allowed, true, "propose_action should be allowed");
  });

  it("isSafeLevel accepts write_proposed", () => {
    assert.ok(isSafeLevel("write_proposed"));
    assert.ok(isSafeLevel("read_public"));
    assert.ok(isSafeLevel("read_internal"));
  });

  it("isSafeLevel rejects write_approved and dangerous_forbidden", () => {
    assert.equal(isSafeLevel("write_approved"), false);
    assert.equal(isSafeLevel("dangerous_forbidden"), false);
  });

  it("forbidden actions still blocked for proposal inputs with deploy terms", () => {
    const result = checkSafetyPolicy("chanter.propose_action", {
      actionType: "run_validation",
      objective: "deploy to production immediately",
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("Forbidden action"));
  });
});

describe("P2 — Proposal Creation", () => {
  it("creates valid proposal for known product", async () => {
    const result = await handleProposeAction({
      productId: "safecommit",
      actionType: "run_validation",
      objective: "Run typecheck and tests on SafeCommit",
    });
    assert.equal(result.success, true);
    assert.ok(result.proposalId, "should have a proposalId");
    assert.equal(result.proposal!.productId, "safecommit");
    assert.equal(result.proposal!.permissionLevel, "write_proposed");
    assert.equal(result.proposal!.executionStatus, "not_executed");
    assert.ok(result.proposal!.requiredGates.human_approval);
    assert.ok(result.proposal!.requiredGates.audit_log);
    assert.ok(result.proposal!.requiredGates.dry_run_preview);
  });

  it("rejects unknown product", async () => {
    const result = await handleProposeAction({
      productId: "nonexistent_product_xyz",
      actionType: "run_validation",
      objective: "Test",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("Unknown product"));
  });

  it("rejects invalid actionType", async () => {
    const result = await handleProposeAction({
      productId: "safecommit",
      actionType: "deploy_to_production",
      objective: "Deploy everything",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("Invalid actionType"));
  });

  it("blocks proposal with deploy objective", async () => {
    const result = await handleProposeAction({
      productId: "autoposter",
      actionType: "draft_autoposter_campaign",
      objective: "deploy and post to TikTok live",
    });
    assert.equal(result.success, false);
    assert.ok(result.blocked);
    if (result.blockReasons) {
      assert.ok(result.blockReasons.length > 0);
    }
  });

  it("blocks proposal with publish objective", async () => {
    const result = await handleProposeAction({
      productId: "chanter_site",
      actionType: "review_readiness",
      objective: "publish site to vercel production",
    });
    assert.equal(result.success, false);
    assert.ok(result.blocked);
  });

  it("marks autoposter campaign proposals as critical risk", async () => {
    const result = await handleProposeAction({
      productId: "autoposter",
      actionType: "draft_autoposter_campaign",
      objective: "Draft a campaign to test the scheduler",
    });
    assert.equal(result.success, true);
    assert.equal(result.proposal!.riskLevel, "critical");
  });

  it("marks operator proposals as critical risk", async () => {
    const result = await handleProposeAction({
      productId: "operator",
      actionType: "review_readiness",
      objective: "Check operator readiness",
    });
    assert.equal(result.success, true);
    assert.equal(result.proposal!.riskLevel, "critical");
  });

  it("generateProposalId produces safe IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = generateProposalId();
      assert.ok(id.startsWith("prop-"));
      assert.ok(/^[a-zA-Z0-9\-_]+$/.test(id));
      assert.ok(!ids.has(id));
      ids.add(id);
    }
  });

  it("calculateExpiry is 30 days in the future", () => {
    const now = new Date();
    const expiry = new Date(calculateExpiry(now));
    const diff = expiry.getTime() - now.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    assert.ok(days > 29 && days < 31, `expected ~30 days, got ${days}`);
  });
});

describe("P2 — Risk Classifier", () => {
  it("classifies autoposter campaign as critical", () => {
    const result = classifyRisk("autoposter", "draft_autoposter_campaign", "Test campaign", []);
    assert.equal(result.riskLevel, "critical");
    assert.equal(result.blocked, false);
  });

  it("classifies operator as always critical", () => {
    const result = classifyRisk("operator", "review_readiness", "Check status", []);
    assert.equal(result.riskLevel, "critical");
  });

  it("blocks deploy verb", () => {
    const result = classifyRisk("safecommit", "run_validation", "deploy to production", []);
    assert.equal(result.blocked, true);
    assert.ok(result.blockReasons.some(r => r.includes("deployment")));
  });

  it("blocks post now verb", () => {
    const result = classifyRisk("autoposter", "run_validation", "post now to TikTok", []);
    assert.equal(result.blocked, true);
  });

  it("safecommit commit review is high risk", () => {
    const result = classifyRisk("safecommit", "prepare_commit_review", "Review pending commits", []);
    assert.ok(result.riskLevel === "high" || result.riskLevel === "critical");
  });

  it("low risk product stays low", () => {
    // chanter site is medium, non-deploy action
    const result = classifyRisk("chanter_site", "inspect_product_health", "Check site status", []);
    assert.equal(result.riskLevel, "medium");
  });

  it("secret terms are detected but don't always block", () => {
    const result = classifyRisk("safecommit", "run_validation", "check token validity", []);
    assert.ok(result.safetyNotes.some(n => n.includes("WARNING")));
  });
});

describe("P2 — Proposal Listing & Reading", () => {
  it("lists proposals (may be empty after cleanup)", async () => {
    const result = await handleListProposals();
    assert.ok(Array.isArray(result.proposals));
    assert.ok(typeof result.count === "number");
  });

  it("filters by productId", async () => {
    const result = await handleListProposals("safecommit");
    assert.ok(Array.isArray(result.proposals));
    // All should be for safecommit
    for (const p of result.proposals) {
      assert.equal(p.productId, "safecommit");
    }
  });

  it("caps limit at 50", async () => {
    const result = await handleListProposals(undefined, undefined, 100);
    // Should return at most 50
    assert.ok(result.proposals.length <= 50);
  });

  it("get_proposal returns not found for missing ID", async () => {
    const result = await handleGetProposal("nonexistent-prop-id");
    assert.equal(result.found, false);
    assert.ok(result.error);
  });

  it("get_proposal returns found for existing ID", async () => {
    // Create a test proposal first
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Test proposal for retrieval",
    });
    assert.equal(created.success, true);

    const result = await handleGetProposal(created.proposalId!);
    assert.equal(result.found, true);
    assert.equal(result.proposal!.proposalId, created.proposalId);
    assert.equal(result.proposal!.executionStatus, "not_executed");
  });
});

describe("P2 — Proposal Review", () => {
  it("approval updates status but keeps executionStatus as not_executed", async () => {
    // Create a test proposal
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "run_validation",
      objective: "Test proposal for review approval",
    });
    assert.equal(created.success, true);

    // Approve it
    const result = await handleReviewProposal({
      proposalId: created.proposalId!,
      decision: "approved_for_future_execution",
      reviewer: "Test Reviewer",
      notes: "Looks good",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "approved");
    assert.equal(result.executionStatus, "not_executed",
      "executionStatus MUST remain not_executed even after approval");
  });

  it("rejection updates status", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "review_readiness",
      objective: "Test proposal for review rejection",
    });
    assert.equal(created.success, true);

    const result = await handleReviewProposal({
      proposalId: created.proposalId!,
      decision: "rejected",
      reviewer: "Test Reviewer",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "rejected");
  });

  it("needs_changes updates status", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Test proposal for needs_changes",
    });
    assert.equal(created.success, true);

    const result = await handleReviewProposal({
      proposalId: created.proposalId!,
      decision: "needs_changes",
      reviewer: "Test Reviewer",
      notes: "Add more scope details",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "needs_changes");
  });

  it("rejects invalid decision", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "inspect_product_health",
      objective: "Test proposal for bad decision",
    });
    assert.equal(created.success, true);

    const result = await handleReviewProposal({
      proposalId: created.proposalId!,
      decision: "auto_execute",
      reviewer: "Hacker",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("Invalid decision"));
  });

  it("rejects missing proposal ID", async () => {
    const result = await handleReviewProposal({
      proposalId: "nonexistent-prop-id-xyz",
      decision: "approved_for_future_execution",
      reviewer: "Test Reviewer",
    });
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not found"));
  });

  it("review history is appended on approval", async () => {
    const created = await handleProposeAction({
      productId: "safecommit",
      actionType: "propose_repair_plan",
      objective: "Test review history tracking",
    });
    assert.equal(created.success, true);

    await handleReviewProposal({
      proposalId: created.proposalId!,
      decision: "approved_for_future_execution",
      reviewer: "Reviewer1",
      notes: "First review",
    });

    // Get the proposal back and check review history
    const fetched = await handleGetProposal(created.proposalId!);
    assert.equal(fetched.found, true);
    assert.ok(fetched.proposal!.reviewHistory.length >= 1);
    assert.equal(fetched.proposal!.reviewHistory[0].reviewer, "Reviewer1");
    assert.equal(fetched.proposal!.status, "approved");
    assert.equal(fetched.proposal!.executionStatus, "not_executed");
  });
});

describe("P2 — Regression", () => {
  it("all P1 read-only tools still pass safety", () => {
    const p1Tools = ["chanter.git_status", "chanter.test_summary", "chanter.product_readiness"];
    for (const name of p1Tools) {
      const result = checkSafetyPolicy(name, {});
      assert.equal(result.allowed, true, `${name} should be allowed`);
    }
  });

  it("forbidden actions remain blocked", () => {
    const result = checkSafetyPolicy("chanter.propose_action", { exec: "rm -rf /" });
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("Forbidden action"));
  });

  it("write_approved tools are still blocked", () => {
    // Simulate a write_approved tool — it would be blocked by registry validation
    const violations = validateReadOnly();
    assert.deepEqual(violations, []);
    // No write_approved tools exist
  });
});
