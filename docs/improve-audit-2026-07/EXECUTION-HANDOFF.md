# Handoff — Execute the July 2026 bug-audit plans

> **Status:** Active
> *(Archive alongside this audit's README once all five plans are DONE/closed.)*

**Date:** 2026-07-02
**From:** the `/improve` audit session (read-only; plans landed on `main` @ `8015d34c9`)
**To:** the implementing session(s) — a cheaper execution-tier model (Sonnet) is fine for most of these; see the model column.

---

## What this is

A read-only `/improve` audit produced this directory: a [README index](README.md)
plus five executor-ready plans. Each plan is self-contained (inlined code
excerpts, exact commands, hard scope boundaries, STOP conditions) and
**assertion-first**: write the failing test that pins the wrong behavior, run it
red, then make the fix flip it green. The red→green transition is the proof.

## Read first

1. [`README.md`](README.md) — the findings table, execution order, the
   "Relationship to the UX remediation plan" section, and **7 rejected
   false-positives** (do NOT re-audit those — they were vetted and killed).
2. `CLAUDE.md` (repo root) — worktree/commit/migration conventions and the
   Auto Mode shared-system rules.
3. For any UX-facing change: `docs/INTENT.md`.

## Execution order, model tier & status

| Plan | Order | Model | Status | Notes |
|------|-------|-------|--------|-------|
| [001 — AI-assistant scope fails open (cross-tenant leak)](001-askq-show-scope-fail-closed.md) | **DO FIRST** | Sonnet OK | DONE + DEPLOYED | Code merged [#1089](https://github.com/rbeezley/myk9-platform/pull/1089); `ask-myk9show` redeployed 2026-07-04 as version 34 (`updated_at` = `2026-07-04 19:44:05 UTC`). |
| [002 — Move-up write-order corruption](002-move-up-create-before-mark.md) | 2 | Sonnet OK, strong model on review | TODO | Offline-critical path, MED risk — honor the STOP conditions. |
| [004 — Checkout spinner stuck](004-cart-checkout-loading-reset.md) | anytime | Sonnet OK | TODO | One line + one test. |
| [005 — Replication OCC/watermark spike](005-replication-occ-watermark-spike.md) | anytime (parallel) | **STRONG model** | TODO | READ-ONLY investigation → findings doc only. Judgment-heavy; a cheaper model tends to produce shallow verdicts here. |
| [003 — Silent secretary mutation failures](003-surface-mutation-errors.md) | **after Phase 3** | Sonnet OK | BLOCKED | Edits `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`, which the in-flight UX Phase 3 (task 3.E) also edits. Run as its own PR ONLY AFTER Phase 3's edits to that file land — do NOT inject into 3.E mid-flight. |

**Why the model split:** the expensive work (understanding the code, judging
which findings are real, writing the exact proof-test) is frozen in the plans;
execution is mechanical, so an execution-tier model runs it without loss. The
exception is 005 — it's analysis wearing a task's clothes, so keep it on a
strong model. Keep a strong model on **review** for every PR regardless (matches
the UX plan's own model-guidance policy).

## Relationship to the in-flight UX walk remediation

`docs/plan-ux-walk-remediation-2026-07.md` is open and being worked (phase state
at handoff: Phases 0–1 **done**, Phases 2–3 **in flight**, Phases 4–6 not
started). This audit is a **different lens** — correctness/security/data
integrity, not usability — so 001/002/005 are net-new (a UX walk can't find a
cross-tenant leak or a write-ordering bug). Only 003 overlaps, on the *file*
`ClassManagementPage.tsx`; that's why 003 is gated behind Phase 3. Do not fold
003 into a UX task — 1.E (its apparent home) already shipped without the error
handling, and 3.E is mid-flight. See the README's reconciliation section.

## Rules of the road

- **Work in a git worktree, never the primary checkout.** After creating one:
  `bash scripts/bootstrap-worktree.sh` (installs deps, copies env, builds pkgs).
- **One PR per plan.** Do NOT push to `main`, open PRs, deploy edge functions, or
  run `supabase db push` without explicit human confirmation (CLAUDE.md
  "Auto Mode — shared-system writes"). The docs-only-direct-to-main exception
  does NOT apply to these code changes.
- Verification gates: `pnpm typecheck` (never raw tsc — stricter config),
  `pnpm lint`, app tests `cd apps/myk9show && pnpm test`. The edge-function
  `_shared` tests run under vitest; the new `showScope.test.ts` in plan 001 is
  written to be vitest-loadable (no Deno import).
- Run each plan's **Drift check** (git diff since `8015d34c9`) before starting; a
  "Current state" excerpt mismatch is a STOP condition, not a "patch around it".
- Each plan updates its own status row in [`README.md`](README.md) when done.

## To run one with a dispatched executor + review

```
/improve execute docs/improve-audit-2026-07/001-askq-show-scope-fail-closed.md
```

This dispatches an executor subagent in an isolated worktree, then a reviewer
re-runs the plan's done-criteria and reads the diff before rendering a verdict.
