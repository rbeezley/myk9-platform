# MYK9-289 — exhibitor query workload

Request: review and fix MYK9-289 using Nightly Health run 33960229924.

Scope: the remaining Chromium sign-in-target and my-entries settle failures after
#2018. WebKit/MYK9-244 remains separate. Preserve the five-second settle budget
and route-origin tracker reset. Use the lightweight workflow for this bounded
query-loading bug rather than introduce another OpenSpec change.

Evidence: run 49 reports an all-dog scored-results query and today-entries RPC
on sign-in-target, then offset=1000 on the own-entries query on my-entries.
The September 1/4 audits identify 251/252 per-dog manual-results requests from
off-screen DogStripCard title hooks. The landing-page card needs only its dog's
titles, but the shared hook currently requests every dog's scored history.

Duplication question: no new page or affordance; reuse the current dog rail and
title engine. Preserve all cards, navigation, title calculations, the Add Dog
header action, and the existing query/mutation paths. This changes loading only.

## Plan and testing

- [x] Reproduce the 252-card title-query fan-out with a deterministic regression.
- [x] Load title data when a card becomes visible or receives keyboard focus;
      keep loaded cards mounted so scrolling does not repeat requests.
- [x] Scope title-history queries to the selected dog without widening access;
      preserve the all-dog results-page caller.
- [x] Verify title query scope, pagination, lazy loading, focus, and cleanup.
- [x] Run focused tests, lint and TypeScript checks; inspect the final diff.
- [x] Run the real Chromium exhibitor route-health sweep with retries disabled.
- [x] Record evidence and remaining Nightly closure gate; keep MYK9-289 open
      unless its integration evidence gate is satisfied.

Hypotheses to test after the reproduction: (1) eager off-screen title hooks
cause the request burst; (2) each card's all-dog scored history adds unnecessary
work; (3) own-entry pagination remains independently slow after (1)/(2).

## Verification — 2026-09-05

Branch: `codex/myk9-289-exhibitor-queries`, based on `15ad9011c`.

- Red: `pnpm exec vitest run src/components/exhibitor/__tests__/DogStrip.loading.test.tsx`
  reported `expected ... not ... called ... actually ... 252 times` before the fix.
- Red: the title-query test expected `dog_id, [dog-a]` but observed
  `dog_id, [dog-a, dog-b]` before scoping the hook.
- Green: seven focused test files, 43 tests, including the existing request-tracker
  tests and both dog-detail title sections. Added coverage for lazy loading,
  keyboard focus, observer cleanup, per-dog cache isolation, unchanged ownership
  scope, error propagation, and histories exceeding 1,000 results.
- Green: `pnpm exec tsc --noEmit --project tsconfig.app.json` and
  `pnpm exec tsc --noEmit --project tsconfig.test.json`; targeted ESLint.
- Green: existing Chromium exhibitor sweep, all five route assertions, no retries:
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5198 pnpm test:e2e:clean src/test/e2e/route-health-by-role.spec.ts -g 'exhibitor routes render clean' --project=chromium --workers=1 --retries=0`.
  With the final implementation the sweep passed in 15.9 seconds.
- A temporary read-only browser probe measured 258 cards, **3 initial manual-result
  requests**, then 6 total after keyboard-focusing the last card. All six scored
  history requests contained exactly one dog. Both phases settled within the
  unchanged five-second budget. Probe passed in 11.3 seconds and was removed;
  the deterministic regressions remain in the test suite.
- Local browser used this worktree's Vite server and the configured staging
  database. No fixture data, database settings, timeout, or tracker behavior changed.

Review: eager title hooks and unnecessarily broad title-history scope confirmed.
Own-entry pagination did not produce a remaining failure after these changes;
its query was left intact. No blocking source findings remain in the local diff.
The all-dog results-page caller retains its existing query and pagination.

PR [#2051](https://github.com/rbeezley/myk9-platform/pull/2051) merged on
2026-09-05 at 16:13 UTC as `cca3d7f72e0ec34b87c588639f71bcb02c8ccec1`.
Integration closure remains pending post-merge Nightly verification.
Keep MYK9-289 In Review until post-merge Nightly evidence establishes route-origin
attribution and the remaining Chromium failures are cleared. WebKit/MYK9-244 is
outside this change. No claim of CI closure is made from a local green run.

The first Linear write failed with HTTP 502; subsequent implementation and merge
comments succeeded. The issue remains In Review pending the Nightly evidence gate.

## PR verification follow-up

PR #2051 / run `33975456681` passed quality, package tests, SQL tests, and app
shards 1/3 and 3/3. Shard 2/3's sole failure was the new scrolling regression
exceeding 10 seconds while resolving accessible names across 252 cards under
coverage. The large-fixture regression still mounts all 252 dogs and asserts no
title-hook calls; counting rendered names avoids unnecessary accessibility-tree
work. The independent visibility/retention test now uses only the two cards it
needs. No test or route timeout changed. All 19 dog-rail tests pass with coverage
in 1.82 seconds (603ms test execution); the follow-up reviewer approved the change.

Replacement CI run [33976128922](https://github.com/rbeezley/myk9-platform/actions/runs/33976128922)
passed quality checks, all three app test shards, package tests, SQL tests,
coverage gate/ratchet, builds, accessibility smoke, and E2E PR Smoke. Auto-merge
completed after all required checks passed. Vercel previews were quota-limited
and non-blocking; deployment is not asserted here.

## Nightly follow-up — run 33977583516

The post-merge Chromium run still failed: exhibitor/sign-in-target retained
60 settings requests (20 each show/trial/class), and secretary/reports retained
an entry replication count and download. My Entries and manual-results cleared.
Linear auto-closed on merge; explicitly reopened In Progress for this evidence gate.

Ranked hypotheses: (1) the per-class check-in map repeats shared settings reads;
(2) overlapping same-show entry syncs duplicate expensive view reads;
(3) sequential report loading contributes independent latency.
Continue the bounded bug workflow; no timeout, tracking, DB, or WebKit changes.

- [x] Prove settings request fan-out red, then batch bounded reads while preserving per-class caching and fail-closed behavior.
- [x] Test overlapping entry syncs and coalesce only if confirmed; preserve later refreshes and show isolation.
- [x] Run focused regression tests, TypeScript/lint, and Chromium exhibitor/secretary health checks.
- [ ] Review and ship the fix, then rerun Nightly; retain the issue until the Chromium evidence gate passes.

Follow-up verification:

- Settings regression failed red: expected four reads, observed 80 for 20 classes.
  Green coverage verifies four reads, per-class cache keys, 100-class filter bounds,
  per-show/trial cascades, missing classes, read failures, and recovery.
- Concurrent entry-sync regression failed red: two engine calls for the same show.
  Green coverage verifies one overlapping operation, fresh later refreshes,
  concurrent different shows, failure recovery, and existing entry replication behavior.
- Full repository TypeScript and lint checks pass (lint retains 18 existing warnings);
  code-quality ratchet passes. App and test TypeScript checks also passed separately.
- Chromium exhibitor and secretary route sweeps both pass, 40.7 seconds total,
  unchanged five-second settle budget and no retries. Same local command as above,
  with the selector expanded to include secretary routes.
- Independent review approved; added explicit simultaneous distinct-show coverage
  following its nonblocking suggestion. No DB, fixture, timeout, or tracker changes.

Nightly CI remains the closure gate; local passing sweeps do not close MYK9-289.
