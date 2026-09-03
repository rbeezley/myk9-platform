# P3 bug and dead-code batch

> **Status:** Active

## Scope

Fix the nine confirmed P3 defect behaviors represented by MYK9-305, MYK9-309,
MYK9-314, MYK9-319, MYK9-320, MYK9-321, MYK9-327, and the three bundled edge
function defects in MYK9-334. Consolidate the five dead-code sweeps in
MYK9-298, MYK9-308, MYK9-313, MYK9-322, and MYK9-328 only where whole-repo
reference evidence confirms the symbols are unreachable.

## Implementation order

1. Add red/green focused tests and fix Show Map ordering, self-check-in error
   defaults, QR checksum validation, styled entry-blank payment mapping, score
   area-time position preservation, registry helper usage, and edge-function
   failure handling.
2. Replace support-ticket two-step creation with the smallest transactional
   server-side path permitted by the existing database conventions and tests.
3. Delete verified dead modules/exports and their test-only coverage across the
   five sweep areas. Delete the replication TTL machinery; do not wire its
   refresh path because wall-clock expiry would create false-empty offline reads.
4. Run focused tests, package/app typechecks and lint, then the code-quality
   ratchet. Review the final diff for unrelated changes.

## Testing phase

- Unit tests for each changed behavior, including failure and malformed-data
  paths.
- Edge-function tests registered in the existing edge test configuration.
- Package/app typecheck, lint, and `qa:code-quality-ratchet`.
- Full relevant Vitest suite after focused tests pass.

## Progress — 2026-09-02

- PR [#1956](https://github.com/rbeezley/myk9-platform/pull/1956) merged as
  `256e657812522721aff29597c38d86e654268d3f`. The two support-ticket migrations
  were applied to the remote project. Downloaded live source confirms the merged
  cron-response fix (v55) and no-subscription conflict/stale-row fix (webhook v89).
- All five sweep issues are marked Done in Linear. MYK9-298 shipped in #1948;
  MYK9-308/313/322/328 closed after PR
  [#1984](https://github.com/rbeezley/myk9-platform/pull/1984), merge commit
  `84324c1ff595c3fd8da314e3d3facf44d5410d7d`, with required CI passing.
  MYK9-328's earlier approved `@myk9/supabase` subset shipped in #1977.
  This does not mean every originally listed package export was deleted:
  [the Wave 3 inventory](qa/wave3-dead-code-import-inventory.md) records retained
  live/compatibility APIs and deferred package ownership decisions. The inert
  replication TTL remains retained pending that decision; never wire it.
- MYK9-305 is Done after acceptance verification against main `8d6264d29`:
  numeric armband tie-breaking reuses the shared helper, missing/non-numeric
  armbands sort last, and the behavioral test pins 1, 9, 10 ordering. The fix
  already shipped in #1956; the stale Linear status is reconciled.
- MYK9-309 remains Todo after acceptance verification. The production batch-map
  caller fails closed on `isError`, and lookup errors throw, but the standalone
  hook still ignores `isError` when cached data is `true`. An installed React
  Query observer reproduction produced `isError: true`, `isLoading: false`,
  `data: true` after a failed refresh; the standalone hook's expression still
  evaluates to enabled. No production caller currently uses that standalone
  hook. Its explicit acceptance criterion still requires a cached-success /
  failed-refresh regression test and an error-aware result before closure.
- Verification for this tracking reconciliation: the Show Map tree and
  self-check-in hook suites passed (2 files / 29 tests). Existing tests cover
  cold query failures but not MYK9-309's cached-success failure case. No
  production code or deployment changed during reconciliation.
- MYK9-334 is Done: PR [#1982](https://github.com/rbeezley/myk9-platform/pull/1982)
  merged as `df598effe` after independent approval and green required CI. Cron
  outcome monitoring, deduplicated alerts, dead email removal, and behavioral
  coverage are deployed to the paid remote project: cron v56, webhook v90,
  send-email v74. Downloaded source/dependencies match the reviewed code exactly
  (9, 25, and 10 files respectively). Evidence is recorded in Linear and
  `openspec/changes/archive/2026-09-02-myk9-334-edge-function-closeout/verification.md`.
  The two main specs are synced and the completed change is archived.
- Scope boundary: the new cron monitoring covers the primary expired-offer query
  and existing recorded operational errors. Secondary capacity/promotion queries
  that currently suppress their errors remain an existing limitation, not a
  guarantee added by this follow-up.

The batch remains Active for MYK9-309's remaining acceptance gap and the explicitly
deferred package decisions. Sweep issue tracking is reconciled, and MYK9-334's
implementation and deployment acceptance gates are complete; neither justifies
marking the remaining work complete.
