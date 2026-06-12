# Plan: Dynamic QA Infrastructure (follow-on to the Code-Quality Audit)

**Created:** 2026-06-12 · **Status:** Draft — not started
**Goal:** Build the QA infrastructure the code-quality audit cannot: dynamic tests for offline/replication behavior, mutation testing of money-path math, database-side drift checks, error observability, and flaky-test quarantine. Where the audit *finds and removes* existing static debt, this plan *builds new guards* so quality holds after launch.

**Relationship to [`docs/plan-code-quality-audit.md`](plan-code-quality-audit.md):** that plan owns static debt removal (Waves A–D) and the CI ratchets (its Phase 5 amendment, 2026-06-12). This plan owns everything dynamic. Phases here marked **[after audit]** must wait for the named audit wave; the rest can start independently in their own worktrees.

## Validation Profile

- Risk: medium
- Validation: standard per phase (each phase ships its own tests; final regression at the end)
- Rationale: most phases add tests/tooling rather than changing app behavior. The exceptions — Sentry wiring (Phase 4) and any fix that chaos tests surface (Phase 1) — go through the full PR + review workflow.

## Verified starting state (2026-06-12)

| Fact | Evidence |
| --- | --- |
| No Sentry, axe-core, Stryker, or size-limit dependency anywhere | grep of all `package.json` files |
| CI = Quality Checks → Test packages + Test myK9Show (3 shards) in `.github/workflows/ci.yml` | job list |
| `resolveConflict` already has unit tests | `packages/replication/src/core/ReplicatedTable.test.ts` and siblings |
| App-level `ErrorBoundary` exists | `apps/myk9show/src/App.tsx`, `components/common/ErrorBoundary.tsx` |
| Nightly proactive-QA already runs (isolated worktree + unique port) | project memory `project_nightly_qa_isolation` |
| Root `pnpm.overrides` pins `@supabase/supabase-js` to exact `2.93.3`, making caret bumps inert | root `package.json` (feedback memory, PR #403 review) |

## Sequencing at a glance

| Phase | Depends on audit? | Can run parallel to audit execution? |
| --- | --- | --- |
| 1. Offline/replication chaos tests | No, but coordinate with Wave D (replication reroutes touch the same files) | Yes — separate worktree, land after Wave D if conflicts arise |
| 2. Mutation testing | **[after audit]** Wave D tests must exist first | No |
| 3. Database-side drift checks | No | Yes (read-only against shared systems) |
| 4. Error observability | No | Yes |
| 5. Flaky-test quarantine | No (pairs with deferred `fileParallelism` spike) | Yes |
| 6. Budgets & cadence | Bundle budget waits for Wave A (deletes `performance-budget.ts`) | Partially |

---

## Phase 0 — Setup and safety

1. Worktree check before any write (`git branch --show-current`, `git rev-parse --git-dir --git-common-dir`); never work in the primary checkout while concurrent agents exist.
2. No shared-system mutations without separate confirmation: Supabase pushes, function deploys, Sentry project creation, GitHub PR creation, scheduled-task creation. Phase work that needs one stops and asks.
3. Each phase is its own PR (or small PR series) through the standard workflow: implement → `/simplify` → `/commit` → PR → `/review` → merge → `/cleanup`. Codex review default-ON for anything touching behavior.
4. Treat tooling commands as fallible: record failures/fallbacks in this doc's status notes rather than retrying in a loop. Test runs that hang >60s get stopped and recorded.

## Phase 1 — Offline/replication chaos tests

The product promise is show-day reliability with no signal; nothing in the current suite exercises it end-to-end. Three layers, smallest first:

1. **Conflict-injection unit tests** (extend existing `ReplicatedTable` tests): two writers mutate the same entry concurrently; assert `resolveConflict` preserves enrichment-only fields (the PR #450 bug class — see feedback memory `feedback_denormalize_at_sync`). Table-driven over the conflict-prone tables: entries, classes, scores.
2. **Sync-queue replay idempotency**: serialize a queued mutation set from `MutationManager`, replay it against a fresh store, assert convergence and no double-apply. Pure unit test, no browser.
3. **Playwright offline round-trip** (one spec, not a suite): enter `/at-show`, `context.setOffline(true)`, score an entry, reconnect, assert the score syncs and the UI reflects server state. Use the e2e patterns already in `apps/myk9show/e2e/`.

Coordination note: audit Wave D reroutes replication bypasses in the same area. If Wave D is in flight, land this phase after it; the chaos tests then double as Wave D's regression net.

**Testing:** the phase *is* tests. Exit criteria: all three layers green locally and in CI, and at least one test demonstrably fails when the guard it protects is broken (mutate `resolveConflict` locally to prove the conflict tests bite, then revert).

## Phase 2 — Mutation testing on money-path math **[after audit Wave D]**

Coverage proves code ran; mutation score proves assertions bite. Scope Stryker (`@stryker-mutator/core` + vitest runner) to only the critical pure modules — whole-repo mutation testing is far too slow:

- `calculateCartTotals` / cart fee rounding helpers
- `ScoreValidatorService`
- `PlacementCalculatorService.helpers.ts`
- replication conflict-resolution helpers (after Phase 1 lands)

Deliverables: `stryker.config.json` scoped by file glob, a `pnpm` script (`test:mutation`), and a recorded baseline mutation score per module in this doc. Not wired into CI (too slow) — run before each launch milestone alongside the code-quality audit re-run.

**Testing:** run Stryker once per module; triage surviving mutants — each survivor is either a missing assertion (fix the test) or equivalent-mutant noise (record it). Target ≥80% mutation score on fee/placement math before calling the phase done.

## Phase 3 — Database-side drift checks

All read-only against the shared DB; no migration or push in this phase.

1. **Supabase advisors sweep:** pull the dashboard's security + performance lints (unindexed FKs, RLS-disabled tables, slow policies). Record findings in `docs/audits/2026-06-proactive-qa/db-advisors.md`. Route anything security-shaped to `/security-audit`, anything needing a migration to the `migration-auditor` flow — don't fix inline.
2. **Enum/CHECK drift script:** automate the DB-constraint-review feedback rule — a script that extracts status/enum string literals written by app services and diffs them against actual CHECK constraints in the schema. The audit caught `entries.status` not existing by hand; this makes that class of bug a script run. Lives in `scripts/`, runnable on demand.
3. **Deployed-vs-repo edge function inventory:** `supabase functions list` diffed against `supabase/functions/` directories, flagging orphans in both directions. The audit's `send-notification` liveness question generalizes; this script answers it permanently.

**Testing:** unit tests for the drift script's parser (extracting enum writes from service code is the fragile part) using fixture files; the function-inventory script gets a smoke test against recorded CLI output.

## Phase 4 — Error observability

Pre-launch is the last cheap moment. Two parts:

1. **Error-boundary coverage audit:** App-level boundary exists; enumerate role surfaces (`/at-show`, secretary workbench, registration wizard, judge views, admin) and add per-surface boundaries where a crash currently whites out the whole app. Each boundary preserves the role's INTENT feeling (read `docs/INTENT.md` before writing fallback UI — a judge mid-scoring needs "your work is saved offline" reassurance, not a stack trace).
2. **Crash reporting:** wire Sentry (or chosen equivalent — confirm vendor with user before creating the external project; that's a shared-system step per Phase 0). Source maps via the Vercel integration; scrub PII (handler names, dog registration numbers) in `beforeSend`. Sample rate conservative; this is pre-launch signal, not analytics.

**Testing:** unit tests for each new boundary (throw in a child, assert fallback renders and reset works); a `beforeSend` scrubber unit test with fixture events containing PII shapes; manual verification that a thrown error in dev reaches the Sentry project.

## Phase 5 — Flaky-test quarantine and suite health

CLAUDE.md already documents hanging/timeout problems; CI's bottleneck is the 9-minute sharded myK9Show job.

1. Run the myK9Show suite 5–10× overnight (nightly-QA isolation rules apply: own worktree, unique port); record per-file flake counts.
2. Quarantine confirmed flakies (vitest `.skip` + an OPEN-TODOS entry each, or fix on the spot if the cause is obvious — prefer fixing; quarantine is the fallback, and per the avoid-deferring-followups rule each quarantined file needs an owner-task, not a silent skip).
3. Profile slowest test files (`vitest --reporter=verbose` timings); feed results into the deferred `fileParallelism` spike from `project_test_suite_performance`.

**Testing:** the deliverable is measurement + fixes. Exit criteria: 3 consecutive full-suite runs with zero non-quarantined failures, and a recorded timing baseline in this doc.

## Phase 6 — Budgets and cadence

1. **Bundle-size budget [after audit Wave A]:** Wave A deletes the dead `performance-budget.ts`; replace it with an enforced one — `rollup-plugin-visualizer` for the report, `size-limit` (or a small CI script) gating the main route chunks. Record the initial budget from the current build, ratchet downward only.
2. **Accessibility smoke:** `@axe-core/playwright` assertions on the top 5 role landing pages, riding the existing e2e suite. Violations triage: fix serious/critical, file moderate as OPEN-TODOS.
3. **Dependency cadence:** monthly `pnpm audit` + `pnpm outdated` as a scheduled check. First run must explicitly review the root `pnpm.overrides` pin of `@supabase/supabase-js@2.93.3` — decide to bump-and-test or document why it stays (currently it silently neutralizes caret bumps).
4. **Scheduled drift run:** weekly re-run of the audit's cheap Phase 1a/1e/1f greps (file sizes, `as any`, TODO markers), appending to the audit's baseline-delta table. Complements (not replaces) the CI ratchets, which only see PR-time deltas. Creating the schedule is a shared-system step — confirm before wiring.

**Testing:** size-limit config verified by intentionally inflating a chunk locally (gate must fail, then revert); axe assertions are tests; drift-run script gets a smoke test against the repo.

## Phase 7 — Final regression and codification

1. Full `pnpm typecheck`, `pnpm lint`, package + app test suites green.
2. Update this doc's status notes per phase; move anything deferred into OPEN-TODOS with context (no silent drops).
3. Fold the repeatable pieces (mutation run, advisors sweep, drift scripts) into the launch-milestone checklist alongside the code-quality audit's Phase 5 skill, so both run together before each milestone.
