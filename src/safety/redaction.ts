import * as path from "path";

const SENSITIVE_KEYS = [
  "token",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "api_secret",
  "bearer",
  "authorization",
  "auth",
  "credential",
  "private_key",
  "privatekey",
  "access_key",
  "accesskey",
  "secret_key",
  "secretkey",
];

const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  // Provider upload/resumable-session locators are bearer capabilities.
  [/https?:\/\/[^\s"'<>]*(?:upload|resumable)[^\s"'<>]*/gi, "[REDACTED_PROVIDER_LOCATOR]"],
  // Bearer tokens
  [/(?:bearer\s+)([\w\-\.]+)/gi, "bearer [REDACTED_TOKEN]"],
  // API key patterns (sk-..., key-..., etc.)
  [/(?:sk|key|api|pat)-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]"],
  // Long hex strings that look like secrets (>32 chars)
  [/\b[a-fA-F0-9]{48,}\b/g, "[REDACTED_HEX_SECRET]"],
  // JWT tokens (three dot-separated base64 segments)
  [/\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g, "[REDACTED_JWT]"],
];

/**
 * Redact sensitive values from a string.
 */
export function redactSensitiveValues(input: string): string {
  let result = input;

  // Decode only for detection. If an encoded locator is present, replace the
  // complete diagnostic so no differently encoded fragment can escape.
  const candidates = [input];
  try { candidates.push(decodeURIComponent(input)); } catch { /* malformed encoding is left for ordinary redaction */ }
  for (const token of input.split(/[^A-Za-z0-9+/=_-]+/)) {
    if (token.length < 20 || token.length > 8192) continue;
    try { candidates.push(Buffer.from(token, "base64").toString("utf8")); } catch { /* not base64 */ }
  }
  if (candidates.some(value => /https?:\/\/[^\s"'<>]*(?:upload|resumable)[^\s"'<>]*/i.test(value))) {
    return "[REDACTED_PROVIDER_LOCATOR]";
  }

  // Pattern-based redaction
  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Also redact long base64-like strings (>60 chars) as a secondary check
  result = result.replace(/\b[A-Za-z0-9+/=]{60,}\b/g, "[REDACTED_BASE64_SECRET]");

  return result;
}

/**
 * Check if a key name looks like a sensitive field.
 */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[\-_]/g, "");
  return SENSITIVE_KEYS.some((sk) => lower.includes(sk));
}
