# CHANTER MCP Server — Max Edition

**v0.5.0 — Checkpoints C1 through P3B Complete**

> Built for CHANTER internal use only. 17 MCP tools, 154 tests, 0 failures.

---

## Purpose

The CHANTER MCP Server is a **custom, safety-first control layer** for all CHANTER products. It exposes controlled, auditable tools through the Model Context Protocol (MCP), enabling AI assistants to inspect CHANTER systems, create dry-run proposals, and manage structured approval workflows — all without granting write access, execution access, or secret access.

## Checkpoint History

| Checkpoint | Version | Tools | Key Feature |
|-----------|---------|-------|-------------|
| C1 | 0.1.0 | 5 | Read-only registry foundation, audit logging |
| P1 | 0.2.0 | 8 | Git status, test inspection, readiness scoring |
| P2 | 0.3.0 | 12 | Dry-run proposals, risk classification, human review |
| P3A | 0.4.0 | 14 | Operator approval bridge, approval routes, evidence bundles |
| **P3B** | **0.5.0** | **17** | **SafeCommit review bridge, evidence bundles** |

---

## Product Registry (6 products)

| Product | Lane | Risk Level | Readiness |
|---------|------|------------|-----------|
| AutoPoster | commercial | critical | in_progress |
| Clean Engine | commercial | high | in_progress |
| Operator | internal_control | critical | planned |
| Loop Governor | internal_control | high | in_progress |
| SafeCommit | internal_control | high | operational |
| CHANTER Site | brand | medium | operational |

---

## All 17 MCP Tools

### Checkpoint 1 — Read-Only Foundation (5 tools)
| Tool | Level | Description |
|------|-------|-------------|
| `chanter.list_products` | read_public | List all CHANTER products |
| `chanter.get_product_status` | read_internal | Get product details by ID |
| `chanter.list_safe_tools` | read_public | List exposed tools and levels |
| `chanter.inspect_workspace` | read_internal | Check workspace directory presence |
| `chanter.get_readiness` | read_public | MCP server readiness checklist |

### P1 — System Intelligence (3 tools)
| Tool | Level | Description |
|------|-------|-------------|
| `chanter.git_status` | read_internal | Safe git status (allowlisted commands only) |
| `chanter.test_summary` | read_internal | Package.json script inspection (no execution) |
| `chanter.product_readiness` | read_internal | 0-100 readiness score |

### P2 — Dry-Run Proposals (4 tools)
| Tool | Level | Description |
|------|-------|-------------|
| `chanter.propose_action` | write_proposed | Create dry-run proposal with risk classification |
| `chanter.list_proposals` | read_internal | List proposals with filters |
| `chanter.get_proposal` | read_internal | Read proposal by ID |
| `chanter.review_proposal` | write_proposed | Record human review decision |

### P3A — Operator Approval Bridge (2 tools)
| Tool | Level | Description |
|------|-------|-------------|
| `chanter.get_approval_requirements` | read_internal | Approval routes, roles, gates, evidence bundle |
| `chanter.attach_operator_review` | write_proposed | Attach Operator review event (metadata only) |

### P3B — SafeCommit Review Bridge (3 tools)
| Tool | Level | Description |
|------|-------|-------------|
| `chanter.get_safecommit_requirements` | read_internal | SafeCommit requirements: triggers, validation checks, blockers |
| `chanter.attach_safecommit_review` | write_proposed | SafeCommit review: verdict, risk, checks, blockers |
| `chanter.get_proposal_evidence_bundle` | read_internal | Full evidence bundle: proposals, reviews, snapshots |

---

## Permission Model

| Level | Allowed? | Description |
|-------|----------|-------------|
| `read_public` | ✅ | Safe for any consumer |
| `read_internal` | ✅ | Internal read, no secrets |
| `write_proposed` | ✅ P2+ | Dry-run proposals and metadata-only reviews |
| `write_approved` | ❌ | Blocked until P4+ |
| `dangerous_forbidden` | ❌ | Permanently blocked |

---

## Proposal Lifecycle

```
draft → pending_approval → approved / rejected / needs_changes
                                  │
                    Operator review (P3A)
                    SafeCommit review (P3B)
                    Human review (P2)
                                  │
                    ▼ ALL lead to:
                    executionStatus: "not_executed"
                    Execution blocked until P4+
```

**Critical rule**: Approval is metadata only. No proposal has been executed. No product has been modified.

## Approval Architecture (P3A + P3B)

### Operator Approval Routes
- `founder_review` — critical risk, Operator product
- `operator_review` — high/critical risk, AutoPoster
- `safecommit_review` — SafeCommit product, commit-review actions
- `product_owner_review` — AutoPoster
- `blocked_for_p3_execution` — always applied

### Reviewer Roles
- founder, operator, safecommit, product_owner, system

### SafeCommit Review Model
**Review Statuses**: not_required, required, pending, passed_metadata_only, failed_metadata_only, needs_changes, blocked

**Verdicts**: safe_to_review, needs_changes, blocked, unsafe

**Detection Triggers**:
- `requiredGates.safecommit_review` is true
- `actionType` is `prepare_commit_review`
- `productId` is `safecommit`
- Keywords: code, commit, validation, git, repo, build, test, deploy, release, push, diff, review, patch, merge, branch

### Evidence Bundle
Contains: proposal summary, product metadata, risk classification, operator reviews, SafeCommit reviews, human reviews, git/validation/readiness snapshots (available flags only). No file contents, no diffs, no secrets, no raw logs.

---

## Command Allowlist (Safe Runner)

Only these exact git commands are allowed:
```
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
git log -1 --pretty=%s
```
Rejects: git diff, git push, git commit, arbitrary commands, shell injection. `shell: false` always.

---

## Readiness Scoring

0-100 score: +20 registered, +20 path exists, +20 git available, +20 clean tree, +20 validation scripts. Critical products with dirty tree trigger blockers. Score capped at 30 if path missing.

---

## Audit Log Format

Every tool call writes to `.mcp-audit/audit.jsonl`:
```json
{
  "timestamp": "2026-07-06T22:00:00.000Z",
  "toolName": "chanter.attach_safecommit_review",
  "permissionLevel": "write_proposed",
  "resultStatus": "success",
  "requestId": "mcp-xxxxx-yyyyy"
}
```
Redaction: bearer tokens, JWTs, API keys, long hex/base64 secrets.

---

## Proposal Store

Proposals persisted as individual JSON files in `.mcp-proposals/`. Path-safe IDs (`/^[a-zA-Z0-9\-_]+$/`), 30-day expiry, 1000-file limit.

---

## Safety Guarantees

- `executionStatus` always `not_executed`
- `write_approved` still blocked
- No commit, push, deploy, post, publish, delete
- No external API calls (TikTok, Vercel, Render, etc.)
- No secret/.env exposure
- No arbitrary command execution
- All review notes redacted
- Audit logging on all 17 tools

---

## Limitations (Current)

- No execution capability — all proposals are metadata only
- No git diff content — only git status summaries
- No test execution — only package.json script inspection
- Stdio transport only — no HTTP/SSE
- `.mcp-proposals/` needs periodic manual cleanup

---

## Future Roadmap

### P4 — Execution Layer
- write_approved tools with full safety gates
- Loop Governor integration as orchestration layer
- Actual controlled execution after human + Operator + SafeCommit approval
- Multi-step workflow execution with human checkpoints
- MCP tool call evidence bundles with live data

---

*Built for CHANTER. Safety first. Always metadata-only until proven safe.*
