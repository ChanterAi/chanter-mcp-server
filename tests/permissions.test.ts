// Permission model validation tests.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERMISSIONS,
  isSafeLevel,
  validateReadOnly,
  FUTURE_WRITE_TOOL_REQUIREMENTS,
} from "../src/registry/permissions.js";
import { EXPOSED_TOOLS } from "../src/registry/tools.js";

describe("Permission Model", () => {
  it("every exposed tool has a permission entry", () => {
    for (const tool of EXPOSED_TOOLS) {
      assert.ok(
        PERMISSIONS[tool.name],
        `tool "${tool.name}" is not in PERMISSIONS registry`
      );
    }
  });

  it("every permission entry matches an exposed tool", () => {
    const exposedNames = new Set(EXPOSED_TOOLS.map((t) => t.name));
    for (const name of Object.keys(PERMISSIONS)) {
      assert.ok(exposedNames.has(name), `PERMISSIONS entry "${name}" has no matching exposed tool`);
    }
  });

  it("no exposed tool has write or dangerous permission level", () => {
    const violations = validateReadOnly();
    assert.deepEqual(violations, [], `found write/dangerous tools: ${violations.join(", ")}`);
  });

  it("isSafeLevel rejects write/dangerous levels", () => {
    assert.ok(isSafeLevel("read_public"));
    assert.ok(isSafeLevel("read_internal"));
    assert.ok(isSafeLevel("write_proposed"), "write_proposed should be safe in P2");
    assert.equal(isSafeLevel("write_approved"), false);
    assert.equal(isSafeLevel("dangerous_forbidden"), false);
  });

  it("every exposed tool is safe-level or runtime-gated; only the schedule tool is runtime-gated", () => {
    for (const tool of EXPOSED_TOOLS) {
      const perm = PERMISSIONS[tool.name];
      assert.ok(perm, `${tool.name}: no permission entry`);
      assert.ok(
        isSafeLevel(perm.level) || perm.level === "write_runtime_gated",
        `${tool.name}: level ${perm.level} is not allowed`
      );
    }
    const runtimeGated = EXPOSED_TOOLS.filter(
      (tool) => PERMISSIONS[tool.name]?.level === "write_runtime_gated"
    );
    assert.deepEqual(
      runtimeGated.map((tool) => tool.name),
      ["chanter.autoposter_schedule_post"],
      "write_runtime_gated is reserved for the runtime-gated schedule tool"
    );
    assert.equal(PERMISSIONS["chanter.autoposter_schedule_post"]!.requiresApproval, true);
    assert.equal(PERMISSIONS["chanter.autoposter_schedule_post"]!.requiresOperatorGate, true);
  });

  it("future write tool requirements specify all gates", () => {
    assert.equal(FUTURE_WRITE_TOOL_REQUIREMENTS.explicitHumanApproval, true);
    assert.equal(FUTURE_WRITE_TOOL_REQUIREMENTS.auditEntry, true);
    assert.equal(FUTURE_WRITE_TOOL_REQUIREMENTS.dryRunPreview, true);
    assert.equal(FUTURE_WRITE_TOOL_REQUIREMENTS.safeCommitReviewGate, true);
    assert.equal(FUTURE_WRITE_TOOL_REQUIREMENTS.operatorApprovalGate, true);
  });
});
