# Handoff — Implementing the UX Walk Remediation Plan

> **Status:** Archived — Phase 2 is underway; use the plan as the source of truth.

**Date:** 2026-07-02
**From:** planning sessions (Claude walks + Codex cross-reviews, 2026-07-01/02)
**To:** the implementing session(s)/agent(s)
**The execution list:** [`docs/archive/plan-ux-walk-remediation-2026-07.md`](plan-ux-walk-remediation-2026-07.md) — this handoff adds historical context; it does **not** add tasks. If this file and the plan disagree, the plan wins.

---

## Archive Note — 2026-07-03

This file was moved to `docs/archive/` because the implementation has progressed beyond the original handoff state: Phase 0 is complete, Phase 1 implementation tasks are checked off in the plan, Phase 2 has begun (`2.A` module/tests landed in PR #1086), and parts of Phase 3 are complete or in progress. The original "zero implementation code written" note below is preserved only as the state at the time this handoff was created.

## Original State at Handoff

- **Plan is final and on `main`** (through commit `44bdfca4d`): authored from two role walks, coverage-audited via /verify-plan (8 gap patches applied), then merged with the UI verification matrix (tasks 0.G, 1.G, 3.G, 3.H, 5.F added). 49 tasks across Phases 0–6; 4 Phase-0 investigation verdicts already closed at planning time (0.B, 0.C, 0.E, 0.F — read them before touching related code; they *changed* the fixes).
- **Historical note:** Zero implementation code was written at the time of this handoff. This is no longer current; see the plan's 2026-07-03 status snapshot.
- **Three source audits, all on `main`, all Claude+Codex cross-validated:**
  [`2026-07-01-secretary-journey-ux-audit.md`](../audits/2026-07-01-secretary-journey-ux-audit.md) ·
  [`2026-07-02-exhibitor-elderly-ux-audit-claude.md`](../audits/2026-07-02-exhibitor-elderly-ux-audit-claude.md) ·
  [`2026-07-01-ui-verification-matrix.md`](../audits/2026-07-01-ui-verification-matrix.md) (+ [icon-button appendix](../audits/2026-07-01-ui-verification-matrix-appendix-icon-buttons.md)).
  The audits are *evidence*; don't re-derive tasks from them — the plan's traceability appendix already maps every finding.

## Read in this order

1. The plan — top matter + the phase you're implementing (don't skim Phase 0's verdicts; they're load-bearing).
2. [`docs/INTENT.md`](../INTENT.md) — mandatory before UX-facing changes; the plan cites its guardrails as acceptance criteria.
3. `CLAUDE.md` — worktree/commit/migration conventions.

## Execution conventions (agreed with the owner)

- **One PR per work package** (the lettered tasks), parallelized **by file set, not by feature** — two packages touching the same file go sequentially.
- **Code goes through PRs.** The docs-only direct-to-main flow used during planning does *not* apply to implementation.
- **Codex review ON for every Phase 1–4 PR** (`/codex:review`); optional for Phase 5 copy-only PRs.
- **Assertion-first tests** for anything value-sensitive (dates, statuses, counts, money): write the failing `expect(...)` before the fix.
- **Model guidance (owner decision, 2026-07-02):** execution-tier models (Sonnet/Opus) for well-specified packages — Phase 1 fixes, Phase 3 sweeps, Phase 5 polish. Reserve a strong model for: Phase 2 module *design* PRs (`deriveEntryPresentation` API + consumer migrations), root-cause spikes 0.A/0.G, and the 4.A/4.B wizard redesign. Keep a strong model on review regardless of who implements.
- Work in worktrees (`bash scripts/bootstrap-worktree.sh` after creating one); run `gh pr merge` from the main repo dir, never inside a worktree; update the plan's checkboxes (and `OPEN-TODOS.md`) in the same PR that completes a task.

## Environment & test data

- **Accounts:** `e2e-secretary@test.myk9.com` / `e2e-exhibitor@test.myk9.com` — passwords in `apps/myk9show/.env.local` (`E2E_SECRETARY_PASSWORD`, etc.). The named demo accounts (`admin@myk9t.com`…) can NOT log in.
- **Seed shows (shared dev DB):** Heartland Scent Work Classic `dededede-0000-0000-0000-000000000010` (published; the walks' main fixture), ASCA draft `155270bb-afe9-4d6d-9b82-cb0517ad9ffb`, UKC draft `f651d481-19a2-4819-b7fa-8066c039be33`.
- **Walk residue on the shared dev DB:** dog "Buddy" (Golden Retriever, AKC SR12345678) + his Container Novice A cash entry (created 2026-07-02); one failed, un-retried `ringside_update_entry` write sitting in a replication queue (safe to discard); Codex's dog "Daisy". Fine to reuse as fixtures.
- **UI-matrix artifacts:** Codex's set is on `main` at `docs/qa/assets/ui-verification-2026-07-02/` (90 screenshots + `matrix-results.json`). The Claude harness/screenshots lived in a session scratchpad and are **likely gone** — reconstruct from the audit's "Artifacts & reproduction" section (it documents the full method; 6.B needs this anyway).
- Dev server: `pnpm dev:show` (5173). If using Preview MCP from a worktree, verify which checkout it actually serves before trusting it.

## Traps specific to this plan

- **0.A's write is INTENT-marked.** The mark-in-ring-on-tap is a deliberate spike stub (`useAtShowEntryListHandlers.ts:152`, INTENT comment). The 4.H fix must coordinate with [`plan-atshow-ringside-writes.md`](../plan-atshow-ringside-writes.md) — change the behavior *with* that plan's context, don't just delete the call.
- **The shared dev DB itself is a finding.** Entries reads were hitting `statement timeout` during the matrix run (spike 0.G). If your verification hits 500s/toasts, you may be reproducing 0.G, not breaking things — check before "fixing".
- **Cold vs warm cache discipline.** S1-class findings only reproduce on a fresh browser profile; a warm profile will falsely "pass". 1.G's e2e must use fresh storage.
- **Replication layer:** never bypass it in core flows; a read-mapping fix must update **both** the replication mapper and the PostgREST fallback `.select` (two code paths). Rebuild shared packages before app tests: `pnpm --filter @myk9/<pkg> build`.
- **Status maps:** every lookup total — `MAP[x] ?? MAP.unknown` (a prior prod crash came from an unguarded map index).
- **Repo mechanics:** `pnpm typecheck` (never raw tsc); incremental `tsbuildinfo` can false-PASS after adding files — clear it; files stay under 500 lines (CI ratchet); no setState-in-effect (lint error); use the custom render from `src/test/utils/testUtils.tsx`; pure unit tests live outside `src/test/e2e/`.

## Decisions already made — don't relitigate

- **One plan, not several.** The UI matrix and both walk audits are merged; the matrix's "proposed lanes" section is marked absorbed. Execute from the plan only.
- **E7 is a relabel** ("Confirmation #"), not a numbering rewrite (verdict 0.C).
- **Heartland's Sep-1 close date stays** (deliberate demo seed; 4.A adds a wizard warning for real shows — verdict 0.F).
- **Dev-tools menu stays DEV-gated** but gets nested + confirm (verdict 0.E; it never shipped to prod).
- **The wizard silent-Next is already fixed** (#1073) — don't re-fix; 6.A re-verifies.

## Open decision points (ask the owner when you reach them, not before)

1. **2.C(1):** one pending-count definition vs two labels — touches the standing "paid stays pending" decision.
2. **1.E(1):** plan recommends inline judge-assign on Manage Classes over rerouting the chip — confirm before building.
3. **4.G(1):** readiness summary vs "Results Settings" rename if the summary gets deferred.
4. **5.F:** the text-size floor (token bump vs exception list) — explicitly a design decision for the owner.

## Suggested launch order

1. **Parallel, read-only:** finish spikes 0.A / 0.D / 0.G (three agents, three verdicts appended to the plan).
2. **Phase 1 fan-out** in separate worktrees by file set: 1.A, 1.B, 1.D, 1.E, 1.F, 1.G immediately; 1.C once 0.D's verdict lands.
3. **Phase 2 module-design PRs** (strong model) while Phase 1 review cycles run — 2.A and 2.B first; their consumers migrate in follow-up packages.
4. Phases 3–5 per the plan's dependency notes; Phase 6 only after 1–5 are merged.

## Done means

Per the plan's Phase 6: both persona re-walks clean of Critical/High, slim matrix re-run at zero serious/critical axe with the no-sub-44px-chrome assertion, time-to-task delta measured against the June baseline, plan flipped Complete and archived with its README row removed — and this handoff archived with it.
