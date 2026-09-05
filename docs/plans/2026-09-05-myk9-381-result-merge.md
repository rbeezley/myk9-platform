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
