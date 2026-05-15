# Code Quality: Path from 7.0 → 8.0+

**Project:** myK9 Platform Monorepo
**Date:** 2026-05-13
**Status:** Proposed
**Owner:** Richard Beezley
**Companion docs:** `docs/plans/DEBT_ACTION_PLAN.md` (broader 2026-02-03 register), `TO-DOs.md`, `OPEN-TODOS.md`, `docs/qa/e2e-suite-map.md`

## Goal

Raise the overall code-quality rating from **7.0/10** to **≥8.0/10** by closing the four dimensions where the project scores lowest:

| Dimension                    | Current | Target | Delta |
| ---------------------------- | ------: | -----: | ----: |
| Known bugs / debt management |     5.5 |    7.5 |  +2.0 |
| Testing discipline           |     6.5 |    8.0 |  +1.5 |
| Conventions & consistency    |     7.0 |    8.0 |  +1.0 |
| Performance hygiene          |     7.0 |    8.0 |  +1.0 |

The 8.0 path is **Phases 0–3 + Phase 5**. Phase 4 is intentionally separated as the sustained-8+ path: not required to justify an 8.0 rating, but required to keep the codebase from sliding back as `apps/myk9show` grows.

The other high-scoring dimensions (type safety, refactoring, security, UX care, documentation) need maintenance more than focused investment. Architecture is better than average today, but import boundaries and app size are the main long-term quality risk.

## Non-goals

- **Not** a full rewrite of any subsystem. Every task is bounded and reversible.
- **Not** a coverage-percentage chase. We target _specific high-value gaps_, not blanket coverage to a number.
- **Not** duplicating the existing `DEBT_ACTION_PLAN.md`. File-size refactors, strict-mode migration, and broad coverage targets continue under that plan; this plan is the quality-rating lift.

## Constraints from CLAUDE.md

- Every phase below has its own **Testing** section. A phase is not complete until its tests are written and green.
- All work is TypeScript-first. No new JS files.
- Files stay under 500 lines; extract helpers when they cross.
- Shared-system writes (`supabase db push`, edge deploys, force pushes) require explicit confirmation before running.

---

## Phase 0 — Baseline measurement (0.5 day)

Lock in current numbers so we can prove the lift at the end.

### Tasks

- [ ] Run `pnpm typecheck` and `pnpm lint` across the monorepo; record any failing packages.
- [ ] Run `cd apps/myk9show && pnpm test --reporter=json > /tmp/baseline-show-tests.json` and record pass/fail/skip counts.
- [ ] Run `cd apps/myk9q && pnpm test --reporter=json > /tmp/baseline-q-tests.json`.
- [ ] Run `pnpm qa:e2e-map:check` and confirm the suite map is in sync.
- [ ] Count quarantined E2E specs (per TO-DOs.md "Nightly E2E Repair Queue" section). Currently: ~13 unchecked items.
- [ ] Snapshot `git ls-files | grep -E '\.(ts|tsx)$' | xargs wc -l` totals.
- [ ] Snapshot `OPEN-TODOS.md` line count and unchecked-item count.
- [ ] Replace every "memory says" claim in this plan with a repo-verifiable source: local file path, issue/PR link, grep output, or a reproduction note in the baseline file.

### Acceptance criteria

A new file `docs/plans/2026-05-13-quality-baseline.md` exists with all measurements, dated and committed. It includes source links or reproduction notes for each inherited claim. We re-run the same measurements in Phase 5 and diff.

### Testing

N/A — measurement only. The "test" is that the baseline file exists and is reproducible.

---

## Phase 1 — Stop the bleeding (1–2 weeks, must finish first)

The two issues that are actively hurting the rating _every day they stay open_.

### 1.1 Close the scoring sync data-loss bug

**Severity:** Critical. Reported open since 2026-03-29; Phase 0 must verify the current status from a repo-visible source or reproduce it directly. For an event-scoring product, dropped score mutations are the worst class of bug.

**Scope:**

- Reproduce the bug in a Vitest integration test against `useEntryStore.recordResult` + the replication layer. Write the **failing test first** (assertion-first per CLAUDE.md).
- Trace the mutation from `recordResult` → store → `@myk9/replication` → Supabase `entries` table updates. Verify the flush path.
- Likely suspects (verify, don't assume):
  - Optimistic store update not being persisted because of a stale `userId` or missing dirty flag.
  - Replication queue swallowing the mutation when offline-then-online transitions occur.
  - `useEntryStore.getState().recordResult` called outside React render not triggering subscription that pushes to network.
- Fix at the root cause. Do not paper over with a retry loop.

**Files most likely involved:**

- `apps/myk9show/src/store/entryStore.ts`
- `packages/replication/src/ReplicatedEntriesTable.ts`
- `apps/myk9show/src/pages/ClassDetailsPage/SecretaryRunSheet/useRunSheetState.ts` (now simplified, but the `onSaveResult` path lives upstream in `ClassDetailsPage` post-PR-177)
- `apps/myk9show/src/pages/scoring/hooks/usePaperScoring.ts`

**Acceptance criteria:**

- A reproducible Vitest integration test exists that **fails on `main` before the fix** and **passes after**.
- A manual end-to-end smoke (record a score on a real class via paper scoresheet, refresh the page, confirm the score persisted) is run on staging and recorded in the PR.
- The tracking source identified in Phase 0 is updated to status "closed" with the commit SHA, or the follow-up doc records that no repo-visible tracking source exists and links the reproducing test instead.

**Testing:**

- Unit test for the specific code path that was broken.
- E2E spec: extend `apps/myk9show/src/test/e2e/secretary-entry-walk.spec.ts` (already in the staged changes) with a score-record-then-reload assertion. Promote to Nightly per `docs/qa/e2e-suite-map.md` rules.

### 1.2 Restore CI gates

**Severity:** High. Phase 0 must verify whether GitHub Actions is currently paused or failing for non-code reasons. If CI is offline or noisy, that trains the team to ignore CI signal.

**Scope:**

- Decide between three options and execute one:
  1. Resolve GHA billing (fastest, lowest risk).
  2. Move to a self-hosted runner (cheap, ongoing maintenance).
  3. Move to a different free-tier CI (CircleCI, Cirrus, etc.) — only if neither 1 nor 2 is feasible.
- Re-enable required checks on `main`: `pnpm typecheck`, `pnpm lint`, both apps' unit tests, `pnpm qa:e2e-map:check`.
- Add the existing `pnpm test` and `pnpm typecheck` commands as required PR checks before merge.

**Acceptance criteria:**

- A PR against `main` shows green CI checks before merge.
- A deliberately-broken PR (typecheck error, failing test) is **blocked** by CI.

**Testing:**

- Verify by opening a draft PR with one each of: a TS error, a unit test failure, a lint error. Confirm each is caught.
- This touches GitHub shared-system state. Get explicit confirmation before creating draft PRs, changing branch protection, or changing required checks.

---

## Phase 2 — Finish what was started (1 week)

Half-shipped changes erode the "say what you mean" property of the codebase. Close these out.

### 2.1 Complete or revert the Scratch → Pull rename (from PR 177)

**Decision point first.** Discuss with stakeholders: is the user-facing term "Pull" (current state in `ScratchManagementTab` UI strings) or "Scratch" (everywhere else)? Pick one. The cost is the rename; the _worse_ cost is the current dual-vocabulary state.

**If "Pull" wins:**

- Rename `ScratchManagementTab.tsx` → `PullManagementTab.tsx`.
- Rename component, props, types: `ScratchManagementTab` → `PullManagementTab`, `ScratchRequest` → `PullRequest`, `ScratchManagementTabProps` → `PullManagementTabProps`.
- Rename service functions: `getPendingScratchRequests` → `getPendingPullRequests`, `approveScratchRequest`, `denyScratchRequest`, `getScratchedEntries`.
- Rename `ScratchEntriesTable.tsx`, `ScratchDialog.tsx`, `ScratchCell`, `onScratch`, `onScratchDirect`, `ScratchableEntry`.
- Update DB layer: check `services/database/queries/scratchQueries.ts` and any RPCs/migrations. **Do not rename DB columns or RPC names without explicit approval** — that's a shared-system change. Keep DB-level names as a glossary layer if needed.
- Update all import sites via search-and-replace, then `pnpm typecheck` to catch misses.

**If "Scratch" wins:**

- Revert the UI strings in `ScratchManagementTab.tsx` to use "Scratch" everywhere.

**Files affected (estimated):** ~15–25 files based on grep of "Scratch" in `apps/myk9show/src/`.

**Acceptance criteria:**

- User-facing strings and domain-level app code use one chosen vocabulary.
- Any remaining DB/RPC/file compatibility names that keep the old vocabulary are isolated behind a small glossary/adapter layer and documented in the file where the translation happens.
- A targeted grep review of `Scratch` and `Pull` has no unexplained mixed-vocabulary matches.
- All existing tests still pass.

**Testing:**

- Run existing `ScratchEntriesTable.test.tsx` and any related dialog tests. They should pass after the rename without any logic change.
- Add one new test: that the UI label and the toast message use the same word (so future drift is caught).

### 2.2 PR 177 follow-ups

Items I called out in the PR 177 review that didn't block merge but should be closed within a sprint of the merge.

#### 2.2.1 Tighten `dogRegistrationBreed.organizationMatches`

Currently:

```ts
return registration === show || registration.includes(show) || show.includes(registration);
```

This will falsely match `"UKC"` against `"UK"`, `"NACSW"` against `"NA"`, etc. Tighten to exact-match-after-normalize, or document the loose intent with a test that pins the actual matching matrix.

**Files:** `apps/myk9show/src/lib/dogRegistrationBreed.ts`

**Acceptance criteria:**

- A new test file `apps/myk9show/src/lib/dogRegistrationBreed.test.ts` covers:
  - Exact match (`"AKC"` vs `"AKC"`) → true
  - Case insensitive (`"akc"` vs `"AKC"`) → true
  - Trimmed (`" AKC "` vs `"AKC"`) → true
  - False positive substring (`"UK"` vs `"UKC"`) → **false** (this is the assertion that drives the fix)
  - Compound name (`"AKC-Performance"` vs `"AKC"`) → documented behavior (decide: true or false, then pin it)

**Testing:** The new test file is the testing phase. Write it first; let the false-positive case fail; then fix `organizationMatches`.

#### 2.2.2 Verify `useMyEntries` semantics change does not silently break staff UIs

PR 177 removed the `canSeeAll` branch from `useMyEntries`, so admin/secretary/club-admin users no longer see "all entries" from this hook — only entries for their personally-owned dogs.

**Scope:**

- Grep for every callsite of `useMyEntries` in `apps/myk9show/src/`.
- For each, manually verify (via dev mock user) that the UI is still correct when the logged-in user is a secretary with **zero personally-owned dogs**.
- Confirmed callers to check: `ShowDetailsPage.tsx` (hero tab default), `MyShowStatsTab`, `MyEntriesTab`, `useMyEntriesInClass`.

**Acceptance criteria:**

- For each callsite, either:
  - A comment + test confirms the behavior is intended even when no owned dogs.
  - The callsite is updated to use `useEntriesByShowQuery` (server fetch) for staff-wide views.

**Testing:**

- Add a Vitest test for `useMyEntries` covering the "signed-in but no owned dogs" case explicitly (returns empty, `isLoading=false`).
- Add an integration test for `ShowDetailsPage` rendering correctly under a mock secretary user with zero dogs.

---

## Phase 3 — Prune the debt (2–3 weeks)

The OPEN-TODOS and quarantine lists are load-bearing. Visible unfinished work degrades trust in the entire codebase even when the code itself is fine.

### 3.1 Resolve the E2E quarantine

Per TO-DOs.md "Nightly E2E Repair Queue — 2026-05-12", three specs target obsolete test IDs (`search-input`, `network-error-boundary`, `dog-card-*`):

- `cross-role-workflows.spec.ts`
- `errorHandlingAndRecovery.spec.ts`
- `performanceAndCaching.spec.ts`

**Scope per spec:**

For each quarantined spec, make a deliberate **delete vs rewrite** decision:

1. Read the spec and identify the _intent_ (what user-facing behavior was it trying to protect?).
2. Check if current UI still has equivalent behavior worth protecting.
3. If yes → rewrite using current test IDs and promotion rules from `docs/qa/e2e-suite-map.md`.
4. If no → delete the spec file and add a one-line entry to `docs/qa/findings.md` explaining the deprecation.

**Order:** Tackle one per week so we don't pile up half-rewritten specs.

**Acceptance criteria:**

- The TO-DOs.md "Nightly E2E Repair Queue" section has zero unchecked items, or each remaining item has a documented "deferred" reason.
- `docs/qa/e2e-suite-map.md` reflects the final state.
- Promoted specs pass alone _and_ in the stable smoke command.

**Testing:**

- Each rewritten spec runs green via `pnpm test:e2e:clean <spec> --project=chromium --workers=1`.
- The stable smoke command continues to pass after each promotion (regression gate).

### 3.2 Close the hardening backlog

From memory `project_harden_backlog.md` and recent observations:

- [ ] **`useDogsQuery` admin double-fetch bug** — first verify the double-fetch with a test or profiler output. If confirmed, fix the dependency array or memoization. Add a test that asserts the underlying query function is invoked exactly once per mount.
- [ ] **Add Club silent validation failure for non-admin secretaries** — first verify the RLS/permission behavior from a repo-visible source or reproduction. If confirmed, either surface the actual permission error or hide the affordance for users who can't use it.
- [ ] **Base UI native-button warnings** — verify current status by grepping the audit output or rerunning the relevant audit. If warnings remain, fix them; if already fixed, record the verifying command in the follow-up doc.

**Testing:**

- Each item gets a unit or component test that asserts the fixed behavior.

### 3.3 Add unused-export detection

With 4,044 TS/TSX files, dead code is mathematically certain. Quantify it with `ts-prune` or `knip`.

**Scope:**

- Add `knip` as a dev dep at the monorepo root.
- Add a `pnpm dead-code` script that reports unused exports per app.
- Generate a baseline list, triage into "delete now" vs "keep, used by external tooling."
- Add `pnpm dead-code` to the local pre-commit hook **as a warning, not a block**. Promote to block once the list is below a sane threshold (e.g., < 50 entries).

**Acceptance criteria:**

- Baseline report exists.
- At least 30 truly-unused exports are deleted in a single follow-up PR.
- `pnpm dead-code` runs locally as a warning first. CI may run it as informational after the baseline lands; promote it to a blocking gate only after the baseline is below the agreed threshold.

**Testing:**

- Once promoted to blocking mode, `pnpm dead-code` exits non-zero on a contrived unused export added in a test branch. Before that promotion, verify that the report is generated consistently and does not block unrelated work.

---

## Phase 4 — Structural improvements (2–3 weeks)

These are the deeper investments that pay back over 6+ months. They are not required to hit 8.0, but they are required to sustain an 8+ codebase as the app grows and to make 8.5+ achievable.

### 4.1 Partition `apps/myk9show/src/` into feature modules

The 592k-line app currently has free cross-imports between `features/`, `pages/`, `components/`, `hooks/`, `services/`. PR 177 touched 96 files for a UX cleanup partly because of this density.

**Scope (incremental — do NOT rewrite all at once):**

Pick the top 3 highest-coupling features by import count:

1. Likely `show-map` (already partially partitioned)
2. Likely `scoring`
3. Likely `entry-management`

For each:

- Move the feature into `apps/myk9show/src/features/<feature>/` if not already there.
- Add `index.ts` barrel export that defines the _public_ surface.
- Convert imports from anywhere else in the app to go through the barrel.
- Add an ESLint rule (or a custom script in `scripts/`) that forbids deep imports into a feature.

**Acceptance criteria:**

- For the three migrated features, all external imports go through the barrel.
- A grep for `from '@/features/<feature>/internal/'` returns zero hits from outside the feature.
- Bundle size does not regress (re-run the Vite build size report).

**Testing:**

- Existing tests continue to pass.
- A contrived deep-import in a test branch is rejected by the new lint rule.

### 4.2 Performance hygiene pass

Smaller items I noticed:

- `PaperScoresheetPage.loadShowOrganizationForClass` chains three replicated-table awaits in series. Parallelize where data is independent.
- `ShowDetailsPage` eagerly calls `loadTrials()` and `loadTrialClasses()` on every show change — confirm the store is idempotent, and if not, gate on a "has been loaded for this id" flag.
- Audit lazy-loading: confirm all heavy tabs (`ShowMapTab`, `MyShowStatsTab`, `ShowResultsTab`) are `React.lazy` and that none of them are pulled in eagerly via a sibling import.

**Acceptance criteria:**

- Lighthouse or equivalent perf number on the show details page is ≥ baseline (don't regress while cleaning up).
- The eager `loadTrials/loadTrialClasses` effect either short-circuits when already loaded or is justified with a comment.

**Testing:**

- A unit test for `loadShowOrganizationForClass` that protects the behavior and proves independent fetches are initiated before dependent work awaits their results. Avoid over-specifying event-loop timing unless the implementation requires it.

---

## Phase 5 — Re-rate (1 day)

After Phases 1–3 are complete (Phase 4 remains optional for the 8.0 rating, but should be tracked as the sustained-8+ follow-up):

### Tasks

- [ ] Re-run all Phase 0 measurements.
- [ ] Diff against the baseline and write up the result in `docs/plans/2026-05-13-quality-rating-followup.md`.
- [ ] Self-rate against the same 10 dimensions used in the original rating.
- [ ] If overall is ≥ 8.0 → ship the followup, close this plan, archive into `docs/plans/strategy/`.
- [ ] If overall is < 8.0 → identify which dimension fell short, branch the plan, iterate.

### Predicted dimension lifts after Phases 1–3

| Dimension                    | Before |  After Ph 1–3 (predicted) |
| ---------------------------- | -----: | ------------------------: |
| Known bugs / debt management |    5.5 |                       7.5 |
| Testing discipline           |    6.5 |                       8.0 |
| Conventions & consistency    |    7.0 |                       8.0 |
| Performance hygiene          |    7.0 | 7.5 (Ph 4 gets it to 8.0) |
| **Overall (weighted)**       |    7.0 |                       8.0 |

---

## Sequencing & risks

- **Phase 1 must finish first.** Closing the data-loss bug is the highest-value single action. Doing it while CI is offline is dangerous — restore CI in parallel or before.
- **Phase 2's Scratch→Pull rename is a decision-first task.** Don't start renaming until the vocabulary is chosen.
- **Phase 3's quarantine prune is the most time-consuming**, but each spec is independent — can be parallelized across sessions.
- **Phase 4 is optional for 8.0.** It's the difference between 8.0 (good) and 8.5+ (excellent). Don't gate the rating-lift PR on it.
- **The biggest risk** is touching the scoring sync bug without a reliable reproduction. Spend the first day of Phase 1 on the failing test; do not write code until the test fails reliably.

## Definition of done for the plan as a whole

- Phases 0, 1, 2, 3 all complete with PRs merged.
- Phase 5 re-rating shows overall ≥ 8.0.
- The bottom four dimensions in the table above each show their predicted lift.
- This plan file is archived to `docs/plans/strategy/` with a "completed" header.
