# CHANTER MCP Server – Max Edition

**Checkpoint P1 – Read-Only System Intelligence**

> Version 0.2.0 | Built for CHANTER internal use only

---

## Purpose

The CHANTER MCP Server is a **custom, safety-first control layer** for all CHANTER products. It exposes controlled, auditable tools through the Model Context Protocol (MCP), enabling AI assistants to inspect CHANTER systems without granting write access, execution access, or secret access.

This is **not** a third-party MCP integration. This is CHANTER's own MCP server, purpose-built for the CHANTER product ecosystem.

## Why a Custom CHANTER MCP Server?

Third-party MCP servers grant broad filesystem access, allow arbitrary command execution, and cannot distinguish CHANTER product boundaries. A custom server gives us:

- **Product-aware tools** — every tool knows which CHANTER product it interacts with
- **Safety boundaries** — read-only by default, with explicit permission gates for any future write actions
- **Audit trail** — every MCP call is logged with structured metadata
- **CHANTER-specific policy** — forbidden actions (post, publish, deploy, commit, delete) are enforced at the protocol level
- **Extensibility** — new tools can be added with defined permission levels and safety review
- **Safe command execution** — P1 adds an allowlisted git command runner with zero shell exposure

## Checkpoint Summary

| Checkpoint | Version | Tools | Key Feature |
|-----------|---------|-------|-------------|
| C1 | 0.1.0 | 5 tools | Read-only registry foundation, audit logging |
| **P1** | **0.2.0** | **8 tools** | **Git status, test inspection, readiness scoring** |
| P2 | future | TBD | Dry-run proposals, Operator/SafeCommit integration |

## P1 — What's New

Checkpoint P1 upgrades the server from static registry metadata into a real read-only inspection layer:

1. **Safe Command Runner** (`src/safety/safeReadOnlyCommand.ts`)
   - Only accepts hardcoded allowlisted git commands
   - Never uses `shell:true`
   - Never accepts user-provided command fragments
   - Capped output (50KB), timeout (10s)
   - Full argument-level validation

2. **Git Status** (`chanter.git_status`)
   - Branch, commit hash, last message, dirty/clean state
   - Changed file count and optional file list (capped)
   - Works per-product or on workspace root

3. **Test Summary** (`chanter.test_summary`)
   - Inspects package.json scripts (never executes them)
   - Shows test, build, typecheck, lint, dev command availability
   - Redacts sensitive script values

4. **Product Readiness** (`chanter.product_readiness`)
   - 0-100 score: registration (+20), path (+20), git (+20), clean tree (+20), validation (+20)
   - Critical products with dirty state trigger blockers
   - Missing path caps score at 30

## Product Registry

The server maintains a typed registry of 6 CHANTER products:

| Product | Lane | Risk Level | Readiness |
|---------|------|------------|-----------|
| AutoPoster | commercial | critical | in_progress |
| Clean Engine | commercial | high | in_progress |
| Operator | internal_control | critical | planned |
| Loop Governor | internal_control | high | in_progress |
| SafeCommit | internal_control | high | operational |
| CHANTER Site | brand | medium | operational |

## Exposed MCP Tools (Checkpoint P1)

All 8 tools are **read-only** (`read_public` or `read_internal`):

### Checkpoint 1 Tools

| Tool | Level | Description |
|------|-------|-------------|
| `chanter.list_products` | read_public | List all CHANTER products with summary metadata |
| `chanter.get_product_status` | read_internal | Get detailed status for a specific product |
| `chanter.list_safe_tools` | read_public | List all exposed tools and their permission levels |
| `chanter.inspect_workspace` | read_internal | Check high-level workspace directory presence |
| `chanter.get_readiness` | read_public | Get MCP server readiness checklist |

### P1: System Intelligence Tools

| Tool | Level | Description |
|------|-------|-------------|
| `chanter.git_status` | read_internal | Safe git status summary (branch, commit, dirty state, file list) |
| `chanter.test_summary` | read_internal | Inspect package.json scripts without executing anything |
| `chanter.product_readiness` | read_internal | Product readiness score with git, validation, and registry assessment |

## Command Allowlist (Safe Runner)

Only these exact git commands are allowed. All others are rejected:

```
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git log -1 --pretty=%s
```

**NOT allowed**: `git diff`, `git push`, `git commit`, `git checkout`, `git merge`, arbitrary shell commands, any command not in the exact allowlist.

Key safety properties:
- `shell: false` — never spawns a shell
- `windowsHide: true` — no console windows
- Argument-level matching — `["push"]` or `["status"]` alone are NOT allowlisted
- Output capped at 50KB
- 10-second timeout per command

## Readiness Scoring

`chanter.product_readiness` produces a 0-100 score:

| Criterion | Points | Condition |
|-----------|--------|-----------|
| Product registered | +20 | Always (products in registry) |
| Path exists | +20 | Directory found on disk |
| Git status available | +20 | git repo detected at path |
| Clean working tree | +20 | No uncommitted changes |
| Validation scripts | +20 | test/build/typecheck in package.json |

Blockers: critical-risk products with dirty working tree produce a blocker.
Score cap: products with missing path are capped at 30.

## No-Test-Execution Limitation

`chanter.test_summary` with `runMode: "metadata_only"` (default) only reads package.json. It never runs `npm test`. The `runMode: "latest_known"` option is reserved for future cached output readers — calling it today returns metadata-only with a warning.

## Audit Log Format

Every MCP tool call produces a structured audit event in `.mcp-audit/audit.jsonl`:

```json
{
  "timestamp": "2026-07-06T17:00:00.000Z",
  "toolName": "chanter.git_status",
  "permissionLevel": "read_internal",
  "productId": "safecommit",
  "inputSummary": "{}",
  "resultStatus": "success",
  "safetyNotes": ["read-only checkpoint: allowed", "permission level: read_internal"],
  "requestId": "mcp-xxxxx-yyyyy"
}
```

**Redaction**: Sensitive values (tokens, passwords, API keys, bearer strings, JWTs, long hex/base64 secrets) are automatically redacted from audit logs.

## Example Outputs

### chanter.git_status (SafeCommit)
```json
{
  "productId": "safecommit",
  "displayName": "SafeCommit",
  "branch": "main",
  "shortCommit": "a3f2b1c",
  "dirty": false,
  "changedFileCount": 0,
  "lastMessage": "Initial SafeCommit checkpoint"
}
```

### chanter.test_summary (SafeCommit)
```json
{
  "productId": "safecommit",
  "packageJsonFound": true,
  "availableScripts": {
    "test": "node --test dist/tests/**/*.test.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "validationCommandsAvailable": {
    "test": true,
    "build": true,
    "typecheck": true
  }
}
```

### chanter.product_readiness (SafeCommit)
```json
{
  "productId": "safecommit",
  "displayName": "SafeCommit",
  "readinessScore": 100,
  "blockers": [],
  "recommendedNextAction": "Product SafeCommit is ready for inspection..."
}
```

## Current Limitations (Checkpoint P1)

- **No write tools** — All tools are read-only
- **No test execution** — Package.json inspection only, no `npm test` runs
- **No diff content** — git_status shows file list, not diff contents
- **No HTTP/SSE transport** — Stdio only
- **No external APIs** — Does not call TikTok, Vercel, Render, or any third-party service
- **Latest known results** — Not yet implemented; reserved for future cached output readers

## Future Roadmap

### P2 – Proposal & Approval Integration

- Dry-run action proposals (what would happen, no execution)
- Operator approval integration (approve/reject proposals through Operator)
- SafeCommit review integration (review proposals before any action)

### P3 – Approved Write Tools

- Approved write tools only after human confirmation
- AutoPoster campaign proposal (structure only, no live post)
- Clean Engine job proposal (configuration only, no destructive file changes)

### P4 – Orchestration Layer

- Loop Governor integration as orchestration layer
- MCP tool call evidence bundles (audit + logs + diffs)
- Multi-step workflows with human checkpoints

---

## Getting Started

```bash
cd apps/chanter-mcp-server
npm install
npm run build
npm start
```

The server runs over **stdio** — connect any MCP-compatible client.

### MCP Client Configuration Example

```json
{
  "mcpServers": {
    "chanter": {
      "command": "node",
      "args": ["apps/chanter-mcp-server/dist/src/index.js"],
      "cwd": "/path/to/CHANTER"
    }
  }
}
```

---

*Built for CHANTER. Safety first. Always read-only until proven safe.*
