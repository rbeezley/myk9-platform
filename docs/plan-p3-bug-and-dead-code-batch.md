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
- MYK9-298 is Done. MYK9-308/313/322 are active in the separate wave-three
  worktree; do not duplicate those changes. MYK9-328's approved `@myk9/supabase`
  subset merged in #1977; broader package compatibility/ownership decisions
  remain deferred. Never wire the inert replication TTL.
- MYK9-334 follow-up is tracked in
  `openspec/changes/myk9-334-edge-function-closeout/`: cron outcome monitoring,
  deduplicated operator alert delivery, four dead email templates removed, and
  behavioral edge tests. Local implementation is prepared; shared publication,
  merge, deployment, and Linear close-out still require approval/evidence.
- Scope boundary: the new cron monitoring covers the primary expired-offer query
  and existing recorded operational errors. Secondary capacity/promotion queries
  that currently suppress their errors remain an existing limitation, not a
  guarantee added by this follow-up.

The batch remains Active; neither the outstanding sweeps nor MYK9-334's deployment
acceptance gate should be marked complete from PR #1956 alone.
