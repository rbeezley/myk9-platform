# Codex daily commit review — 2026-10-15, resumed partial run

source: codex. **Incomplete source review.** Three commits / 31 changed files reviewed from `8f6c1b49a0f0ce1333ab35b12629ca2d9c853cc0` exclusive through `15a52455eced03c95fea864b1e31ca1d977db9a2` inclusive. No new actionable defect confirmed in this prefix. This is not a clean verdict for current main.

## Boundary and outstanding coverage

Shared cursor, including its pre-existing uncommitted stamp, supplied the start. Window: **2026-10-13T15:15:14Z–2026-10-13T16:33:12Z**. No initial temporal gap or 24-hour fallback. Fetched main/origin/main and test baseline: `c5ccc00527a25b6ffe421339b7e76e68c65ba982`.

**83 commits remain unreviewed:** `(15a52455e, c5ccc0052]`. Later paper-scoring fixes were inspected for candidate reconciliation; later replication/person-authorization inspection was partial, not contiguous review coverage. Passing tests across this remainder do not substitute for source review. The run advances only three commits; the full requested review remains incomplete. The test-execution concern narrowed, so it must not be cited as a continuing hard blocker for the whole audit.

Shared row stamped `15a52455eced03c95fea864b1e31ca1d977db9a2`, window end `2026-10-13T16:33:12Z`, runner `codex-daily-commit-review`, run date 2026-10-15. Next run starts there, never at the test baseline.

## Counts

New 0; unchanged 1; resolved 3; duplicate 0; rejected 1; blocked 0. Resolved severities: P0 1, P1 1, P2 1. Unresolved: P2 1 verification prerequisite. Linear created 0, modified 1 (MYK9-1196 evidence comment), closed/reopened 0. No confirmed actionable finding left unfiled. Prior historical ledger outside this prefix was not freshly reconciled and is not asserted unchanged.

## P0 — newly resolved historical online exposure

[MYK9-1126](https://linear.app/myk9-platform/issue/MYK9-1126), source High; classification account-isolation/security; status resolved for the accepted online dog-detail scope. First seen October 12, last reviewed October 15; owner Richard Beezley. Baseline above; source: codex.

Before #2957, account B could open A's dog URL and receive A's clean replica record online. `apps/myk9show/src/services/database/dogs/dogDetailRead.ts:160` now asks the server first and honors permission/not-found errors, overlaying only the current account's unsent work through `packages/replication/src/core/ReplicatedTable.ts:230`. Expected: B never receives A's clean dog on an online detail read. Impact was exposure of dog/owner/microchip fields; P0 follows the scorecard's security-exposure definition, independent of Linear's historical High priority.

Proof: exact October 13 16:33 Linear closure comment records red-first account-switch tests, mutation checks, 28,248 shuffled tests and the owner's server-first scope decision. Fresh 198-file selection includes `accountSwitchReplica.test.ts` and `dogDetailRead.test.ts`, and passed; package `ReplicatedTable.test.ts` passed separately. High confidence for this bounded closure. The offline-before-first-sync window was explicitly retained by the owner; broader replica scope is MYK9-1133, and false-empty roster scope is MYK9-1139, not newly closed by this report.

## P1 — newly resolved paper-scoring cold load

[MYK9-1130](https://linear.app/myk9-platform/issue/MYK9-1130), alias NCR-2026-10-13-01; source High; classification secretary show-day readiness; status resolved. First evidence October 12, last reviewed October 15; owner Richard Beezley; source: codex.

#2955 adds readiness, replica subscriptions, draft-preserving background reloads and a single on-screen scoring target. Relevant implementation: `apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx` load effect and `hooks/usePaperScoring.ts`. Subsequent #2971/MYK9-1136 fixes a sync-settle race; #2980 fixes missing cold classes. These later fixes were checked, not reported again as defects.

Closure proof is the exact October 14 15:37 Linear comment: production deployment 38590311532 at `91e46bb15`, wiped IndexedDB with empty upload queues, direct visit without Results warm-up/reload, four runnable dogs and two scored matching the database, stable at later observations. Fresh late-entry and scoring-hook tests pass. High confidence; recorded live proof is attributed to that walk, not a live operation performed here.

## P2 — unresolved verification prerequisite

[MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196), alias NCR-2026-10-15-01; source Medium; classification verification/environment investigation; status unchanged, with successful new proof. First/last seen October 15; owner unassigned. source: codex.

Earlier runs were interrupted after RUN headers without verdicts. This run obtained passing small controls and the large app selection. The large selection stayed quiet for over 30 seconds, prompting an attempted policy-required stop, but had already exited 0: **198 files / 2,181 tests passed in 58.64 seconds**. It was not a hang. Prior-run root cause remains unproven; no Vitest defect is alleged. A warning about unsupported document navigation did not fail the tests.

Full commands, runtime, results, sanitized output, exact remaining review range and closure requirements were appended to the existing issue. Closure still requires completed source review and appropriate remaining replication proof, not merely green app tests. High confidence in current results; low confidence about earlier interruptions.

## P2 — newly resolved panel-save recovery

[MYK9-1125](https://linear.app/myk9-platform/issue/MYK9-1125), source Medium; classification recovery UX; status resolved within owner-accepted scope. First seen October 12, last reviewed October 15; owner Richard Beezley; source: codex.

#2956 makes online panel mutations run offline rather than pause and makes attempted dismissal explain an in-flight save. `components/panels/edit/DiscardChangesDialog.tsx:55`, `EditPanelWrapper.tsx`, and corresponding query mutations. Expected: network errors settle back to editable input; genuinely pending requests explain why the panel holds. October 13 16:06 comment records the owner's decision to delete detached-save behavior, six wrapper/five original mutation tests, mutation checks and 28,250 shuffled tests. Fresh wrapper/current mutation tests passed. Do not refile the deliberately retained wait-for-server behavior as a regression. No new browser proof claimed.

## Rejected candidate

Dog pending-edit overlay discarding server health records: rejected after reading the full mapper. `dogMappers.ts` only adds `health_records` when explicit health options are supplied; the overlay supplies none, so server health data survives. No Linear issue warranted.

## Verification and artifacts

- Node v22.18.0, pnpm 9.15.9. Isolated worktree `/private/tmp/myk9-ncr-20261015-resume`, branch `codex/ncr-review-20261015-resume`, tracked hooks enabled.
- Restricted bootstrap was interrupted during install; approved elevated bootstrap passed, 12 cached package builds. Tests ran with default permissions.
- Single scoring hook: 1 file / 18 passed, 924ms.
- Scoring late entries/refresh pause and panel saving/offline mutations: 4 files / 30 passed, shuffled seed 20261015, one worker, 4.83s.
- All existing changed app test paths: 198 files / 2,181 passed, same shuffle seed, four workers, 58.64s. These totals overlap the smaller controls; do not count them as distinct tests.
- Replication core/current identity controls: 2 files / 87 passed, one worker, 1.19s.
- Prefix `git diff --check` passed. Logs and selection in worktree `.logs/`.
- No full suite/typecheck/lint, browser run, behavioral SQL execution, live database, payment, deployment or shared-fixture mutations. No application edits, commit, push, PR or issue closure.
- Prior same-date report and October 13 report preserved. This report/cursor are uncommitted audit artifacts; memory retains the same boundary.

## Completed commit inventory

- `66165e809` / #2955 — paper scoring follows entries arriving after cold load.
- `730e68c35` / #2956 — panel saves fail offline and explain pending saves.
- `15a52455e` / #2957 — dog details read server-first across account switches.
