// Tests: Product registry validation

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHANTER_PRODUCTS, validateProductRegistry } from "../src/registry/products.js";

describe("Product Registry", () => {
  it("contains all 6 expected products", () => {
    const ids = Object.keys(CHANTER_PRODUCTS);
    assert.equal(ids.length, 6, "should have exactly 6 products");
    assert.ok(CHANTER_PRODUCTS.autoposter, "missing autoposter");
    assert.ok(CHANTER_PRODUCTS.clean_engine, "missing clean_engine");
    assert.ok(CHANTER_PRODUCTS.operator, "missing operator");
    assert.ok(CHANTER_PRODUCTS.loop_governor, "missing loop_governor");
    assert.ok(CHANTER_PRODUCTS.safecommit, "missing safecommit");
    assert.ok(CHANTER_PRODUCTS.chanter_site, "missing chanter_site");
  });

  it("validates product registry with no missing products", () => {
    const missing = validateProductRegistry();
    assert.deepEqual(missing, [], "no products should be missing");
  });

  it("every product has required fields", () => {
    for (const [id, product] of Object.entries(CHANTER_PRODUCTS)) {
      assert.ok(product.id, `${id}: missing id`);
      assert.ok(product.displayName, `${id}: missing displayName`);
      assert.ok(product.lane, `${id}: missing lane`);
      assert.ok(product.riskLevel, `${id}: missing riskLevel`);
      assert.ok(Array.isArray(product.forbiddenActions), `${id}: forbiddenActions not an array`);
      assert.ok(Array.isArray(product.futureToolIdeas), `${id}: futureToolIdeas not an array`);
      assert.ok(
        ["planned", "in_progress", "operational", "paused"].includes(product.readiness),
        `${id}: invalid readiness "${product.readiness}"`
      );
    }
  });

  it("every product has valid risk level", () => {
    const validLevels = ["low", "medium", "high", "critical"];
    for (const [id, product] of Object.entries(CHANTER_PRODUCTS)) {
      assert.ok(
        validLevels.includes(product.riskLevel),
        `${id}: invalid risk level "${product.riskLevel}"`
      );
    }
  });

  it("every product has valid lane", () => {
    const validLanes = ["commercial", "internal_control", "infrastructure", "brand"];
    for (const [id, product] of Object.entries(CHANTER_PRODUCTS)) {
      assert.ok(
        validLanes.includes(product.lane),
        `${id}: invalid lane "${product.lane}"`
      );
    }
  });
});
