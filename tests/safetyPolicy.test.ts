// Tests: Safety policy and forbidden action detection

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkSafetyPolicy, rejectionResponse } from "../src/safety/policy.js";
import { detectForbiddenAction } from "../src/safety/forbiddenActions.js";
import { handleGetProductStatus } from "../src/tools/getProductStatus.js";
import { handleGetReadiness } from "../src/tools/getReadiness.js";

describe("Safety Policy", () => {
  it("allows registered read-only tools", () => {
    const result = checkSafetyPolicy("chanter.list_products", {});
    assert.equal(result.allowed, true);
    assert.ok(result.notes.some((n) => n.includes("read-only checkpoint")));
  });

  it("rejects unregistered tools", () => {
    const result = checkSafetyPolicy("chanter.delete_everything", {});
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("not registered"));
  });

  it("rejects tools with forbidden action patterns in input", () => {
    const result = checkSafetyPolicy("chanter.get_product_status", {
      action: "deploy to production",
    });
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("Forbidden action"));
  });

  it("detects forbidden commit action", () => {
    const match = detectForbiddenAction("chanter.some_tool", "commit all changes");
    assert.ok(match);
    assert.equal(match.category, "vcs");
  });

  it("detects forbidden deploy action", () => {
    const match = detectForbiddenAction("chanter.some_tool", "deploy to production now");
    assert.ok(match);
    assert.equal(match.category, "deployment");
  });

  it("detects forbidden post/publish action", () => {
    assert.ok(detectForbiddenAction("chanter.some_tool", "post to tiktok"));
    assert.ok(detectForbiddenAction("chanter.some_tool", "publish campaign"));
  });

  it("detects forbidden delete action", () => {
    const match = detectForbiddenAction("chanter.some_tool", "delete all files");
    assert.ok(match);
    assert.equal(match.category, "destructive");
  });

  it("detects forbidden token/secret access", () => {
    assert.ok(detectForbiddenAction("chanter.some_tool", "get token_access for api"));
    assert.ok(detectForbiddenAction("chanter.some_tool", "request secret_access"));
  });

  it("detects forbidden exec/command", () => {
    assert.ok(detectForbiddenAction("chanter.some_tool", "exec arbitrary script"));
    assert.ok(detectForbiddenAction("chanter.some_tool", "run command on server"));
  });

  it("does not flag safe inputs", () => {
    const result = detectForbiddenAction("chanter.list_products", "list all products");
    assert.equal(result, null);
  });

  it("rejectionResponse includes policy info", () => {
    const resp = rejectionResponse("chanter.bad_tool", "test reason", ["note1"]);
    const parsed = JSON.parse(resp);
    assert.equal(parsed.blocked, true);
    assert.ok(parsed.reason.includes("test reason"));
    assert.ok(parsed.policy.includes("CHANTER MCP Server"));
    assert.deepEqual(parsed.safetyNotes, ["note1"]);
  });

  it("get_product_status rejects unknown product IDs", async () => {
    const result = await handleGetProductStatus("nonexistent_product_xyz");
    assert.equal(result.found, false);
    assert.ok(result.error!.includes("Unknown product"));
  });

  it("get_product_status returns known product", async () => {
    const result = await handleGetProductStatus("autoposter");
    assert.equal(result.found, true);
    assert.equal(result.product!.id, "autoposter");
    assert.equal(result.product!.displayName, "AutoPoster");
  });

  it("get_readiness returns safe defaults", async () => {
    const result = await handleGetReadiness();
    assert.ok(result.server.name.includes("CHANTER MCP Server"));
    assert.ok(result.server.checkpoint.includes("Read-Only Foundation"));
    assert.equal(result.safetyStatus.allToolsReadOnly, true);
    assert.equal(result.auditEnabled, true);
    assert.ok(result.products.length >= 6);
  });
});
