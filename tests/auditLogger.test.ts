// Tests: Audit logger and redaction

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateRequestId, sanitizeInput } from "../src/audit/auditTypes.js";
import {
  redactSensitiveValues,
  isSensitiveKey,
} from "../src/safety/redaction.js";

describe("Audit Logger", () => {
  it("generates unique request IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateRequestId();
      assert.ok(id.startsWith("mcp-"));
      assert.ok(!ids.has(id), "duplicate request ID generated");
      ids.add(id);
    }
  });

  it("sanitizeInput truncates long values", () => {
    const long = "x".repeat(1000);
    const result = sanitizeInput(long);
    assert.ok(result.endsWith("[truncated]"));
    assert.ok(result.length < 600);
  });

  it("sanitizeInput handles non-serializable input", () => {
    const circular: Record<string, unknown> = {};
    (circular as any).self = circular;
    const result = sanitizeInput(circular);
    assert.equal(result, "[unserializable input]");
  });

  describe("redaction", () => {
    it("redacts bearer tokens", () => {
      const input = "Authorization: bearer abc123def456ghi789jkl";
      const result = redactSensitiveValues(input);
      assert.ok(!result.includes("abc123def456ghi789jkl"));
      assert.ok(result.includes("[REDACTED_TOKEN]"));
    });

    it("redacts sk- prefixed API keys", () => {
      const input = "key: sk-abcdefghijklmnopqrstuvwxyz123456";
      const result = redactSensitiveValues(input);
      assert.ok(result.includes("[REDACTED_API_KEY]"));
    });

    it("redacts JWT tokens", () => {
      const input = "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = redactSensitiveValues(input);
      assert.ok(result.includes("[REDACTED_JWT]"));
    });

    it("does not redact normal text", () => {
      const input = "This is a normal product description about autoposter and clean_engine.";
      const result = redactSensitiveValues(input);
      assert.equal(result, input);
    });

    it("does not redact short hex strings", () => {
      const input = "color: #ff9900 path: abc123";
      const result = redactSensitiveValues(input);
      assert.equal(result, input);
    });
  });

  describe("sensitive key detection", () => {
    it("detects token keys", () => {
      assert.ok(isSensitiveKey("token"));
      assert.ok(isSensitiveKey("API_TOKEN"));
      assert.ok(isSensitiveKey("access_token"));
    });

    it("detects password keys", () => {
      assert.ok(isSensitiveKey("password"));
      assert.ok(isSensitiveKey("PASSWORD"));
      assert.ok(isSensitiveKey("user_password"));
    });

    it("detects secret keys", () => {
      assert.ok(isSensitiveKey("secret"));
      assert.ok(isSensitiveKey("api_secret"));
      assert.ok(isSensitiveKey("secret_key"));
    });

    it("does not flag normal keys", () => {
      assert.equal(isSensitiveKey("username"), false);
      assert.equal(isSensitiveKey("display_name"), false);
      assert.equal(isSensitiveKey("product_id"), false);
      assert.equal(isSensitiveKey("risk_level"), false);
    });
  });
});
