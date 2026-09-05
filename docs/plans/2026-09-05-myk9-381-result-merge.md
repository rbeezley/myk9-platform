# MYK9-381: preserve canonical results in the exhibitor schedule

> **Status:** Active — PR #2044 merged; closure evidence attachment pending.

User request: “proceed” with the recommended MYK9-381 result-merge fix.

Continue #2031's existing mapping work. The canonical per-show read must replace
local competition data, including clearing results that are withheld or absent.
Keep the existing registration merge, pending sync metadata, and store-only
fallback. This is a narrow review fix, so use the lightweight workflow rather
than creating a separate OpenSpec change.

Does this duplicate an existing page? No: repair the data feeding My Entries;
add no new page or affordance. Preserve the exhibitor's trust in released results.

## Implementation and testing

- [x] Render MyEntriesTab with the real hook, canonical rows and existing local
      rows. Assert released Q/time, corrections, withheld results, and independent
      placement withholding. Run red before changing the merge.
- [x] Replace only competitionData in mergeCanonicalEntry, including undefined.
      Verify unrelated pending registration fields and sync metadata survive.
- [x] Hydrate per-show scored entries from the existing authenticated result
      view. Retain replication-backed identity, mask unavailable results, preserve
      independent null visibility fields, and batch IDs to avoid response limits.
- [x] Pass the new tests and relevant hook/mapper/display tests, typecheck and
      changed-file lint; inspect the diff and run git diff --check.
- [x] Replay the named Heartland rows as the exhibitor against the local fix;
      record Q/time and judge evidence without changing shared fixtures.
- [x] Prepare the verified fix and PR description for review.
- [x] Publish the PR and update Linear after confirmation; keep it open until
  required verification and delivery gates are satisfied.

## Scope and evidence

Canonical issue: https://linear.app/myk9-platform/issue/MYK9-381.
Do not alter scoring writes, RBAC, visibility policy, judge mapping, or the
placement-oriented Results tab. Browser closure fixture: Heartland show
`dededede-0000-0000-0000-000000000010`, Willow's Container/Interior entries.

The signed-in replay exposed a second missing step: `getEntriesByShow` returned
only masked result columns. Correcting the merge alone left the real rows without
results. The read now uses the same cascade-aware authenticated view as
`getUserEntries`; server release policy remains authoritative. Errors retain the
entry list with scores masked. No replicated-table or policy changes are needed.

### Local verification — 2026-09-05

- Assertion-first: all six new real-hook/render cases failed before the merge
  fix. Five new read-layer cases failed before wiring the authenticated view;
  the unscored/no-request case already passed. Both suites pass after the fix.
- 86 focused tests passed across 12 files, covering the new render/read cases,
  existing canonical normalization, judges, Results tab, online fallback,
  tombstones, and result visibility.
- App and test TypeScript checks passed. Monorepo lint passed with 18 existing
  warnings outside the changed files. Edge-test typecheck passed. E2E typecheck
  passed its existing ratchet (59 known diagnostics; zero new), rerun outside
  the sandbox after tsx was blocked from opening its local IPC socket.
- Browser at `http://127.0.0.1:5181`, using the real signed-in exhibitor and
  shared read-only fixture: Willow Container Novice A shows **Q · 0:38.50**,
  Scout Container Novice A **Q · 0:41.20**, and Willow Interior Advanced
  **Q · 0:52.40**. Each names **Test Judge**; no placements appear. A screenshot
  of all three rows is recorded in the Codex task. Verified again after the
  final source change. The fixture has been reseeded to October 20–22; it was
  not changed during this work.
- Local evidence does not imply deployment. Keep MYK9-381 open until the fix is
  delivered and its closure evidence is attached to the issue.

### Merge — 2026-09-05

[PR #2044](https://github.com/rbeezley/myk9-platform/pull/2044) merged at
14:02 UTC as `9e29197e0c2343839765399201514d03401dc02f`. All required CI
checks passed, including all three app shards, coverage, builds, browser smoke,
and accessibility smoke. CI caught a test-local database error stub; the fixture
now imports the real helper, and the guard plus both new suites pass (24 tests).
The preview replay required Vercel login. The earlier named local replay remains
valid, but its screenshot still needs attachment to Linear before issue closure.

### Follow-up: partially populated replica — 2026-09-05

The deployed browser showed only 18 My Entries and omitted Willow's Interior
52.40 entry, while the same exhibitor's server reads included it (515 base rows;
516 result-view rows). The base scored entry and its completed Interior class
both exist and are not deleted. `getEntriesByShow` trusted any nonempty local
replica without syncing the show; the empty-only online fallback cannot repair
partial caches. This is a narrow continuation of the same read-path fix, using
the existing plan rather than a new OpenSpec change or UI surface.

- [x] Regression test: populated cache missing the Interior entry fails before
  the fix (expected Interior ID, received Container ID only).
- [x] Refresh the scoped entry replica before reading; preserve existing
  conflict/tombstone handling and cached offline reads.
- [x] Run scoped read, visibility, render, and tombstone tests plus type/lint checks.
- [x] Replay the original named browser fixture and save screenshot evidence.
- [ ] Publish the follow-up for delivery; close only after deployed evidence passes.

Local replay of the follow-up: My Entries now has 515 rows and renders Willow
Container Q · 0:38.50, Scout Container Q · 0:41.20, and Willow Interior
Q · 0:52.40 with Test Judge. Screenshot saved as
`/private/tmp/MYK9-381-scoped-sync-fixed.png`. This is local evidence, not a claim
that the follow-up has deployed. The focused eight-file suite passes 80 tests;
app TypeScript and changed-source lint pass. Full monorepo typecheck passes
(including the existing E2E diagnostic ratchet), and lint passes with 18 existing
warnings outside this change.

Review identified an unbounded sync wait on unreliable Wi-Fi. The refresh now
waits at most three seconds before continuing with the cache; normal sync may
finish in the background. A never-settling sync regression verifies cached rows
remain readable and the timer is cleared. Independent re-review approved the
correction with no remaining blockers.

Full app suite: 1,981 files and 19,007 tests passed; two native filesystem-watch
assertions failed under the sandbox. The complete affected watcher file passed
outside the sandbox (3 tests). Final test TypeScript also passes.
