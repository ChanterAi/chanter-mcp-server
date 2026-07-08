# MCP Server R-01 Verification Report

**Date:** 2026-07-08
**Auditor:** CHANTER AIM Execution Team
**Source of truth:** `CHANTER_AUDIT_REPORT.md` (2026-07-08, repo-root) — R-01 (HIGH): *"`src/tools/attachSafecommitReview.ts` still accepts a caller-supplied `verdict`/`riskLevel`, validates only enum membership, and stores it verbatim — no code path invokes real SafeCommit... Treat `chanter.attach_safecommit_review`'s output as self-reported metadata only, never as a real safety gate, in any downstream automation, until R-01 is closed."*
**Repo:** `apps/chanter-mcp-server`
**Scope:** R-01 only. No new MCP tools added. `insert-p3b.js`/`insert-p3b.mjs` were read for context, never executed. No deploy, no push (repo has no remote configured — confirmed via `git remote -v`).

---

## Executive Summary

**R-01: TRUE — confirmed as described, on every surface checked.** `chanter.attach_safecommit_review` accepts a caller-supplied `verdict`/`riskLevel`, validates only enum membership, and stores the input verbatim. No code path anywhere in this server invokes real SafeCommit. The one existing safety rail (`executionStatus` hardcoded to `"not_executed"`) limits blast radius but does not disclose *verdict provenance* — nothing told a caller or a downstream reader that the verdict itself was unverified self-attestation rather than a real review outcome.

**Fix applied (smallest safe scope — wording, one new type field, one new output field, docs, tests only):** every surface that shows this tool's identity or output now says, explicitly, that the verdict is self-reported and not independently verified. No verdict logic, validation, storage mechanism, or tool surface was changed. No new tools were added.

**Validation: all green.** `npm run typecheck` clean, `npm test` 159/159 pass (154 pre-existing + 5 new, zero regressions), `npm run build` clean, `git diff --check` clean. Working tree has exactly 7 modified files, all intentional.

---

## 1. R-01 Claim Verification

### 1a. Does it accept caller-supplied `verdict`/`riskLevel`? — **CONFIRMED TRUE**

[src/tools/attachSafecommitReview.ts:17-25](src/tools/attachSafecommitReview.ts) — `AttachSafecommitReviewInput.verdict: string` and `.riskLevel: string` are read directly from the MCP tool call arguments (see dispatch at [src/server.ts:71](src/server.ts): `verdict: a.verdict as string, riskLevel: a.riskLevel as string`).

[src/tools/attachSafecommitReview.ts:43-51](src/tools/attachSafecommitReview.ts) — the *only* validation performed is enum-membership against `VALID_VERDICTS`/`VALID_RISK_LEVELS`. There is no lookup, no external call, no cross-check against any real review process — any caller who supplies one of the four allowed verdict strings and one of the four allowed risk-level strings passes.

### 1b. Does it store self-reported output verbatim? — **CONFIRMED TRUE**

[src/tools/attachSafecommitReview.ts:69-77](src/tools/attachSafecommitReview.ts) (pre-fix line numbers; now 69-78) builds `reviewEvent` directly from the caller's input (reviewer/verdict/riskLevel/notes/validationChecks/blockers — only light PII/secret redaction via `redactSensitiveValues`, no fact-checking), then [line 89](src/tools/attachSafecommitReview.ts) pushes it verbatim onto `proposal.safetyNotes` as `SAFECOMMIT_REVIEW:${JSON.stringify(reviewEvent)}`. This is later surfaced unmodified via `chanter.get_proposal_evidence_bundle`'s `safecommitReview.reviews[]` / `latestVerdict` ([src/tools/getProposalEvidenceBundle.ts:56-60](src/tools/getProposalEvidenceBundle.ts)) — i.e., the unverified claim propagates to the exact artifact downstream products are meant to read for evidence.

### 1c. Does anything invoke real SafeCommit? — **CONFIRMED: NO**

Searched the full `attachSafecommitReview.ts` module and its imports (`proposalStore`, `redaction`, `safecommitTypes`) for any process spawn, HTTP call, or cross-repo reference to the actual `chanter-SafeCommit` product. None exists. `chanter-SafeCommit` is a completely separate repo (confirmed present at `apps/chanter-SafeCommit` per `CHANTER_AUDIT_REPORT.md`) with no `file:`/import dependency from `chanter-mcp-server` — this MCP server has no code path capable of running it.

### 1d. Did output/docs clearly say advisory/self-reported/not-real-verification, before this fix? — **CONFIRMED: NO**

Every surface a caller or downstream reader could see was checked and, prior to this fix, none disclosed verdict provenance (all said only that the tool doesn't *execute*, which is a different guarantee than "the verdict is unverified"):

| Surface | Pre-fix text | Said "self-reported / not verified"? |
|---|---|---|
| Tool description ([src/registry/tools.ts:66](src/registry/tools.ts), surfaced via `chanter.list_safe_tools`) | "Attach SafeCommit review metadata. Does NOT commit or execute." | No — only disclaims execution |
| Permission registry description ([src/registry/permissions.ts:24](src/registry/permissions.ts)) | "Attach SafeCommit review." | No |
| Tool's own return value (`AttachSafecommitReviewResult`) | `{success, proposalId, reviewStatus, verdict, executionStatus}` | No field addressed it at all |
| `chanter.get_safecommit_requirements`'s `warning` field ([src/tools/getSafecommitRequirements.ts:63](src/tools/getSafecommitRequirements.ts)) | "SafeCommit review is metadata only. It does NOT authorize commit, push, or execution..." | No — only disclaims execution authority |
| `docs/CHANTER_MCP_SERVER.md` (P3B table row + "SafeCommit Review Model" section) | Described it as "SafeCommit review: verdict, risk, checks, blockers" | No |
| `chanter.get_proposal_evidence_bundle`'s stored review objects | Raw `verdict`/`riskLevel` echoed with no annotation | No |
| Test suite (`tests/p3b-safecommit-bridge.test.ts`) | Asserted `reviewStatus`/`executionStatus` only | No test asserted advisory language anywhere |

**Conclusion: R-01 verdict = TRUE**, confirmed independently against current source (not assumed from the audit doc), on all four sub-claims.

---

## 2. Fix Applied

Per mission scope ("wording / docs / tests / output field" only, no new tools, no logic change to the SafeCommit review/verdict/storage mechanism), the following additive-only changes were made:

| File | Change |
|---|---|
| [src/registry/tools.ts](src/registry/tools.ts) | Tool description now: *"Attach a SELF-REPORTED SafeCommit review (caller-supplied verdict, not independently verified by a real SafeCommit run — advisory only). Does NOT commit or execute."* — this is what `chanter.list_safe_tools` returns to any caller before they invoke the tool. |
| [src/registry/permissions.ts](src/registry/permissions.ts) | Permission-registry description now: *"Attach self-reported SafeCommit review (not independently verified; advisory only)."* |
| [src/safecommit/safecommitTypes.ts](src/safecommit/safecommitTypes.ts) | Added `selfReported: true` (required, literal-true) to `SafecommitReviewEvent`, with a doc comment. Single construction site ([attachSafecommitReview.ts](src/tools/attachSafecommitReview.ts)) updated to populate it — flows automatically into every stored review and into `get_proposal_evidence_bundle`'s `safecommitReview.reviews[]`/`latestVerdict`, so downstream consumers reading the evidence bundle (not just the original `attach` call) see the flag too. |
| [src/tools/attachSafecommitReview.ts](src/tools/attachSafecommitReview.ts) | Added `advisory?: string` to `AttachSafecommitReviewResult`; populated on every successful call with: *"Self-reported by the caller. Not independently verified by a real SafeCommit run. Treat as advisory only, not a safety gate."* |
| [src/tools/getSafecommitRequirements.ts](src/tools/getSafecommitRequirements.ts) | Extended the existing `warning` field to also cover verdict provenance (previously covered only execution authority). |
| [docs/CHANTER_MCP_SERVER.md](docs/CHANTER_MCP_SERVER.md) | P3B tool table row, a new "self-reported, not a real safety gate" paragraph under "SafeCommit Review Model," and a new bullet under "Safety Guarantees." |
| [tests/p3b-safecommit-bridge.test.ts](tests/p3b-safecommit-bridge.test.ts) | New `describe("R-01 — SafeCommit review is self-reported, not a real gate")` block, 5 tests, locking in: the tool description wording, the permission description wording, the `advisory` output field, the `selfReported: true` flag on the stored/evidence-bundle event, and the extended `warning` text. Regression-proofs all five surfaces above — a future edit that silently drops the disclaimer will now fail a test, closing the same kind of silent-regression gap found and flagged during the AutoPoster CSRF pass. |

**What was deliberately NOT changed** (out of scope for this pass, matches mission constraints):
- No real SafeCommit integration was built (that's the "build the real integration" alternative `CHANTER_AUDIT_REPORT.md` names as the other option — explicitly bigger than "smallest safe fix" and not requested here).
- No new MCP tool was added.
- `insert-p3b.js` / `insert-p3b.mjs` were read (to confirm `src/registry/tools.ts` is the live, hand-maintained source of truth and not regenerated at build time) but never executed.
- Verdict/riskLevel validation logic, redaction logic, storage mechanism, `executionStatus` hardcoding, and the proposal lifecycle were all left untouched.

---

## 3. Validation Results

All commands run from `apps/chanter-mcp-server`:

| Command | Result |
|---|---|
| `git status --short` (after edits) | 7 files modified: `docs/CHANTER_MCP_SERVER.md`, `src/registry/permissions.ts`, `src/registry/tools.ts`, `src/safecommit/safecommitTypes.ts`, `src/tools/attachSafecommitReview.ts`, `src/tools/getSafecommitRequirements.ts`, `tests/p3b-safecommit-bridge.test.ts` — exactly the intended set, nothing else |
| `npm run typecheck` (`tsc --noEmit`) | ✅ Pass — no errors |
| `npm test` | ✅ **159/159 pass**, 0 fail, 0 skip (154 pre-existing + 5 new R-01 tests; zero regressions) |
| `npm run build` (`tsc`) | ✅ Pass — no errors. `dist/` is gitignored, so no build-artifact diff was produced (unlike the AutoPoster dashboard case) — nothing to restore. |
| `git diff --check` | Exit code 0 — clean. (CRLF-on-next-touch notices printed for all 7 files are routine line-ending advisories from Windows checkout settings, not whitespace errors — these are intentional hand-edits, not regenerated build artifacts, so nothing was reverted.) |

**Commands explicitly not run:** `insert-p3b.js`, `insert-p3b.mjs` (per mission constraint — already executed once historically; re-running risks corrupting the tool registry). No deploy or publish commands exist in this repo's scripts to begin with (stdio MCP server, local-only).

**Git status:** `main` @ `c57891f` before this session's edits (working tree now has the 7 files above modified, uncommitted). **No remote configured** (`git remote -v` empty) — confirmed matches `CHANTER_AUDIT_REPORT.md`'s "Local stdio server, N/A" deploy status. Nothing pushed; nothing to push to.

---

## 4. Guidance for Downstream Products

**Until a real SafeCommit integration exists (tracked as P4+ in `docs/CHANTER_MCP_SERVER.md`'s roadmap), any product or automation that reads `chanter.attach_safecommit_review`'s output, `chanter.get_safecommit_requirements`'s `currentStatus`, or `chanter.get_proposal_evidence_bundle`'s `safecommitReview` block MUST treat that data as advisory/self-reported only — never as proof that a real SafeCommit review occurred, and never as authorization to commit, push, deploy, or execute anything.** This was already true before this fix (R-01 was a real, confirmed gap); what changed is that this constraint is now stated on every surface that carries the data — tool description, permission registry, the tool's own output, the requirements warning, the stored event's `selfReported: true` flag, and the docs — instead of relying on a downstream consumer to already know it from reading `CHANTER_AUDIT_REPORT.md`.

This matches, and does not relax, the existing "Do Not Touch Yet" instruction already on file: *"Do not treat `chanter-mcp-server`'s `attach_safecommit_review` output as a real safety verification in any automation until the self-attestation gap (R-01) is closed."* This pass made the gap harder to miss; it did not close it. R-01 remains open as a design gap (no real SafeCommit invocation exists) — this fix closes only the *disclosure* half of the finding, which was the smallest-safe-fix scope requested.

---

## 5. Summary Table (mission-requested format)

| Item | Result |
|---|---|
| **R-01 verdict** | **TRUE** (confirmed on all 4 sub-claims: caller-supplied input, verbatim storage, no real SafeCommit invocation, no prior advisory disclosure) |
| **Evidence files** | [src/tools/attachSafecommitReview.ts](src/tools/attachSafecommitReview.ts), [src/safecommit/safecommitTypes.ts](src/safecommit/safecommitTypes.ts), [src/registry/tools.ts](src/registry/tools.ts), [src/registry/permissions.ts](src/registry/permissions.ts), [src/tools/getSafecommitRequirements.ts](src/tools/getSafecommitRequirements.ts), [src/tools/getProposalEvidenceBundle.ts](src/tools/getProposalEvidenceBundle.ts), [src/server.ts:71](src/server.ts), [tests/p3b-safecommit-bridge.test.ts](tests/p3b-safecommit-bridge.test.ts) |
| **Fix applied or deferred** | **Applied** — wording (2 descriptions), 1 new type field (`selfReported: true`), 1 new output field (`advisory`), 1 extended warning string, docs, 5 new regression tests. **Deferred** (explicitly out of scope): real SafeCommit integration/execution. |
| **Validation results** | `typecheck` ✅ · `test` ✅ 159/159 · `build` ✅ · `git diff --check` ✅ (exit 0) |
| **Git status** | 7 files modified, uncommitted, no remote configured, nothing pushed |
| **Downstream guidance** | Must continue to treat `attach_safecommit_review` / `get_safecommit_requirements` / the evidence bundle's `safecommitReview` block as **advisory/self-reported only** — never as a real safety gate — until a genuine SafeCommit integration is built (P4+). This fix makes that constraint explicit and machine-checkable everywhere the data surfaces; it does not close R-01's underlying design gap. |

**Not committed, not pushed** — awaiting explicit instruction, per standing git safety protocol.
