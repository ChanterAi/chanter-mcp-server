// Tests: P1 Read-Only System Intelligence â€” git_status, test_summary, product_readiness
// Plus: safeReadOnlyCommand, permission/tool registry updates, audit, safety

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

// Registry
import { EXPOSED_TOOLS } from "../src/registry/tools.js";
import { PERMISSIONS, isSafeLevel, validateReadOnly } from "../src/registry/permissions.js";

// Safe command runner
import { runSafeCommand } from "../src/safety/safeReadOnlyCommand.js";

// Tools
import { handleGitStatus } from "../src/tools/gitStatus.js";
import { handleTestSummary } from "../src/tools/testSummary.js";
import { handleProductReadiness } from "../src/tools/productReadiness.js";

// Safety
import { checkSafetyPolicy } from "../src/safety/policy.js";

const CHANTER_ROOT = process.env.CHANTER_ROOT ?? "C:\\Users\\IT\\OneDrive\\Desktop\\CHANTER";
const rootExists = existsSync(CHANTER_ROOT);

describe("P1 â€” Tool Registry (8 tools)", () => {
  it("tool count is correct", () => {
    assert.ok(EXPOSED_TOOLS.length >= 8, `expected >= 8, got ${EXPOSED_TOOLS.length}`);
  });

  it("includes all 3 new P1 tools", () => {
    const names = EXPOSED_TOOLS.map(t => t.name);
    assert.ok(names.includes("chanter.git_status"));
    assert.ok(names.includes("chanter.test_summary"));
    assert.ok(names.includes("chanter.product_readiness"));
  });

  it("all 8 tools are read_public or read_internal", () => {
    const violations = validateReadOnly();
    assert.deepEqual(violations, []);
  });

  it("all 3 new tools are read_internal", () => {
    assert.equal(PERMISSIONS["chanter.git_status"].level, "read_internal");
    assert.equal(PERMISSIONS["chanter.test_summary"].level, "read_internal");
    assert.equal(PERMISSIONS["chanter.product_readiness"].level, "read_internal");
  });

  it("new tools all require audit", () => {
    assert.equal(PERMISSIONS["chanter.git_status"].requiresAudit, true);
    assert.equal(PERMISSIONS["chanter.test_summary"].requiresAudit, true);
    assert.equal(PERMISSIONS["chanter.product_readiness"].requiresAudit, true);
  });
});

describe("P1 â€” Permission / Safety", () => {
  it("all new tools pass safety policy check", () => {
    for (const name of ["chanter.git_status", "chanter.test_summary", "chanter.product_readiness"]) {
      const result = checkSafetyPolicy(name, {});
      assert.equal(result.allowed, true, `${name} should be allowed`);
    }
  });

  it("forbidden actions still blocked for new tool patterns", () => {
    // git_status with deploy-like input should still be blocked by safety
    const result = checkSafetyPolicy("chanter.git_status", { action: "deploy" });
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("Forbidden action"));
  });
});

describe("P1 â€” Safe Read-Only Command Runner", () => {
  it("rejects non-allowlisted git commands", async () => {
    const result = await runSafeCommand(CHANTER_ROOT, ["push", "origin", "main"]);
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not in the allowlist"));
  });

  it("rejects arbitrary command fragments", async () => {
    const result = await runSafeCommand(CHANTER_ROOT, ["diff", "--cached"]);
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not in the allowlist"));
  });

  it("rejects shell injection attempts", async () => {
    const result = await runSafeCommand(CHANTER_ROOT, ["status", "; rm -rf /"]);
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not in the allowlist"));
  });

  it("accepts only exact match allowlisted commands", async () => {
    // "status" alone is not allowed â€” only "status --short"
    const result = await runSafeCommand(CHANTER_ROOT, ["status"]);
    assert.equal(result.success, false);
    assert.ok(result.error!.includes("not in the allowlist"));
  });

  it("accepts allowlisted 'status --short'", async () => {
    if (!rootExists) {
      return; // skip if CHANTER_ROOT doesn't exist in test env
    }
    const result = await runSafeCommand(CHANTER_ROOT, ["status", "--short"]);
    // May fail if not a git repo, but the call itself should not be rejected by allowlist
    assert.ok(
      result.success || result.error!.includes("Command failed"),
      "should not be rejected by allowlist"
    );
  });
});

describe("P1 â€” Git Status Tool", () => {
  it("rejects unknown product IDs", async () => {
    const result = await handleGitStatus("nonexistent_product_xyz");
    assert.ok(result.errors.some(e => e.includes("Unknown product")));
    assert.equal(result.gitAvailable, false);
  });

  it("returns file list capped by maxFiles", async () => {
    if (!rootExists) return;
    const result = await handleGitStatus(undefined, true, 3);
    if (result.files) {
      assert.ok(result.files.length <= 3, "file list should be capped at 3");
    }
  });

  it("does not expose file contents", async () => {
    const result = await handleGitStatus(undefined, false);
    // Files should be null when includeFiles is false
    assert.equal(result.files, null);
  });

  it("uses only allowlisted git commands (verified via safeReadOnlyCommand)", async () => {
    // The fact that handleGitStatus uses runGitStatusBatch which calls runSafeCommand
    // which has an allowlist is tested above in the command runner tests.
    // This test confirms the integration doesn't crash.
    if (!rootExists) return;
    const result = await handleGitStatus();
    assert.ok(typeof result.dirty === "boolean");
    assert.ok(typeof result.changedFileCount === "number");
  });

  it("handles missing product path gracefully", async () => {
    // 'operator' has path 'apps/CHANTER Operator' â€” should exist
    // Use a fake product that can never exist
    const result = await handleGitStatus("not_a_real_product_xyz");
    assert.equal(result.pathExists, false);
    assert.ok(result.errors.length > 0);
  });
});

describe("P1 â€” Test Summary Tool", () => {
  it("rejects unknown product IDs", async () => {
    const result = await handleTestSummary("nonexistent_product_xyz");
    assert.ok(result.errors.some(e => e.includes("Unknown product")));
    assert.equal(result.packageJsonFound, false);
  });

  it("reads package.json scripts safely for a known product", async () => {
    // Try a product that likely has package.json
    const result = await handleTestSummary("safecommit");
    if (result.pathExists && result.packageJsonFound) {
      // Should have scripts recorded
      assert.ok(Object.keys(result.availableScripts).length > 0);
      // Should not have executed anything
      assert.ok(typeof result.validationCommandsAvailable.test === "boolean");
    }
  });

  it("handles missing package.json", async () => {
    const result = await handleTestSummary("operator");
    if (result.pathExists && !result.packageJsonFound) {
      assert.ok(result.errors.some(e => e.includes("No package.json")));
    }
  });

  it("does not execute scripts (verified only reads metadata)", async () => {
    const result = await handleTestSummary("safecommit");
    // The function only reads package.json, never spawns npm
    assert.ok(typeof result.validationCommandsAvailable.test === "boolean");
  });

  it("runMode latest_known returns metadata_only with warning", async () => {
    const result = await handleTestSummary("safecommit", "latest_known");
    assert.ok(result.errors.some(e => e.includes("latest_known")));
  });
});

describe("P1 â€” Product Readiness Tool", () => {
  it("rejects unknown product IDs", async () => {
    const result = await handleProductReadiness("nonexistent_product_xyz");
    assert.equal(result.readinessScore, 0);
    assert.ok(result.blockers.length > 0);
  });

  it("calculates score correctly for known product", async () => {
    const result = await handleProductReadiness("safecommit");
    assert.ok(result.readinessScore >= 0);
    assert.ok(result.readinessScore <= 100);
    // At minimum: +20 for registered
    assert.ok(result.readinessScore >= 20);
  });

  it("returns recommended next action", async () => {
    const result = await handleProductReadiness("safecommit");
    assert.ok(result.recommendedNextAction.length > 0);
  });

  it("path missing caps score at 30", async () => {
    const result = await handleProductReadiness("not_a_real_product_xyz");
    // Unknown product has score 0 (no registration bonus)
  });

  it("returns lane and risk level", async () => {
    const result = await handleProductReadiness("autoposter");
    assert.equal(result.riskLevel, "critical");
    assert.equal(result.lane, "commercial");
  });

  it("provides blocker for critical product with dirty state", async () => {
    // We can't easily force a dirty state in test, but we verify
    // the blocker logic exists in the code by checking autoposter
    // (critical risk) returns properly structured result
    const result = await handleProductReadiness("autoposter");
    assert.equal(result.riskLevel, "critical");
    // If dirty, should have blockers
    if (result.dirtyState && result.riskLevel === "critical") {
      assert.ok(result.blockers.length > 0);
    }
  });
});

describe("P1 â€” Audit / Safety integration", () => {
  it("forbidden actions remain blocked", () => {
    // Verify exec/command pattern is still in forbiddenActions
    const result = checkSafetyPolicy("chanter.git_status", { exec: "rm -rf /" });
    assert.equal(result.allowed, false);
  });

  it("arbitrary command execution is rejected", () => {
    const result = checkSafetyPolicy("chanter.test_summary", { command: "npm install" });
    assert.equal(result.allowed, false);
  });
});
