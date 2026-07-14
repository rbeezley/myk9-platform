# Plan: Dynamic QA Infrastructure (follow-on to the Code-Quality Audit)

**Created:** 2026-06-12 · **Status:** Complete (2026-06-15) — Phase 1 chaos tests; Phase 2 mutation baselines; Phase 3 DB drift checks; Phase 4 Sentry live in production (DSN active, PII scrubber verified, source maps uploading); Phase 5 suite health (no active flakes, isolation debt tracked); Phase 6a bundle-budget gate + a11y smoke (PR #738); Phase 6b monthly dependency-audit cron + supabase pin bump (PR #740); Phase 7 final regression green + launch-milestone checklist codified. Deferred follow-ups tracked in OPEN-TODOS.
**Goal:** Build the QA infrastructure the code-quality audit cannot: dynamic tests for offline/replication behavior, mutation testing of money-path math, database-side drift checks, error observability, and flaky-test quarantine. Where the audit _finds and removes_ existing static debt, this plan _builds new guards_ so quality holds after launch.

**Relationship to [`docs/plan-code-quality-audit.md`](archive/plan-code-quality-audit.md):** that plan owns static debt removal (Waves A–D) and the CI ratchets (its Phase 5 amendment, 2026-06-12). This plan owns everything dynamic. Phases here marked **[after audit]** must wait for the named audit wave; the rest can start independently in their own worktrees.

## Validation Profile

- Risk: medium
- Validation: standard per phase (each phase ships its own tests; final regression at the end)
- Rationale: most phases add tests/tooling rather than changing app behavior. The exceptions — Sentry wiring (Phase 4) and any fix that chaos tests surface (Phase 1) — go through the full PR + review workflow.

## Verified starting state (2026-06-12)

| Fact                                                                                           | Evidence                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| No Sentry, axe-core, Stryker, or size-limit dependency anywhere                                | grep of all `package.json` files                                     |
| CI = Quality Checks → Test packages + Test myK9Show (3 shards) in `.github/workflows/ci.yml`   | job list                                                             |
| `resolveConflict` already has unit tests                                                       | `packages/replication/src/core/ReplicatedTable.test.ts` and siblings |
| App-level `ErrorBoundary` exists                                                               | `apps/myk9show/src/App.tsx`, `components/common/ErrorBoundary.tsx`   |
| Nightly proactive-QA already runs (isolated worktree + unique port)                            | project memory `project_nightly_qa_isolation`                        |
| Root `pnpm.overrides` pins `@supabase/supabase-js` to exact `2.93.3`, making caret bumps inert | root `package.json` (feedback memory, PR #403 review)                |

## Sequencing at a glance

| Phase                              | Depends on audit?                                                          | Can run parallel to audit execution?                          |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Offline/replication chaos tests | No, but coordinate with Wave D (replication reroutes touch the same files) | Yes — separate worktree, land after Wave D if conflicts arise |
| 2. Mutation testing                | **[after audit]** Wave D tests must exist first                            | No                                                            |
| 3. Database-side drift checks      | No                                                                         | Yes (read-only against shared systems)                        |
| 4. Error observability             | No                                                                         | Yes                                                           |
| 5. Flaky-test quarantine           | No (pairs with deferred `fileParallelism` spike)                           | Yes                                                           |
| 6. Budgets & cadence               | Bundle budget waits for Wave A (deletes `performance-budget.ts`)           | Partially                                                     |

---

## Phase 0 — Setup and safety

1. Worktree check before any write (`git branch --show-current`, `git rev-parse --git-dir --git-common-dir`); never work in the primary checkout while concurrent agents exist.
2. No shared-system mutations without separate confirmation: Supabase pushes, function deploys, Sentry project creation, GitHub PR creation, scheduled-task creation. Phase work that needs one stops and asks.
3. Each phase is its own PR (or small PR series) through the standard workflow: implement → `/simplify` → `/commit` → PR → `/review` → merge → `/cleanup`. Codex review default-ON for anything touching behavior.
4. Treat tooling commands as fallible: record failures/fallbacks in this doc's status notes rather than retrying in a loop. Test runs that hang >60s get stopped and recorded.

## Phase 1 — Offline/replication chaos tests

**Status 2026-06-13:** Complete in branch `codex/phase-1-replication-chaos-tests`.
Added `packages/replication/src/replication-chaos.test.ts` with table-shaped
same-field dirty-row conflict guards for entries, classes, and scores, plus
enrichment-field preservation assertions. Added
`packages/replication/src/MutationManager.replay.test.ts` with serialized
mutation queue replay/idempotency coverage. Added
`apps/myk9show/src/test/e2e/show/atShowOfflineScoring.spec.ts`, a write-safe
Chromium feature-audit spec that opens the real `/at-show` scoresheet, scores
offline, verifies IndexedDB dirty/pending state, reconnects, and intercepts the
entry PATCH upload so staging is not mutated. Bite-check: temporarily disabling
same-field conflict surfacing made all three new chaos cases fail on
`expect(events).toHaveLength(1)`, then the change was reverted.

The product promise is show-day reliability with no signal; nothing in the current suite exercises it end-to-end. Three layers, smallest first:

1. **Conflict-injection unit tests** (extend existing `ReplicatedTable` tests): two writers mutate the same entry concurrently; assert `resolveConflict` preserves enrichment-only fields (the PR #450 bug class — see feedback memory `feedback_denormalize_at_sync`). Table-driven over the conflict-prone tables: entries, classes, scores.
2. **Sync-queue replay idempotency**: serialize a queued mutation set from `MutationManager`, replay it against a fresh store, assert convergence and no double-apply. Pure unit test, no browser.
3. **Playwright offline round-trip** (one spec, not a suite): enter `/at-show`, `context.setOffline(true)`, score an entry, reconnect, assert the score syncs and the UI reflects server state. Use the e2e patterns already in `apps/myk9show/e2e/`.

Coordination note: audit Wave D reroutes replication bypasses in the same area. If Wave D is in flight, land this phase after it; the chaos tests then double as Wave D's regression net.

**Testing:** the phase _is_ tests. Exit criteria: all three layers green locally and in CI, and at least one test demonstrably fails when the guard it protects is broken (mutate `resolveConflict` locally to prove the conflict tests bite, then revert).

## Phase 2 — Mutation testing on money-path math **[after audit Wave D]**

Coverage proves code ran; mutation score proves assertions bite. Scope Stryker (`@stryker-mutator/core` + vitest runner) to only the critical pure modules — whole-repo mutation testing is far too slow:

- `calculateCartTotals` / cart fee rounding helpers
- `ScoreValidatorService`
- `PlacementCalculatorService.helpers.ts`
- replication conflict-resolution helpers (after Phase 1 lands)

Deliverables: `stryker.config.json` scoped by file glob, a `pnpm` script (`test:mutation`), and a recorded baseline mutation score per module in this doc. Not wired into CI (too slow) — run before each launch milestone alongside the code-quality audit re-run.

**Testing:** run Stryker once per module; triage surviving mutants — each survivor is either a missing assertion (fix the test) or equivalent-mutant noise (record it). Target ≥80% mutation score on fee/placement math before calling the phase done.

**Status 2026-06-14:** Complete in branch `codex/dynamic-qa-mutation-testing`.
Added Stryker 9.6.1 with the Vitest runner, root mutation scripts, a target-aware
`stryker.config.mjs`, and `vitest.mutation.config.ts` so each module runs only its
focused test file(s). Reports write to ignored `reports/mutation/<target>/`; Stryker
sandboxes write to ignored `.stryker-tmp/`. Mutation runs are intentionally manual,
not part of CI yet, and `thresholds.break` stays unset while ScoreValidator and
replication-conflict baselines are below 80%; cart and placement can get a hard gate
once the baseline proves stable across a few milestone runs.

| Target                       | Mutated files                                                                                                                                                                      | Tests                                        | Mutation score | Notes                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cart fee math                | `apps/myk9show/src/store/cartStore.helpers.ts`                                                                                                                                     | `cartStore.helpers.test.ts`                  |         87.50% | Money calculations killed 7/8 mutants. The lone survivor is the display-label string export, not fee arithmetic.                                                                                                                                                                                                            |
| Placement math               | `apps/myk9show/src/services/scoring/PlacementCalculatorService.helpers.ts`                                                                                                         | `PlacementCalculatorService.helpers.test.ts` |         85.67% | Meets the ≥80% fee/placement gate after adding extraction, format-specific entry creation, weighted sorting, tie-group, and serialization assertions.                                                                                                                                                                       |
| Score validation             | `apps/myk9show/src/services/scoring/ScoreValidatorService.ts`                                                                                                                      | `ScoreValidatorService.test.ts`              |         68.81% | Baseline target, not the fee/placement gate. Raised from 28.44% by covering unsupported formats, custom rules, dependency variants, timing warnings, missing qualified score data, and batch-key behavior. Remaining survivors are mostly catch-path/logging/message-detail mutants plus broad service branch combinations. |
| Replication conflict helpers | `packages/replication/src/conflict/ConflictResolver.ts`, `packages/replication/src/conflict/detectDirtyRowConflict.ts`, `packages/replication/src/core/ReplicatedTableConflict.ts` | conflict helper tests                        |         77.24% | `ReplicatedTableConflict.ts` is 100%; remaining survivors are mainly conflict log/event details, LWW metadata, and static ignored-field mutants in `detectDirtyRowConflict.ts`.                                                                                                                                             |

Verification run:

- `pnpm --dir apps/myk9show exec vitest run src/services/scoring/ScoreValidatorService.test.ts src/services/scoring/PlacementCalculatorService.helpers.test.ts src/store/cartStore.helpers.test.ts`
- `pnpm --filter @myk9/replication test -- ConflictResolver.test.ts detectDirtyRowConflict.test.ts ReplicatedTableConflict.test.ts`
- `pnpm test:mutation:cart`
- `pnpm test:mutation:score-validator`
- `pnpm test:mutation:placement`
- `pnpm test:mutation:replication-conflict`

## Phase 3 — Database-side drift checks

All read-only against the shared DB; no migration or push in this phase.

**Status 2026-06-12:** Complete in branch `codex/db-drift-checks`. Added `scripts/qa/db-drift/enum-check-drift.ts`, `scripts/qa/db-drift/function-inventory.ts`, root `pnpm qa:db-drift:*` scripts, and focused Vitest coverage. Findings are recorded in `docs/audits/2026-06-proactive-qa/db-advisors.md`. Follow-up remediation was intentionally not done inline because this phase is read-only.

1. **Supabase advisors sweep:** pull the dashboard's security + performance lints (unindexed FKs, RLS-disabled tables, slow policies). Record findings in `docs/audits/2026-06-proactive-qa/db-advisors.md`. Route anything security-shaped to `/security-audit`, anything needing a migration to the `migration-auditor` flow — don't fix inline.
2. **Enum/CHECK drift script:** automate the DB-constraint-review feedback rule — a script that extracts status/enum string literals written by app services and diffs them against actual CHECK constraints in the schema. The audit caught `entries.status` not existing by hand; this makes that class of bug a script run. Lives in `scripts/`, runnable on demand.
3. **Deployed-vs-repo edge function inventory:** `supabase functions list` diffed against `supabase/functions/` directories, flagging orphans in both directions. The audit's `send-notification` liveness question generalizes; this script answers it permanently.

**Testing:** unit tests for the drift script's parser (extracting enum writes from service code is the fragile part) using fixture files; the function-inventory script gets a smoke test against recorded CLI output.

## Phase 4 — Error observability

Pre-launch is the last cheap moment. Two parts:

1. **Error-boundary coverage audit:** App-level boundary exists; enumerate role surfaces (`/at-show`, secretary workbench, registration wizard, judge views, admin) and add per-surface boundaries where a crash currently whites out the whole app. Each boundary preserves the role's INTENT feeling (read `docs/INTENT.md` before writing fallback UI — a judge mid-scoring needs "your work is saved offline" reassurance, not a stack trace).
2. **Crash reporting:** wire Sentry (or chosen equivalent — confirm vendor with user before creating the external project; that's a shared-system step per Phase 0). Source maps via the Vercel integration; scrub PII (handler names, dog registration numbers) in `beforeSend`. Sample rate conservative; this is pre-launch signal, not analytics.

**Testing:** unit tests for each new boundary (throw in a child, assert fallback renders and reset works); a `beforeSend` scrubber unit test with fixture events containing PII shapes; manual verification that a thrown error in dev reaches the Sentry project.

**Status 2026-06-14:** Code complete in branch
`codex/dynamic-qa-error-observability`. Added Sentry SDK initialization for
myK9Show behind `VITE_SENTRY_DSN`, with conservative runtime options
(`sendDefaultPii: false`, 5% default traces sample, no replay capture) and a
`beforeSend` scrubber covering handler names, dog registration numbers, emails,
phones, auth/cookie headers, request query/hash data, and user PII. React root
error handlers and the existing app `ErrorBoundary` now report exceptions to
Sentry when configured.

Added per-surface role boundaries for `/at-show`, secretary surfaces, judge
views, exhibitor/public registration surfaces, and admin routes. The fallback
copy follows `docs/INTENT.md`: calm, non-technical, and reassuring about saved
show-day/entry/scoring work rather than exposing stack traces. Source-map upload
is wired through `@sentry/vite-plugin` only when `SENTRY_AUTH_TOKEN`,
`SENTRY_ORG`, and `SENTRY_PROJECT` are present; production maps are hidden and
deleted after upload.

**Status 2026-06-15 — DONE, live in production and verified.** The external setup
(a shared-system step) was completed with the user.

- **Sentry org/project created** (`rykris-software` / `javascript-react`). `VITE_SENTRY_DSN`
  set in Vercel Production and redeployed — the DSN is confirmed baked into the live
  myK9Show bundle (`ingest.us.sentry.io/4511105906769920`).
- **End-to-end verified.** Local run proved init (`__SENTRY__` v10.57.0), transmission
  (`POST → 200` to the project), and the `beforeSend` scrubber on the running code —
  zero leaks across email, phone, registration number, handler name, auth token, and IP;
  `user` reduced to `id`; URL query/hash stripped. The two test events landed in the
  Sentry Issues feed with PII shown as `[Filtered]` (dashboard-side confirmation).
- **Source maps active.** `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` set in
  Vercel; the source-map build injects `_sentryDebugIds` (maps uploaded, matched by debug
  ID), and the public `.map` files 404 (deleted after upload — original source not exposed).
  Production stack traces are now un-minified.

No code changes were needed for activation — the wiring shipped in PR #723 was complete;
this was purely external config + verification.

Verification run:

- `pnpm --dir apps/myk9show exec vitest run src/services/observability/sentry.test.ts src/components/common/RoleSurfaceErrorBoundary.test.tsx`
- `pnpm --dir apps/myk9show typecheck`
- `pnpm --dir apps/myk9show lint` (passes with one unrelated existing fast-refresh warning in `RefundEntryDialog.tsx`)
- `pnpm --dir apps/myk9show build:no-budget` (passes with existing Rollup/CSS/chunk warnings)

## Phase 5 — Flaky-test quarantine and suite health

CLAUDE.md already documents hanging/timeout problems; CI's bottleneck is the 9-minute sharded myK9Show job.

1. Run the myK9Show suite 5–10× overnight (nightly-QA isolation rules apply: own worktree, unique port); record per-file flake counts.
2. Quarantine confirmed flakies (vitest `.skip` + an OPEN-TODOS entry each, or fix on the spot if the cause is obvious — prefer fixing; quarantine is the fallback, and per the avoid-deferring-followups rule each quarantined file needs an owner-task, not a silent skip).
3. Profile slowest test files (`vitest --reporter=verbose` timings); feed results into the deferred `fileParallelism` spike from `project_test_suite_performance`.

**Testing:** the deliverable is measurement + fixes. Exit criteria: 3 consecutive full-suite runs with zero non-quarantined failures, and a recorded timing baseline in this doc.

### Status 2026-06-14 — measurement complete, intra-file flakes fixed

Run in worktree `festive-ellis-2aa50e`. Exit criteria **met**: 6 consecutive full-suite runs in vitest's default order passed with **zero failures** (925 files / 9035 tests / 9 intentionally skipped).

**Flake detection result — no active (timing) flakes.** 5 identical default-order repeats were all green. The suite has **no random/timing-based flakiness**. A 6th run with `--sequence.shuffle` exposed **8 files of latent test-isolation debt** (state leaking between tests). These do **not** fail in CI because CI runs vitest's deterministic default order — they are latent fragility, not active flakes, so the right disposition is *fix where cheap + track the rest*, not `.skip` quarantine (nothing fails in normal runs to quarantine).

Two distinct sub-classes, separated by re-running the 8 files alone with shuffle:

- **Intra-file order-dependence (2 files) — FIXED this phase:**
  - `src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx` — no `beforeEach`; persistent `vi.fn()` data-hook mock kept the `dogs: []` override from the empty-state test, breaking later render tests when shuffled before them. Fix: reset the mock to a default dataset in `beforeEach`.
  - `src/test/stores/phase5-support-systems.test.ts` — `beforeEach` cleared lists but not Zustand `config` (mutated via `updateConfig`) or bookmarks; also surfaced a genuine test bug where `should provide smart suggestions` only passed by borrowing a sibling test's generated `suggestions` (it never called `generateSuggestions`). Fix: snapshot-and-restore each store's initial state in `beforeEach`, and make the smart-suggestions test self-contained.
  - Both verified green across the default order + 9 shuffle seeds (42/1/7/99/123/2026/555/31337/88).
- **Cross-file pollution (6 files) — TRACKED, not fixed:** pass alone, fail only when some earlier file in a shuffled full run leaves global state behind. Hunting each polluter across ~900 files is out of proportion to this phase (CI is green). Filed as an OPEN-TODOS owner-task ("Dynamic QA — test-isolation hardening sweep") with the repro command and the candidate suspects in `src/test/setup.ts` (module-level `localStorageStore` is never cleared in `beforeEach`; Zustand `persist` writes there). Affected files observed: `ReplicationSyncProvider.authGuard`, `ShowAccessCodesCard`, `phase3-integration`, `phase4-template-system`, `armbandQueries.replication`, `DogDetailsTabs`.

**Recommendation:** do **not** enable `--sequence.shuffle` in CI until the cross-file pollution is resolved — it would convert latent debt into red builds. Revisit after the isolation sweep.

**Date time-bomb flake (found in CI, fixed).** Opening this PR's CI run (00:00 UTC 2026-06-15) went red on `ReplicatedShowsTable.test.ts > getActiveShows > should exclude future shows` — a fixture hardcoded a "future" show at `2026-06-15`, which the calendar reached and turned "active." Unrelated to this PR's diff (it was red on `main` too) but it surfaced on this branch, so it is fixed here: `show-3`/`show-4` now use `Date.now()`-relative future dates like the sibling "current" fixture already did. A broader sweep for other hardcoded near-future fixture dates is tracked in OPEN-TODOS — this is a distinct flake class (time-dependent, not isolation) and a good candidate for a CI-time check or a frozen clock (`vi.setSystemTime`) in date-sensitive suites.

### Timing baseline (2026-06-14)

Full myK9Show unit suite, `forks` pool, 10-core macOS, jsdom. Wall-clock **~126–210s** in default order on an unloaded machine (one outlier 304s run coincided with a concurrent agent's load). The suite is **environment-bound, not test-bound**: cumulative `environment` (jsdom init, ~408–960s across forks) dwarfs `tests` (~210–435s), so per-file jsdom setup — not test logic — is the dominant cost. This is the signal for the deferred `fileParallelism` spike (`project_test_suite_performance`): the win is amortizing jsdom init across fewer, fatter workers.

Slowest files (run 1, ms): `ShowMapTab` 6802 · `MessageShowComposer` 5146 · `RunOrderDialog.section` 4736 · `ShowMapStructureTable` 3879 · `IncidentLogCard` 3724 · `ClassResultsTable/search-filter` 3491 · `SignUpPage` 3379 · `phase3-5-payment-components` 3315 · `useShowLiveSync` 3279 · `DayOfEntryDialog` 2867.

## Phase 6 — Budgets and cadence

1. **Bundle-size budget [after audit Wave A]:** Wave A deletes the dead `performance-budget.ts`; replace it with an enforced one — `rollup-plugin-visualizer` for the report, `size-limit` (or a small CI script) gating the main route chunks. Record the initial budget from the current build, ratchet downward only.
2. **Accessibility smoke:** `@axe-core/playwright` assertions on the top 5 role landing pages, riding the existing e2e suite. Violations triage: fix serious/critical, file moderate as OPEN-TODOS.
3. **Dependency cadence:** monthly `pnpm audit` + `pnpm outdated` as a scheduled check. First run must explicitly review the root `pnpm.overrides` pin of `@supabase/supabase-js@2.93.3` — decide to bump-and-test or document why it stays (currently it silently neutralizes caret bumps).
4. **Scheduled drift run:** weekly re-run of the audit's cheap Phase 1a/1e/1f greps (file sizes, `as any`, TODO markers), appending to the audit's baseline-delta table. Complements (not replaces) the CI ratchets, which only see PR-time deltas. Creating the schedule is a shared-system step — confirm before wiring.

**Testing:** size-limit config verified by intentionally inflating a chunk locally (gate must fail, then revert); axe assertions are tests; drift-run script gets a smoke test against the repo.

### Status 2026-06-15 — Phase 6a complete (bundle budget + a11y smoke); 6b pending

Split into **6a (code/config gates — this PR)** and **6b (scheduled jobs — items 3 & 4, shared-system, pending user go-ahead)**.

**Bundle-size budget — DONE, enforced in CI.** Inventory first (consolidate-don't-duplicate): two pre-existing budget scripts (`check-bundle-size.js`, `check-performance-budgets.js`) were both *dead* — their CLI guard `import.meta.url === ` + "`file://${process.argv[1]}`" + ` silently no-ops because the repo path contains a space (`AI Projects/`), and their `[a-f0-9]+` hash regexes never matched Vite's mixed-case hashes. Replaced both with one `scripts/check-bundle-budget.js` that parses `dist/index.html` to size the real initial-load payload (entry + modulepreloaded vendors + linked CSS) plus a per-chunk ceiling — immune to both bugs. Wired into the CI `build` job (`pnpm --filter @myk9/show budget:check`), reusing the existing build output. Budgets (RAW KB, baseline 2026-06-15, ratchet down only): **initialJs 3300** (current 3120), **initialCss 360** (current 329), **maxChunk 1550** (current 1476). Verified: 9 unit tests on the pure `evaluateBudgets`/`collectBundleStats`, plus an end-to-end check that the real build trips a deliberately tiny budget. (Aside: `vendor-charts` ~176 KB is eagerly modulepreloaded — a future code-split win.)

**Accessibility smoke — DONE (rides e2e), one real finding tracked.** `@axe-core/playwright` scan of the 5 top public landing pages (`/`, `/shows`, `/sign-in`, `/sign-up`, `/pricing-page`) in `src/test/e2e/a11y-smoke.spec.ts` (script `test:a11y`). Gates on serious/critical only. The baseline scan found exactly one serious rule — **`color-contrast`, 39–83 nodes per page** — a pre-existing design-system/theme-token issue, not something a QA phase fixes. Following the ratchet philosophy (baseline known debt, gate regressions), `color-contrast` is excluded from the gate and tracked as an OPEN-TODOS remediation task; every *other* serious/critical rule must stay at zero (verified: 5/5 pass). **CI execution note:** the e2e suite is currently disabled in CI, so a11y runs locally / whenever e2e runs. Re-enabling e2e (or adding a focused a11y CI job — now cheap since the repo is public and GHA minutes are free) is folded into the 6b CI decision rather than made unilaterally here. Authenticated role-landing a11y (secretary/judge/admin/at-show) needs a storageState fixture — deferred follow-up.

**6b — DONE 2026-06-15 (with one item intentionally skipped).** Confirmed with the user before wiring (scheduled jobs are shared-system, Phase 0).

- **Dependency cadence — built.** `.github/workflows/dependency-audit.yml`: monthly cron (`0 9 1 * *`) + `workflow_dispatch`. Publishes `pnpm outdated -r` and `pnpm audit` to the run's job summary; **fails only on a high/critical advisory** (`pnpm audit --audit-level=high`) so a clean month stays green and moderate/low transitive noise doesn't spam the dashboard. `contents: read` only — no repo writes, no auto-filed issues. Current state at build time: **0 known vulnerabilities**, so the gate is green.
- **`@supabase/supabase-js` override resolved.** The exact-version override is **kept** — it enforces a single supabase-js instance across the monorepo (version skew in a client lib causes auth/realtime bugs). Bumped `2.108.0` → `2.108.1` (latest patch) to stay current; typecheck (24/24) and full build verified.
- **Weekly drift run — intentionally SKIPPED (not built).** Phase 6 item 4 proposed a weekly scheduled re-run of the file-size / `as any` / TODO-marker greps. But `qa:code-quality-ratchet` already runs those exact checks against `code-quality-ratchet.baseline.json` in the CI `quality` job on **every PR**, and `main` only changes via gated PRs (direct-to-main is docs-only and touches no code metrics). A separate weekly cron would be motion without coverage — consolidate-don't-duplicate. If a future need arises to track drift on a time axis independent of PR cadence, revisit then.

## Phase 7 — Final regression and codification

1. Full `pnpm typecheck`, `pnpm lint`, package + app test suites green.
2. Update this doc's status notes per phase; move anything deferred into OPEN-TODOS with context (no silent drops).
3. Fold the repeatable pieces (mutation run, advisors sweep, drift scripts) into the launch-milestone checklist alongside the code-quality audit's Phase 5 skill, so both run together before each milestone.

### Status 2026-06-15 — DONE; plan complete

1. **Final regression green** (clean worktree off `main`): `pnpm typecheck` ✅, `pnpm lint` ✅ (13/13), `pnpm test:packages` ✅ (11/11), full myK9Show app suite ✅ **927 files / 9061 tests, 0 failures**.
2. **Status synced** — every phase note above is current; deferred work lives in OPEN-TODOS as tracked items (test-isolation hardening sweep, theme color-contrast, date-fixture sweep, ScoreValidator/replication mutation survivors). No silent drops.
3. **Codified** — created [`launch-milestone-qa-checklist.md`](launch-milestone-qa-checklist.md) (indexed in `docs/README.md`), which folds every repeatable gate — static audit + ratchet, mutation, db-drift, rls-smoke, bundle budget, a11y smoke, dependency audit, and the Sentry observability smoke — into one before-each-milestone sweep alongside the `/code-quality-audit` skill.

**All 7 phases are complete.** This plan is now a historical build record; the living operational doc going forward is the launch-milestone checklist. Archive to `docs/archive/` in the next docs reconciliation, once the tracked OPEN-TODOS follow-ups close (kept in place for now because the checklist and several active OPEN-TODOS items link here).
