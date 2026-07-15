# CHANTER MCP Server — Max Edition

**v0.6.0 — Checkpoints C1 through P3B Complete; P4 AutoPoster reads use Agent Runtime and the production-impacting schedule write uses Operator durable authority.**

> Built for CHANTER internal use only. 21 MCP tools and 208 passing tests in the complete isolated suite recorded on 2026-07-15.

---

## Purpose

The CHANTER MCP Server is a **custom, safety-first control layer** for all CHANTER products. It exposes controlled, auditable tools through the Model Context Protocol (MCP), enabling AI assistants to inspect CHANTER systems, create dry-run proposals, and manage structured approval workflows. Almost all tools grant no write access, execution access, or secret access. The one documented exception is `chanter.autoposter_schedule_post` (see "P4 — AutoPoster Runtime Control"), which submits a real schedule mission to the loopback Operator Mission Gateway. Operator owns durable identity, approval, replay, and downstream Runtime execution; MCP is only the thin client.

## Checkpoint History

| Checkpoint | Version | Tools | Key Feature |
|-----------|---------|-------|-------------|
| C1 | 0.1.0 | 5 | Read-only registry foundation, audit logging |
| P1 | 0.2.0 | 8 | Git status, test inspection, readiness scoring |
| P2 | 0.3.0 | 12 | Dry-run proposals, risk classification, human review |
| P3A | 0.4.0 | 14 | Operator approval bridge, approval routes, evidence bundles |
| P3B | 0.5.0 | 17 | SafeCommit review bridge, evidence bundles |
| **P4** | **0.6.0** | **21** | **Three AutoPoster reads through Agent Runtime plus one approval-gated schedule write through Operator durable authority** |

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

## All 21 MCP Tools

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
| `chanter.attach_safecommit_review` | write_proposed | Record a **self-reported** SafeCommit-style verdict, risk, checks, blockers. Advisory only — see warning below. |
| `chanter.get_proposal_evidence_bundle` | read_internal | Full evidence bundle: proposals, reviews, snapshots |

### P4 — AutoPoster Runtime Control (4 tools)
Unlike every tool above, these four do not go through the Proposal Store. The gateway (`src/runtime/autoposterGateway.ts`) has an explicit three-action read allowlist that executes through `chanter-agent-runtime`. The schedule write is routed only to the loopback Operator Mission Gateway; MCP does not own write idempotency, approval state, durable records, or downstream execution.

| Tool | Level | Description |
|------|-------|-------------|
| `chanter.autoposter_list_queue` | read_internal | List AutoPoster queue items via the Agent Runtime. Real read, no mutation. |
| `chanter.autoposter_get_post_status` | read_internal | Get one post's normalized queue/publishing status via the Agent Runtime. Real read, no mutation. |
| `chanter.autoposter_validate_media` | read_internal | Validate media against AutoPoster's real video-only policy via the Agent Runtime. Real read, no mutation. |
| `chanter.autoposter_schedule_post` | **write_runtime_gated** | Submits one schedule mission to Operator and cannot approve it. Optional stable `missionId` and `traceId` are forwarded unchanged; `requestedBy` defaults to `mcp-client`. A new submission returns `201`/`replayed:false` as `approval_required` with zero downstream writes; an exact replay returns `200`/`replayed:true`; a binding mismatch returns typed `409` with no prior result/evidence leakage. An independent human/Operator control must approve before Operator may delegate the downstream Agent Runtime write, which creates at most one unapproved queue item and can never publish. |

See `apps\chanter-agent-runtime\docs\AUTOPOSTER_CONTROL_LOOP.md` for the downstream Runtime/AutoPoster adapter contract and the separate AutoPoster publish-approval checkpoint.

---

## Permission Model

| Level | Allowed? | Description |
|-------|----------|-------------|
| `read_public` | ✅ | Safe for any consumer |
| `read_internal` | ✅ | Internal read, no secrets |
| `write_proposed` | ✅ P2+ | Dry-run proposals and metadata-only reviews — never executed |
| `write_runtime_gated` | ✅ P4 | Real write intent accepted only through Operator durable authority. MCP is a loopback thin client; Operator owns mission identity, approval, replay, and delegation to Agent Runtime. Used by exactly one tool: `chanter.autoposter_schedule_post`. |
| `write_approved` | ❌ | Still fully blocked — no tool in the registry uses this level |
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

**Critical rule (Proposal Store lifecycle only)**: within this dry-run proposal system (`chanter.propose_action`, `chanter.review_proposal`, and the Operator/SafeCommit review-attachment tools), approval is metadata only. No proposal in `.mcp-proposals/` has been executed, and this lifecycle alone cannot modify a product. This rule does not extend to `chanter.autoposter_schedule_post`, which does not use the Proposal Store at all — see "P4 — AutoPoster Runtime Control" above and "Runtime Approval Gate" below.

## Approval Architecture (P3A + P3B + P4)

### Operator Approval Routes
- `founder_review` — critical risk, Operator product
- `operator_review` — high/critical risk, AutoPoster
- `safecommit_review` — SafeCommit product, commit-review actions
- `product_owner_review` — AutoPoster
- `blocked_for_p3_execution` — always applied

### Reviewer Roles
- founder, operator, safecommit, product_owner, system

### SafeCommit Review Model
**⚠️ Self-reported, not a real safety gate.** `chanter.attach_safecommit_review` records whatever `verdict`/`riskLevel` the *caller* supplies — it does not invoke SafeCommit, does not run any validation itself, and does not check that the claimed verdict is accurate. There is currently no code path in this server that calls real SafeCommit. Every reviewer name, verdict, and risk level in this model is caller-asserted metadata. Downstream products and automation (Operator, Loop Governor, or any agent reading a proposal's evidence bundle) **must treat this data as advisory only** and must not use it as proof that a real SafeCommit review occurred, until a genuine SafeCommit integration exists (tracked for P4+).

**Review Statuses**: not_required, required, pending, passed_metadata_only, failed_metadata_only, needs_changes, blocked

**Verdicts**: safe_to_review, needs_changes, blocked, unsafe

**Detection Triggers**:
- `requiredGates.safecommit_review` is true
- `actionType` is `prepare_commit_review`
- `productId` is `safecommit`
- Keywords: code, commit, validation, git, repo, build, test, deploy, release, push, diff, review, patch, merge, branch

### Operator Runtime Approval Gate (P4, AutoPoster scheduling only)
Separate from the metadata-only proposal review routes above. `chanter.autoposter_schedule_post` creates or exactly replays a durable Operator mission. Every new MCP submission remains `approval_required` and performs zero downstream writes. The MCP schema has no approval field, the handler does not map approval data, and the production Operator client never calls an approval endpoint. Approval belongs to an independent human/Operator control capability outside MCP; after that control persists approval and Operator delegates execution, an exact MCP replay can truthfully return the durable result and approval lineage. Raw exact replay never retries a denied write. Recovery from a non-success result requires an explicit governed reconcile/resume action outside this MCP create path. Approval authorizes scheduling only: it cannot trigger AutoPoster's later publish step.

### Operator Client Configuration
- `OPERATOR_BASE_URL` — required for schedule writes; must be a plain HTTP loopback origin (`127.0.0.1`, `localhost`, or `::1`) with no path, credentials, query, or fragment
- `OPERATOR_MISSION_SUBMIT_TOKEN` — required submission-only capability token sent only to Operator; do not configure an Operator approval/control token in MCP
- `OPERATOR_TIMEOUT_MS` — optional positive timeout; default 30 seconds
- `CHANTER_MCP_PROPOSALS_DIR` / `CHANTER_MCP_AUDIT_DIR` — optional storage-root overrides used for isolated test and operator-controlled runs; existing defaults remain unchanged

The client rejects redirects on submission requests. Successful responses are accepted only when the outer durable mission and nested Runtime result match the requested identity, scope, actor, payload, action, idempotency binding, and array contracts; invalid responses fail closed without output or evidence.

### Evidence Bundle
Contains: proposal summary, product metadata, risk classification, operator reviews, SafeCommit reviews, human reviews, git/validation/readiness snapshots (available flags only). No file contents, no diffs, no secrets, no raw logs. (The AutoPoster Runtime Control tools above use a separate `RuntimeMissionResult`/evidence shape, not this bundle — see `chanter-agent-runtime`'s own evidence documentation.)

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

- Proposal Store tools: `executionStatus` always `not_executed`
- `write_approved` still fully blocked — no tool uses it
- Exactly one tool, `chanter.autoposter_schedule_post` (`write_runtime_gated`), can submit a request for a real write. It must go through loopback Operator authority, which durably owns identity, approval, replay, and downstream execution. MCP cannot approve and never calls the AutoPoster write port.
- No external provider API calls originate from MCP itself. Reads call Agent Runtime; the schedule write calls loopback Operator only.
- No secret/.env exposure
- No arbitrary command execution
- All review notes redacted
- Audit logging: all 21 named tool cases in `src/server.ts`'s single `CallToolRequestSchema` dispatch handler route through a shared success/mission-error/catch-block path that calls `logCall()` (`src/audit/auditLogger.ts`) before returning a response. Verified by direct code inspection of that dispatch handler in this pass, not by a dedicated audit-logging test — no test file under `tests/` asserts on `audit.jsonl` contents as of this pass.
- `chanter.attach_safecommit_review` verdicts are self-reported by the caller, not independently verified by a real SafeCommit run — the tool description, permission registry, requirements warning, and stored review event (`selfReported: true`) all say so. Treat as advisory only.

---

## Limitations (Current)

- The dry-run Proposal Store (`chanter.propose_action`, `chanter.review_proposal`, Operator/SafeCommit review attachments) has no execution capability — those proposals remain metadata only.
- One exception exists: `chanter.autoposter_schedule_post` submits a real, approval-gated AutoPoster queue-scheduling mission to Operator. MCP cannot approve it; only an independent Operator control may authorize Operator to delegate to Agent Runtime. The flow cannot publish, push code, deploy, or bypass AutoPoster's separate publish approval.
- No git diff content — only git status summaries
- The exposed `chanter.test_summary` tool inspects package metadata only and never executes tests. Repository validation is separate: `npm test` passed 208/208 with isolated proposal/audit roots on 2026-07-15.
- Stdio transport only — no HTTP/SSE
- `.mcp-proposals/` needs periodic manual cleanup

---

## Future Roadmap

### P4 — AutoPoster Runtime Control (implemented and documented, narrowly scoped)
A scoped slice of real execution is implemented and documented: `chanter.autoposter_schedule_post` (`write_runtime_gated`) submits to Operator durable authority, which alone may delegate the approval-gated Agent Runtime schedule action. This is not the general execution layer described below: `write_approved` remains fully blocked, and no product other than AutoPoster has an equivalent write path.

### Future — General Execution Layer
- `write_approved` tools with full safety gates, extending real execution beyond the single AutoPoster scheduling exception
- Loop Governor integration as orchestration layer
- Controlled execution after human + Operator + SafeCommit approval, for products beyond AutoPoster
- Multi-step workflow execution with human checkpoints
- MCP tool call evidence bundles with live data

---

*Built for CHANTER. Safety first. Metadata-only by default; the one AutoPoster scheduling exception is narrowly scoped, routed through Operator durable authority, and unable to publish.*
