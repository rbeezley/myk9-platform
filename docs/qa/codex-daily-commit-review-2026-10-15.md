# Codex daily commit review — 2026-10-15 (partial)

source: codex. **Incomplete: five commits / 27 files received completed source review; 67 later commits remain unclaimed. No new product defect confirmed in the completed prefix.** Local test execution was blocked; this is not a green review of current main.

## Boundary and coverage

- Shared starting cursor: `eec1e3eff0f9435a2584e66e51a148dec7703064` exclusive, previous window end **2026-10-13T10:14:26Z**. Read the dirty shared cursor left by the previous run; did not substitute the older committed cursor or scheduler timestamp.
- Completed source-review endpoint: `8f6c1b49a0f0ce1333ab35b12629ca2d9c853cc0` inclusive, window end **2026-10-13T15:15:14Z** (that commit's UTC timestamp, not today's run time). No initial temporal gap: the review window begins at the previous window end. First included commit is 10:25:32Z; that idle interval is not a missing commit range.
- Fetched inspection/test baseline: `54f1db465` (72 commits after the old cursor). **Coverage gap/backlog:** `(8f6c1b49a, 54f1db465]`, 67 commits, not stamped. Some later replication, security, dog-read and paper-scoring code was inspected, but that does not establish full range coverage.
- Run date UTC: 2026-10-15. Runner: `codex-daily-commit-review`. Next review starts at `8f6c1b49a` exclusive, not at the test baseline.

## Counts

Lifecycle transitions: **new 1, unchanged 0, resolved 4, duplicate 0, rejected 0, blocked 0** (mutually exclusive transition counts). The new P2 verification prerequisite has blocked execution; do not count it twice. New product/security/UX defects: **0**. Resolved: P1 1, P2 3. Existing prior-run ledger outside this prefix is **not reassessed**, rather than counted as unchanged or resolved. Linear: **created 1, modified 0, closed 0**.

## P1 — newly verified historical resolution

**[MYK9-1132](https://linear.app/myk9-platform/issue/MYK9-1132)** — paperwork void never reached server; source High; classification persistence defect; status resolved. First seen Oct12, last reviewed Oct15; owner Richard Beezley; source: codex. Baseline `54f1db465`, fix #2953 / `b02448cc0`. `packages/replication/src/mutation-execute.ts:122,181,198,219` addresses RPC/update/recheck/delete using queued rowId, retaining the three-column grant-compatible void payload. Before: undefined ID rejects every attempt; after: authoritative row ID. Impact was invalid print history remaining valid on other devices. High confidence. Closure proof is the **recorded Oct13 13:57 Linear comment**, not this run's stalled tests: production deploy 38407371775, deployed app void, server voided_at 13:56:31Z, version 1→2, zero pending/failed paperwork mutations and no matching DB errors. Exact acceptance gate met; no status change performed.

## P2 — unresolved verification prerequisite

**[MYK9-1196](https://linear.app/myk9-platform/issue/MYK9-1196)** / NCR-2026-10-15-01 — restore focused-test verification and complete uncovered nightly review. Source Medium; classification verification/environment investigation; status new; execution blocked; first/last Oct15; owner unassigned. Baseline `54f1db465`. Two package-local Vitest 5 runs printed only RUN/seed and showed no progress for over 30 seconds; interrupted with exit 130 under AGENTS.md. Expected completed focused verdicts; observed no verdict. High confidence in missing verification, low confidence in mechanism. No product or Vitest defect diagnosis. Full reproduction, commands, evidence, next action and closure criteria are in Linear. Requires a bounded diagnostic/control, completed focused proof and remaining range review (or explicit owner-approved alternative). Archived-inclusive searches plus full reads of MYK9-787/790/460 ruled out those different historical scopes.

## P2 — newly verified historical resolutions

All source: codex; owner Richard Beezley; baseline `54f1db465`; last reviewed Oct15; high confidence in the cited historical proof. No fresh browser or passing unit result is claimed.

- **[MYK9-1114](https://linear.app/myk9-platform/issue/MYK9-1114)**, source High, test/harness, first failures Oct5, resolved **original nine-test Nightly scope**. #2949 / `040552602`, `apps/myk9show/src/test/e2e/shared/browserDiagnostics.ts:200,209` adds service-worker network diagnostics and retains final redaction. Closure proof: Oct13 11:00 comment, [Nightly 38383268559](https://github.com/rbeezley/myk9-platform/actions/runs/38383268559) on main `040552602`: 132 passed / 2 skipped / 0 failed / 0 flaky in each pass after reset, artifact secret verification before upload. Later chunk-load recurrence has separate **MYK9-1188**; this is not a claim that all current Nightly concerns are closed.
- **[MYK9-1131](https://linear.app/myk9-platform/issue/MYK9-1131)**, source Medium, UX, first Oct13, resolved. #2952 / `64fd09f4a`, `apps/myk9show/src/App.tsx:250` and `components/exhibitor/NewRoleStepBanner.tsx:102`: sticky notice after Outlet replaces fixed overlay. Expected Next remains reachable without dismissal. Recorded proof Oct13 12:13: real Chromium 390×844 and 1280×800, visible notice/nonintersecting rectangles/real Next click; 2 pass with fix, 2 fail restoring old fixed class. Once-only notice preserved. No production-only gate in acceptance.
- **[MYK9-1135](https://linear.app/myk9-platform/issue/MYK9-1135)**, source Medium, recovery UX, first Oct13, resolved. #2954 / `8f6c1b49a`, `apps/myk9show/src/providers/replicationSyncFormatters.ts:135` plus provider failure listener: permission translation, reason prefix, clipping and preserved headline. Recorded Oct13 15:15 proof: red-to-green prefix tests, provider description mutation control and 95 provider tests shuffled. Subsequent #2972 / `773a1f117` under MYK9-1146 repairs object-error serialization; do not refile that fixed follow-up as a new finding.

## Scope reconciliation and limits

Read lifecycle skill, INTENT, scorecard severity, prior report/memory, matching QA registry records, archived-inclusive Linear inventory, and exact issues/comments for this prefix. MYK9-1090 explicitly adopts online-only person edits; #2950's refusal and mutation networkMode are intentional, not an offline-first violation. Broader registration work under that issue is beyond the completed prefix.

An older MYK9-1114 comment mentions an isolated-target 403 on get_secretary_live_entry_count. Current migration `20260929133147_secretary_live_entry_count.sql:12,25-26` explicitly authorizes managers and grants authenticated execution. No current replay or caller-role evidence establishes a grant defect. Inconclusive historical signal, not filed as a confirmed defect or counted rejected.

Prior unresolved ledger needs reconciliation on resume: MYK9-1128 (P0 credential rotation), MYK9-1130 (P1 paper hydration), and P2 MYK9-1111, MYK9-1112, MYK9-1116, MYK9-834, MYK9-1011, MYK9-992, MYK9-639, MYK9-1129. Their prior proof gates remain in Linear; no closure inferred from newer commits or current Done labels. Some have changed since the prior run; this partial report deliberately makes no fresh status finding for them.

## Checks and artifacts

- Isolated worktree `/private/tmp/myk9-ncr-20261015`, branch `codex/ncr-review-20261015`, hooks `.githooks`; bootstrap exit 0. No app edits.
- App selection: 178 existing changed test files. Replication selection: 10 existing changed test files. Both commands: `pnpm vitest run --sequence.shuffle --sequence.seed=20261015 --maxWorkers=4 <selected files>`, invoked in their package directories, stdout/stderr to worktree `.logs/`. Both halted after RUN-only output exceeding 30 seconds, exit 130. No tests passed/failed; no retry loop.
- Earlier mistaken working-directory selection launched a package-wide command; canceled, excluded from evidence. Root test selection prepared but not executed. No full suite/typecheck/lint, browser, live SQL, behavioral SQL, deployment or shared fixture/payment operations.
- `git diff --check eec1e3eff 8f6c1b49a` passed.
- Fetch initially failed DNS under sandbox; authorized retry succeeded. Process enumeration was sandbox-denied, so no claim about CPU/root cause; all three owned exec sessions returned exit 130.
- Exact selections/logs retained under isolated `.logs/app-tests.txt`, `.logs/app-tests.log`, `.logs/replication-tests.txt`, `.logs/replication-tests.log`. Bootstrap log moved there. Audit report/cursor copied to primary only after checking its existing cursor; prior dirty docs preserved. No commit/push/PR/merge.

## Completed commit inventory

- `040552602` — test(e2e): browser diagnostics record the service worker's own failed fetches (MYK9-1114) (#2949)
- `9fa41064f` — fix(people): refuse an offline person edit with a clear reconnect message (MYK9-1090) (#2950)
- `64fd09f4a` — fix(onboarding): the new-role notice no longer covers the show wizard's Next (MYK9-1131) (#2952)
- `b02448cc0` — fix(replication): address queued UPDATE and DELETE rows by rowId, not the payload id (MYK9-1132) (#2953)
- `8f6c1b49a` — feat(replication): the sync-failure toast says why the save was refused (MYK9-1135) (#2954)
