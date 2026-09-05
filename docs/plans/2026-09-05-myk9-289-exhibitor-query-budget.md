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

Integration closure remains pending until this fix is merged and deployed.
Keep MYK9-289 In Review until post-merge Nightly evidence establishes route-origin
attribution and the remaining Chromium failures are cleared. WebKit/MYK9-244 is
outside this change. No claim of CI closure is made from a local green run.

The implementation/evidence comment to Linear failed with HTTP 502
(`upstream_unavailable`); the issue was not marked Done. Repository evidence is
saved here and in `docs/qa/findings.md` for the next tracker update.

## PR verification follow-up

PR #2051 / run `33975456681` passed quality, package tests, SQL tests, and app
shards 1/3 and 3/3. Shard 2/3's sole failure was the new scrolling regression
exceeding 10 seconds while resolving accessible names across 252 cards under
coverage. The large-fixture regression still mounts all 252 dogs and asserts no
title-hook calls; counting rendered names avoids unnecessary accessibility-tree
work. The independent visibility/retention test now uses only the two cards it
needs. No test or route timeout changed. All 19 dog-rail tests pass with coverage
in 1.82 seconds (603ms test execution); the follow-up reviewer approved the change.
