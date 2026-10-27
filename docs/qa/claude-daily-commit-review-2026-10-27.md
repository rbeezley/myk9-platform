# Daily commit review — 2026-10-27

source: claude. **No new confirmed product defect.** Fresh review complete through
`4d5a839e6ffa18b2811fc282b7a7dc71b8b24516`. 47 commits, of which 20 touch application,
package or `supabase/` code and 3 add migrations that are already applied to the linked
database.

## Coverage and the window

The `daily-commit-review` row read `956f6ce018c583381e9e42013bcf4e33074b2de4`, window end
2026-10-26T04:30:41Z, run by `codex-daily-commit-review` on 2026-10-26. That stamp is backed
by a published report: `docs/qa/codex-daily-commit-review-2026-10-26.md` states its window as
exclusive `b7dc2d608` through inclusive `956f6ce01` and enumerates two commits, and
`git rev-list --count b7dc2d608..956f6ce01` returns exactly 2. No evidence gap, no
boundary-only stamp, no 24-hour fallback.

This run's window is exclusive `956f6ce01` through inclusive `4d5a839e6`,
2026-10-26T04:30:41Z–2026-10-27T03:57:46Z. `git rev-list --count 956f6ce01..4d5a839e6` = 47,
matching the inventory below. **No coverage gap** between the two windows: this window starts
at the exact commit the previous one ended on.

The historical 43-commit Oct 18–19 evidence gap that
[MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns was closed inside this
window, not absorbed by it: `9ab650fc5` published the six surviving Codex reports (Oct 20–25)
and `551c4bf7f` published a fresh replacement review of the unrecoverable
`0952bffb2..3fab98f7d` range. That issue stays In Progress for its retention half.

Worked in a dedicated worktree off a clean `origin/main`: `/private/tmp/myk9-ncr-20261027`,
branch `claude/ncr-20261027`. Primary checkout was not committed from.

## Checks run

Verification ran from the primary checkout at the identical tip `4d5a839e6`. `pnpm qa:dist-fresh`
first reported `replication: src/ is newer than ./dist/index.js by 294s`; the package was
rebuilt and the check re-run green before any test, per
[`docs/lessons/README.md#stale-package-dist`](../lessons/README.md#stale-package-dist).

| Check                                               | Scope                                                                                                                                                                                                                                   | Result                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm qa:dist-fresh`                                | every package                                                                                                                                                                                                                           | green after rebuilding `@myk9/replication`                                                         |
| `pnpm exec vitest run` (batch 1)                    | replication changed-columns and trigger-columns, comp offer/actions/service, stripe-payment-link handler, read-deadline fetch and client                                                                                                | **8 files, 98 tests, all passed**                                                                  |
| `pnpm exec vitest run` (batch 2)                    | at-show local-entry gate (helpers + hook) and scoresheet cold load, pending-entries tombstone, secretaryPostgrest, classMappers, RBAC role permissions (3 files), LateEntryContact, ShowPublicLanding past show, premium error handling | **12 files, 95 tests, all passed**                                                                 |
| `pnpm exec vitest run` (batch 3)                    | armband starting-number error, `pushFanout`                                                                                                                                                                                             | **2 files, 16 tests, all passed**                                                                  |
| `pnpm exec vitest run` (scripts)                    | watch-pr-checks, gh-pages, inflight, db-push-sweep, issue-janitor (3), oidc-token, authorship, review-attempt, review-publication, merge-cleanliness, handoff-cli, dispatch-cloud-session                                               | **14 files, 305 tests, all passed**                                                                |
| `pnpm qa:prompt-parity`                             | installed scheduled prompts vs `docs/operations/scheduled-audits-claude.md`                                                                                                                                                             | **7 in parity**; `claude-issue-janitor` SKIPPED, not installed                                     |
| `pnpm exec vitest run … --sequence.shuffle` × 20    | `GeneratePremiumPanel.errorHandling.test.tsx`                                                                                                                                                                                           | 20/20 passed (MYK9-1402 proof)                                                                     |
| `taskpolicy -b … --coverage --sequence.shuffle` × 2 | same file                                                                                                                                                                                                                               | `Tests 3 passed (3)` both; non-zero exit is the single-file coverage threshold, not a test failure |
| Live database (read-only MCP)                       | CHECK domains, table and column ACLs, function ACLs and `prosecdef`, trigger definitions                                                                                                                                                | all four queries matched the migration text; details below                                         |

The one test path I named but could not run at first, `armbandQueries.startingNumberError.test.ts`,
lives at `src/test/services/database/queries/`, not beside the source; batch 2 reported 12 files
for 13 arguments and the missing one was found and run in batch 3 rather than assumed green
([`feedback_confirm_named_test_ran`](../lessons/README.md)).

**Not run:** full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`, any
browser walk, the behavioural SQL suite (CI-only, no container runtime here), any payment, load or
production operation. No current-`main` CI verdict is asserted; each merged PR's own CI was green.

## Commit inventory

Code-bearing commits, in merge order. Documentation-only commits are listed after.

| Commit                                                                                                              | Review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `9558ab0e3`                                                                                                         | MYK9-1405: removes the "Class Order" field that wrote `start_time = "<order>:00:00"`. Read every consumer of the `SyncableClass.classOrder` string the mapper now returns as `''` — `class-store-helpers.ts:19` already called it "Local-only" and `classStore.ts:366` / `classStoreCompatHelpers.ts:43` derive it from the row index, so the empty value is consistent. The numeric `classOrder` in the cockpit, at-show and premium code is a different field off `display_order`. Confirmed class ordering runs through `compareClassesByProgression`, not `start_time`, so the new always-`null` insert does not collapse any ordering.                                                                                                                                                                                                                                                                                                                                                                        |
| `bb3d69e3b`                                                                                                         | MYK9-1409: two `SECURITY DEFINER` RPCs replace every client write of `role_permissions`, plus migration `20261026152300`. Verified in full — see "Migrations" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `e795a9e46`, `df57a9f7c`                                                                                            | Generated-type regenerations. `e795a9e46` only moves `create_role_with_permissions` into alphabetical position (8 lines each way); `df57a9f7c` adds `payment_status_before_comp` to the three `entries` shapes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `0b0c8c5fc`, `5e64ec6a5`, `1bd828bf6`                                                                               | MYK9-1415 / MYK9-1425: `qa:inflight` moves off GraphQL, and `gh api --paginate` is replaced by hand paging in `inflight.ts`, `handoff-cli.ts`, the new `gh-pages.ts` and `watch-pr-checks.sh`. Read the new shell `gh_pages`: `#!/bin/bash` (3.2 here), `rows+=` and `$'\n'` are both 3.2-safe, no `local` self-reference ([#local-self-reference](../lessons/README.md#local-self-reference)), `PAGE_SIZE`/`PAGE_CAP` collide with nothing else in the file, a short page ends the list and the cap `return 1`s rather than reporting a truncated rollup as complete.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `6a18d94ae`                                                                                                         | MYK9-1411: `fetchStartingArmbandForShow` now throws on a failed read instead of falling through to the 100 default. Correct — the `Number(data?.starting_armband_number)` default is now only reached by a successful read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `c0ba1b8a0`                                                                                                         | MYK9-1408: `.is('deleted_at', null)` on the pending-review count. `deleted_at` carries an `authenticated` column SELECT grant on `entries`, so the filter cannot 42501 ([#postgrest-count-column](../lessons/README.md#postgrest-count-column)).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bc79837e2`, `c627a3004`                                                                                            | MYK9-1355 / MYK9-1421. The premise worth checking was `db: { retry: false }`. Read the installed `@supabase/supabase-js@2.118.0`: `db.retry?: boolean` is documented ("Defaults to `true`") at `dist/index.d.cts:176-179` and forwarded as `retry: settings.db.retry`; `@supabase/postgrest-js@2.118.0` accepts it and `fetchWithRetry` is the loop it disables. So the new layer is the only retry policy, not a second one stacked on the SDK's. Its statuses `{503, 520}` match postgrest-js's `RETRYABLE_STATUS_CODES`; it narrows the retryable methods to GET/HEAD where postgrest-js also allowed OPTIONS, which PostgREST reads never issue. `settle()` is still not called on the success path, so the deadline continues to cover body consumption — unchanged from `956f6ce01` and deliberate, not introduced here.                                                                                                                                                                                     |
| `01f7f2442`                                                                                                         | MYK9-1410: copies `withdrawal_reason_code` in the cold-replica fallback merge. Checked the source of `meta`: `postgrestGetSecretaryPullMetadataMap` already selects `id, withdrawn_at, refund_decision, refund_decided_at, withdrawal_reason_code` (`secretaryPostgrest.ts:200`), so the new assignment reads a populated field and is not a no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `c2655f5d7`                                                                                                         | A finished show shows "This show has already taken place." instead of the late-entry mailto. The new `ShowHasHappenedContext` defaults to `false`, so the fix lives or dies on provider coverage: `ShowPublicLanding.tsx:243` is the only provider, and all 11 landing styles that render `<LateEntryContact>` reach it through `STYLED_LANDING_BY_STYLE` inside that component. No style escapes the provider.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `307bb8ee0`                                                                                                         | The automatic scoresheet backoff now reads the cache first; only the Retry button sets `manualRetryRequested`. `forceRefresh` is captured into a local before the ref is cleared, so an in-flight forced load keeps its flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `e384ae5b4`                                                                                                         | MYK9-1400: `.returns<EntryAudienceRow[]>()` on the audience embeds. Type-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `c9013b6c6`                                                                                                         | MYK9-1402's fix. Proven this run — see "Resolved".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `805f75c69`, `b4ea1ff19`                                                                                            | The at-show local-entry gate. `805f75c69` replaces `selectOwnedDogIds` (which only ever compared `ownerId`, read at `utils/dogOwnership.ts:23-28`) with an inline owner-or-co-owner rule plus a soft-deleted-dog exclusion, mirroring the RPC's three branches. Checked that the co-owner branch is reachable offline: `ReplicatedDogsTable.ts:104` maps `co_owner_id`, and the dogs replica syncs unscoped (`ReplicationSyncProvider` defaults `syncScopeId = ''`, no caller passes one, so `fetchChangedDogs` applies no `owner_id` filter and `filterLocalRows` keeps every row) — a co-owned dog does reach the replica. `b4ea1ff19` generalises `useEntriesReplicaInvalidation` to several sources; the `sources` array is a module-level constant on both branches, so the subscription effect's new dependency is stable. Dropping the hook's `catch { return false }` cannot surface a toast: the app `QueryCache.onError` only logs, and reports to Sentry per-query opt-in (`lib/queryClient.ts:25-32`). |
| `ec93f02c2`                                                                                                         | MYK9-643: `-inset-3.5` → `-inset-[15px]` on five checkboxes, `size="sm"` → `size="touch"` on six controls, two select triggers `h-10` → `h-11`. Hit areas only grow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `f6f4a6a83`                                                                                                         | MYK9-1407: the comp/uncomp money path, plus migration `20261027003700`. Verified in full below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `27d725829`                                                                                                         | MYK9-1396: the check-in-before-pull restore, plus migration `20261027014900`. Verified in full below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `19a60f983`                                                                                                         | MYK9-1442: a queued entry UPDATE now carries only the columns the caller changed. The risk here is `rebaseQueuedMutation`, which changed from "whole rebuilt row, then fill in explicit keys" to "explicit keys only". A mutation with no `explicitDataKeys` cannot produce an empty payload: `mutation-queue-rewrite.ts:74-76` falls back to `Object.keys(mutation.data)` minus the legacy server-wins list before the projection runs. The `changedEntryColumns` probe set covers the mapper's coercions (`Number()`, `!!`) with three probe types and adds the key's own snake_case column explicitly for columns no probe can move.                                                                                                                                                                                                                                                                                                                                                                            |
| `721a6ca93`                                                                                                         | MYK9-1380: the fanout is bounded by a 10-worker pool and a 90 s start deadline, and a truncated batch logs at error level. `isTruncatedPushBatch` is sound — `result.failed++` is the catch block's first statement, so an expired (404/410) endpoint is counted in `failed` and `sent + failed + skipped` still reaches the total, which means a stale endpoint cannot make a complete batch read as truncated. One residual recorded on MYK9-1380, below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `4d5a839e6`                                                                                                         | MYK9-1394: `stripe-payment-link` drops the `x-function-secret` cron-secret bypass, so every request now carries a user JWT and passes the secretary / club-admin / site-admin check or the narrow own-waitlist-offer fallback. Confirmed there is no service-to-service caller left to break: `waitlistCronPaymentLink.source.test.ts:44` already pins `expect(cronSource).not.toContain('/functions/v1/stripe-payment-link')`, and no migration, workflow or script invokes it. The change also replaces a source-text test with a real handler test that runs the registered `Deno.serve` handler ([#source-text-tests](../lessons/README.md#source-text-tests)).                                                                                                                                                                                                                                                                                                                                                |
| `ec596990f`                                                                                                         | Lints root `scripts/` via `lint:scripts`. The four code edits are an unused loop binding, an unused import, a pinned `complexity` disable with a reason, and the pinned launcher command.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `917ac588e`, `fc0ffb6d3`, `5f297aa23`, `480e2e8f4`, `ea32b0923`, `9a9f555f1`, `a9bfc7b40`, `62ed10bf8`, `e5e45c904` | Agent tooling: the issue janitor, cloud dispatch, the orchestrate cloud lane, agent role files, the review pre-pass, and the cloud review's authorship / attempt / publication / OIDC checks. All 305 tests green. Read `oidc-token.ts` closely because it is the provenance root: RS256 only (never letting the token pick its own algorithm), `kid` must be published, the JWK must be an RSA signing key, signature then `iss`, `aud`, `repository`, then lifetime with 60 s skew, every claim shape validated, and a `try`/`catch` backstop so a hostile value is a rejection rather than a throw. Two `.claude/settings.json` permission edits (`e5e45c904`, `fc0ffb6d3`) add Linear read/write and terminal tools plus one `autoMode.allow` entry; both match the owner's recorded pre-authorisation in CLAUDE.md, and neither allowlists a Linear deletion, label or team-settings tool.                                                                                                                    |

Documentation-only in this window: `187220572`, `49f101e27`, `f23d2fbf9`, `579fc252c`, `81c4c6e62`,
`392ad2f58`, `763922a21`, `75b240545`, `f6db2ea57`, `951771f7e`, `9ab650fc5`, `551c4bf7f`,
and `806c48fbc` is test-only (a `ShowStatusPill` ordering pin).

## Migrations — verified against the applied database

All three migrations in this window are already applied, so the text was checked against the
live catalog rather than read alone (CLAUDE.md § Database Migrations).

**`20261026152300_myk9_1409_role_permission_rpcs.sql`.** `create_role_with_permissions` and
`update_role_with_permissions` are `prosecdef = true` with
`postgres=X | service_role=X | authenticated=X` and no `anon`; the internal
`replace_role_permission_codes` is `postgres=X` only, reachable just from the two definers. The
`is_platform_admin()` gate is not a weaker predicate than the RLS it replaces: migration
`124` made that name a wrapper over `is_site_admin()`, and the `roles` / `role_permissions`
write policies from migration `080` are `is_platform_admin()` with no `is_system` carve-out, so
the definer grants no authority the direct writes did not already have. The migration's claim
that the MYK9-1208 direct-write trigger does not fire inside a definer is correct for the stated
reason: `require_recent_reauth_for_client_write()` returns early on
`current_user NOT IN ('authenticated','anon')`, and the RPCs call `require_recent_reauth()`
explicitly instead.

**`20261027003700_myk9_1407_comp_keeps_paid_status.sql`.** `trg_entries_comp_payment_status` is
`BEFORE UPDATE OF comped, payment_status_before_comp` and the INSERT companion is conditional on
`new.payment_status_before_comp IS NOT NULL`, both exactly as written. The new column's CHECK is
`('pending','paid','refunded','waived')` and the live `entries_payment_status_check` is the same
four values, so a comp can never store a value the column refuses. Its ACL is
`service_role=r` only, and `authenticated` holds `awd` on the table with **no** table-level
SELECT, so the per-column `REVOKE SELECT … FROM authenticated` is not the no-op it would be
against a table-wide grant: the column is genuinely unreadable by clients. 41 of the table's 98
columns already lacked an `authenticated` SELECT before this window, so adding two more cannot
break a `select('*')` that was never possible.

**`20261027014900_myk9_1396_check_in_status_before_pull.sql`.** Both triggers exist as written.
The new column's CHECK is the same eight values as the live `entries_check_in_status_check`, so a
Pull from any legal check-in state can stamp its predecessor without a constraint violation —
the failure mode that would have refused the Pull itself. `check_in_status_before_pull` has no
column ACL at all (`attacl IS NULL`), which with no table-level SELECT means `authenticated`
cannot read it, as the migration claims.

## Resolved

- **[MYK9-1402](https://linear.app/myk9-platform/issue/MYK9-1402)** / `NCR-2026-10-24-01`,
  **resolved** — canonical **P2** (source label: Medium), first seen 2026-10-24, last seen
  2026-10-26, consecutive-run count 3, baseline `4d5a839e6`, source: claude, confidence **high**.
  Affected role/workflow: none at runtime; a release-pipeline blocker. Fixed by `c9013b6c6`
  (PR #3311), which rewrote the test deterministically rather than widening its timeout, as the
  issue's recommended approach asked. The issue was already Done; this run supplied the
  measurement half of its closure contract that no earlier run had: 20 consecutive shuffled
  single-file runs green, plus two `taskpolicy -b … --coverage --sequence.shuffle` runs green
  (`Tests 3 passed (3)`; their non-zero exits are the global coverage threshold a single-file
  run cannot meet, not a test failure). The mutation check and a post-fix full `main` CI run
  remain un-rerun here. Proof recorded on the issue.

## P3 / Low

- **[MYK9-1380](https://linear.app/myk9-platform/issue/MYK9-1380)** / `NCR-2026-10-27-01`,
  **new** — canonical **P3** (source label: Low), first seen 2026-10-27, consecutive-run count 1,
  baseline `4d5a839e6`, source: claude, confidence **medium**. Affected role/workflow: exhibitor
  and judge push alerts on show day. Recorded as a residual comment on the still-In-Review
  MYK9-1380 rather than a new issue, because it is that change's own unproven premise.
  `721a6ca93` passes `{ timeout: PUSH_SEND_TIMEOUT_MS }` to `sendNotification`
  (`pushFanout.ts:159-163`) and declares the option on the repo's own `WebPushSender` interface
  (`:57-62`), so typechecking never sees web-push; the test asserts a hand-written stub received
  it (`pushFanout.test.ts:112`), which pins the call shape, not the library
  ([#source-text-tests](../lessons/README.md#source-text-tests)). The import is `npm:web-push@3`,
  an unpinned major range where sibling functions pin exactly
  (`npm:@supabase/supabase-js@2.49.1`); `timeout` arrived in a 3.4.x patch, so a resolution below
  it drops the option silently. web-push is a Deno `npm:` import and is not in `node_modules`, so
  it could not be read here — this is a verification gap, not a demonstrated regression: the
  worker pool and the 90 s deadline still hold either way. Closure wants an exact pin in both
  push-trigger functions and a stall test proving a hung connection rejects in roughly
  `PUSH_SEND_TIMEOUT_MS` and is counted as `failed` with the summary still printed.

## Unchanged

- **[MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343)**, **unchanged** — canonical
  **P2**, first seen 2026-10-22, In Progress, baseline `4d5a839e6`, source: codex. The reports
  this issue chased are now on `main` (`9ab650fc5`, and `551c4bf7f` for the unrecoverable
  Oct 18–19 range). Its remaining half is the retention change: from 2026-10-27 the Codex
  automation commits its report together with its row stamp before removing its worktree. Not
  re-presented as new; no fresh evidence added this run.

## Observations recorded without filing

Neither of these is a defect, and neither is filed; they are here so the next run does not
re-derive them.

1. `scripts/qa/issue-janitor.ts` and its Task 4 prompt shipped in `917ac588e`, but
   `pnpm qa:prompt-parity` reports `claude-issue-janitor — not installed on this machine`.
   Registration is explicitly the owner's step and the first run is meant to be an
   owner-reviewed dry run; MYK9-1434 owns it. Nothing to fix in the repo.
2. `OverrideTree.tsx:406-408` still says the pseudo-element "extends the hit area to the 44px
   floor". After `ec93f02c2` the inset is 15px around a 16px control, so the area is 46px. A
   stale comment on a change that only grew the target; too thin to file.

## Counts

|                                   |                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Commits in window                 | 47 (20 code-bearing, 3 with migrations, 24 docs/test-only)                                   |
| New findings                      | 1 (P3, recorded on an existing open issue)                                                   |
| Unchanged findings                | 1 (MYK9-1343)                                                                                |
| Resolved findings                 | 1 (MYK9-1402, with fresh proof)                                                              |
| Duplicate                         | 0                                                                                            |
| Rejected                          | 0                                                                                            |
| Blocked                           | 0                                                                                            |
| P0 / P1                           | **0** — nothing filed, nothing withheld                                                      |
| Fixes found in subsequent commits | 1 (MYK9-1402 fixed in-window by `c9013b6c6`)                                                 |
| Existing QA / Linear references   | MYK9-1380, MYK9-1402, MYK9-1343, MYK9-1434                                                   |
| Linear writes                     | 2 comments (MYK9-1380, MYK9-1402); both succeeded                                            |
| Linear issues created             | 0 — no new P0/P1, and the one P3 belongs on an existing open issue                           |
| Test files run                    | 36 (514 tests), all passed                                                                   |
| Baseline SHA                      | `4d5a839e6ffa18b2811fc282b7a7dc71b8b24516`                                                   |
| Window                            | `956f6ce01` (exclusive) → `4d5a839e6` (inclusive), 2026-10-26T04:30:41Z–2026-10-27T03:57:46Z |

## Verification limits

- No full `pnpm test`, `pnpm typecheck`, `pnpm lint` or `pnpm qa:code-quality-ratchet` run; the
  targeted batches above are the whole of this run's test evidence, and each merged PR's own CI
  was green at merge. No current-`main` CI verdict is asserted.
- No browser walk, so the a11y touch-target geometry in `ec93f02c2` and the finished-show landing
  copy in `c2655f5d7` were reviewed as code and unit tests, not as rendered, composited surfaces
  ([#measurement-harness](../lessons/README.md#measurement-harness)).
- The behavioural SQL tests registered by `bb3d69e3b`, `f6f4a6a83` and `27d725829` run only in
  CI; registering one is not the same as having run it. The database checks reported here are
  read-only catalog queries, not those tests.
- `web-push` could not be read, which is the whole of `NCR-2026-10-27-01`.
- Three queued-mutation and trigger interaction paths were reasoned from the migration headers'
  firing-order analysis and the code, not executed against a database: the comp refusal on a
  row an INSERT created already comped-and-paid, the undo over a status money moved after the
  comp, and the check-in restore under an offline replay. Each has a CI-only SQL test.
- No payment, deploy, Vault, load or production operation. No application code was modified.
