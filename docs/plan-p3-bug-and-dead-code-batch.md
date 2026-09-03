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
- MYK9-328 is In Progress; the other four sweep issues are marked Done in Linear. MYK9-298 shipped in #1948;
  MYK9-308/313/322/328 closed after PR
  [#1984](https://github.com/rbeezley/myk9-platform/pull/1984), merge commit
  `84324c1ff595c3fd8da314e3d3facf44d5410d7d`, with required CI passing.
  MYK9-328's earlier approved `@myk9/supabase` subset shipped in #1977.
  This does not mean every originally listed package export was deleted:
  [the Wave 3 inventory](qa/wave3-dead-code-import-inventory.md) records retained
  live/compatibility APIs and deferred package ownership decisions. The inert
  replication TTL awaits approved public-boundary safety tests; never wire it.
- MYK9-305 is Done after acceptance verification against main `8d6264d29`:
  numeric armband tie-breaking reuses the shared helper, missing/non-numeric
  armbands sort last, and the behavioral test pins 1, 9, 10 ordering. The fix
  already shipped in #1956; the stale Linear status is reconciled.
- MYK9-309 is Done after PR
  [#1988](https://github.com/rbeezley/myk9-platform/pull/1988) merged as
  `e637b95f4c3990facc849a5e0bb801b29d2b0f57` with independent approval and all
  required CI passing. The standalone hook now prioritizes `isError` over cached
  `true` and returns an accurate retry reason; the production batch-map already
  failed closed. Real-hook tests cover failed refresh, recovery, loading, and
  cold-offline map behavior. No production caller currently uses the standalone
  hook; its retained public contract now satisfies the acceptance criteria.
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

The batch remains Active for the deferred package cleanup.
MYK9-309's acceptance gap is closed, sweep issue tracking is reconciled, and
MYK9-334's implementation and deployment acceptance gates are complete. The owner
confirmed internal-only packages on 2026-09-02. External compatibility is resolved;
implementation, TTL behavioral verification, review, and merge are not all complete.
Do not treat retained APIs as deleted or wire the TTL.

## Internal-package continuation

OpenSpec: `openspec/changes/internal-package-dead-code/`. Branch:
`codex/myk9-328-completion`, based on `d5a495862`. Work is local and unmerged.
The [package inventory](qa/myk9-328-package-dead-code-inventory.md) records
167 removed source declarations on `codex/myk9-328-completion`.
The missing temporary worktree was recovered from recorded file patches.
The remaining ringside/logger/secretary helpers are now removed locally.
Email is types-only; production Edge builders own rendering and keep their tests.

Current evidence: eight affected package builds, 1,331 retained package tests,
174 production email tests, and 521 app at-show/email-prop tests pass.
Broad verification is recorded in the active OpenSpec change.
Replication TTL tests/removal still require test-boundary approval; PR publication,
review/CI/merge and tracking closure remain pending. MYK9-328 is not Done.

## MYK9-309 failed-refresh follow-up

Scope: make the standalone hook's public result fail closed on an actual query
error even when React Query retains cached `true`. Preserve the null-class and
loading defaults, the existing production batch-map behavior, query keys,
network mode, and the settings-read path. No new UI or database changes.

- [x] Reproduce cached success followed by failed refresh through the public hook
      with a real QueryClient and mocked database boundary; assert `enabled: false`
      before changing the implementation.
- [x] Give `isError` priority over cached data and provide a settings-error reason
      instead of claiming show management disabled check-in.
- [x] Verify recovery, loading/null-class behavior, and the batch-map regression;
      run focused tests, app typecheck, lint, and diff checks.
- [x] Publish reviewed changes and close MYK9-309 only after its merge/evidence gate.

Local evidence: the new public-hook test failed with `expected true to be false`
before the fix and passes afterward. The hook suite passes 15 tests; a shuffled
hook + Show Map run passes 33 tests (seed 309), and the hook suite also passes
seed 310. `pnpm --filter @myk9/show typecheck` passes (E2E ratchet: 59 current,
62 baselined, 0 new); its first attempt hit a local tsx IPC sandbox restriction,
then passed with IPC permitted. App lint passes with the existing 18 warnings,
and formatting/diff checks pass. No Supabase deployment is needed for this hook
change.

Merge evidence: PR #1988 merged as `e637b95f4c3990facc849a5e0bb801b29d2b0f57`.
Independent review returned APPROVED; all executed jobs in
[CI run 33708400999](https://github.com/rbeezley/myk9-platform/actions/runs/33708400999)
passed, including SQL, all three app-test shards, coverage, quality checks,
builds, accessibility smoke, and E2E PR smoke. Linear acceptance checkboxes and
status are reconciled to Done. The non-required app preview hit the Vercel daily
deployment quota; merge evidence does not establish a new staging deployment.
