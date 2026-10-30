# Daily commit review — 2026-10-30

> **Status:** Reference

`source: claude`. One P1 and two P3s, all new, all filed. Window
`(35c77a6c1d71e213432b146520a49028564cfe4b, 1e863d80281aecdefe3079afc9a7d9fb82df5bd8]` —
33 commits, 2026-10-29T10:09:40Z–2026-10-30T04:11:33Z. No coverage gap.

**The P1 is pre-emptive and time-sensitive: [MYK9-1527](https://linear.app/myk9-platform/issue/MYK9-1527).
`main` reads `classes.ring_phase`, which is not in the applied database. Production is correct
today; the next Deploy myK9Show run — which standing approvals pre-approve for an unattended
session — breaks every authenticated classes read. Push `20261030174300` before the next deploy.**

## Coverage

The `daily-commit-review` row named `35c77a6c1d71e213432b146520a49028564cfe4b`, window end
`2026-10-29T04:34:26Z`, run by `codex-daily-commit-review` on 2026-10-29.

**The stamp was verified before it was honoured**, per the ledger's trap 3. Its commit is a
two-file change (`docs/qa/audit-boundary.md` + `docs/qa/claude-daily-commit-review-2026-10-29.md`),
and `docs/qa/codex-daily-commit-review-2026-10-29.md` is on `main` as `4b4584c68` (the first commit
of _this_ window) with a coverage table whose claimed interval `(20ada6552, 35c77a6c1]` is one
documentation commit. That report in turn adopted Claude's 21-commit inventory for
`(542b6fa47, 20ada6552]` after rev-list-counting it. Row + report + matching count on both halves:
real coverage, honoured rather than re-reviewed.

**Trap 1 did not fire for a fourth consecutive run.** `git worktree list` shows 20 worktrees, none
holding an uncommitted `docs/qa/` report; `git diff docs/qa/` in the primary checkout is empty;
`/private/tmp/myk9-ncr-*` holds only `myk9-ncr-20261020` (long covered) and this run's worktree.

This run's window starts exactly where the previous one ended. `git rev-list --count 35c77a6c1..origin/main`
returns 33, matching the inventory below.

## Commits reviewed

| Commit      | Subject                                                                                                                         | Change               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `4b4584c68` | docs(qa): Codex daily commit review 2026-10-29 and cursor                                                                       | 2 files, +111/-3     |
| `923dbbb08` | test(e2e): ignore reads the outgoing page starts mid-navigation; warm isolated edge functions (MYK9-1467) (#3377)               | 7 files, +336/-1     |
| `909e0a14c` | fix(replication): atomic dirty write + enqueue so a failed queue leaves the row untouched (MYK9-1471) (#3378)                   | 41 files, +1430/-931 |
| `3a0afd6d8` | feat(db): exact ties placed by a recorded coin flip (MYK9-1473) (#3374)                                                         | 43 files, +4006/-55  |
| `69461c05f` | test(offline): prove the reconnect hook with the exhibitor profile refetch (MYK9-1453) (#3383)                                  | 1 file, +29/-14      |
| `3803310f4` | perf(replication): explicit column lists on cold single-row entry view reads (MYK9-1362) (#3385)                                | 3 files, +316/-4     |
| `872d384df` | chore(qa): refuse foreground CI polling with a PreToolUse hook (MYK9-1481) (#3384)                                              | 6 files, +520        |
| `53b9705cf` | feat(secretary): Home label, one Add path, pin replaces Switch, Find Shows Filter button (MYK9-1490) (#3387)                    | 57 files, +1324/-789 |
| `e2a31fa63` | perf(qa): cache closed-PR history for qa:inflight; Codex review in the background (MYK9-1483) (#3388)                           | 9 files, +320/-22    |
| `92aade1bf` | feat(db): the caller's access moves the entry results view's updated_at (MYK9-1476) (#3386)                                     | 11 files, +1401/-4   |
| `c39ae19cf` | perf(typecheck): make the app tsconfig incremental for every caller (MYK9-1482) (#3390)                                         | 8 files, +16/-8      |
| `905275877` | test(e2e): name the browser's reason for each failed app request in route health (MYK9-1477) (#3391)                            | 2 files, +24/-2      |
| `85f99aafb` | refactor(scoring): delete the unreachable OfflineScoringService tree; fix three stale references (MYK9-1479, MYK9-1480) (#3392) | 25 files, +31/-4480  |
| `a54a7eeef` | test(e2e): promote the 2026-10-29 evidence walks into isolated regression specs (MYK9-1498) (#3389)                             | 8 files, +1224/-180  |
| `5b8a04f05` | test(e2e): excuse only WebKit access-control errors for requests stranded by a navigation (MYK9-1477) (#3394)                   | 5 files, +267/-6     |
| `b52dd067c` | feat(qa): standing approvals while pre-launch, behind a tripwire (MYK9-1485) (#3393)                                            | 16 files, +929/-15   |
| `aba7d18bf` | fix(dogs): a cold offline reload shows the account's dogs, never "No dogs yet" (MYK9-1493) (#3398)                              | 12 files, +312/-69   |
| `78e7e6417` | fix(at-show): drag reorder writes only rows whose run order changed (#3395)                                                     | 6 files, +64/-10     |
| `730d90d1c` | test(e2e): say why each kept WebKit access-control error was not excused (MYK9-1477) (#3401)                                    | 5 files, +151/-12    |
| `08c01f4fb` | fix(replication): cold entry reads use the replication view for shows columns (MYK9-1486) (#3396)                               | 4 files, +66/-22     |
| `4b5e839ac` | chore(skills): delete release-notes and codebase-health (MYK9-1484) (#3402)                                                     | 9 files, +8/-352     |
| `d8b762f19` | fix(at-show): say result is not released on a withheld scored row (MYK9-1519) (#3400)                                           | 5 files, +158/-1     |
| `d24f07205` | fix(registration): show entry-blank downloads on ordinary staff receipts (#3399)                                                | 10 files, +97/-2     |
| `a1399914e` | fix(replication): gateway 502/503/504 no longer spend the retry budget (MYK9-1488) (#3397)                                      | 5 files, +362/-14    |
| `645e60895` | feat(shows): list pane appears only beside an open show; browse searches read "Search {noun}" (MYK9-1489) (#3405)               | 16 files, +118/-50   |
| `579feec9a` | test(e2e): excuse WebKit access-control errors for requests that were never sent (MYK9-1477) (#3409)                            | 6 files, +143/-260   |
| `45c90a422` | feat(at-show): spoken 30s warning uses saved voice, speed and on/off (MYK9-1510) (#3406)                                        | 10 files, +317/-33   |
| `437193447` | docs(agents): every owed item is a label or relation; post-deploy pass (MYK9-1495) (#3415)                                      | 5 files, +42/-1      |
| `cfb4bb1b6` | feat(rail): My Entries appears only when the viewer has entries of their own (MYK9-1491) (#3408)                                | 11 files, +481/-12   |
| `895ce90c9` | test(e2e): multi-device offline spec proves the real OCC conflict; serialize judge scoring (MYK9-1487) (#3416)                  | 5 files, +246/-119   |
| `c666223db` | feat(at-show): ringside Run Order uses the shared dialog with v3 options (MYK9-1507) (#3413)                                    | 20 files, +644/-295  |
| `90642fdf4` | feat(at-show): ringside class status matches v3 via ring phase (MYK9-1513) (#3417)                                              | 37 files, +1552/-131 |
| `1e863d802` | MYK9-1500: one Up control across ringside, one way out of Ringside (#3410)                                                      | 58 files, +903/-390  |

Three migrations were added in this window. Two are applied (`20261029043900`, `20261029192700`);
`20261030174300` is not — that is the P1.

## Counts

|                                      |                                                                |
| ------------------------------------ | -------------------------------------------------------------- |
| New                                  | 3 (1 P1, 2 P3)                                                 |
| Unchanged                            | 0                                                              |
| Resolved                             | 0                                                              |
| Duplicate                            | 0                                                              |
| Rejected                             | 0                                                              |
| Blocked                              | 0                                                              |
| Fixes found in subsequent commits    | 0                                                              |
| Existing QA/Linear references reused | 3 (MYK9-1513, MYK9-1485, MYK9-1473 — referenced, not re-filed) |
| Linear issues created                | 4 (MYK9-1527; parent MYK9-1528 with MYK9-1529 and MYK9-1530)   |
| Baseline SHA                         | `1e863d80281aecdefe3079afc9a7d9fb82df5bd8`                     |

## P1

### NCR-2026-10-30-01 — the next Deploy myK9Show breaks every authenticated classes read

[MYK9-1527](https://linear.app/myk9-platform/issue/MYK9-1527) · new · first/last seen 2026-10-30 ·
1 consecutive run · confidence high · roles: every signed-in role, all class reads and writes.

`90642fdf4` (MYK9-1513) added `classes.ring_phase` / `ring_phase_time` and, in the same commit,
named them unconditionally in `CLASS_AUTHENTICATED_COLUMN_SELECT`
(`apps/myk9show/src/services/database/classes/reads.ts:201-209`), which builds the **classes
replication sync select** (`ReplicatedClassesTable.ts:454`); class writes send them too
(`ReplicatedClassesTable.ts:318`, `classMappers.ts:527-528`).

The columns ship in `supabase/migrations/20261030174300_myk9_1513_class_ring_phase.sql`, which is
**not applied**. Measured against the live project `sojmvhhwsjxmfistvzbe` on 2026-10-30:

- `schema_migrations` ends at `20261029192700`; `20261030174300` is absent.
- `information_schema.columns` returns 0 rows for either column on `public.classes`.
- `select ring_phase from public.classes limit 1` → `ERROR: 42703: column "ring_phase" does not exist`.

PostgREST fails the **whole** request on 42703, so the classes replica would never hydrate: no
class list, no ringside entry lists, no scoring, for every signed-in role.

What makes it urgent rather than theoretical is the deploy asymmetry `b52dd067c` (MYK9-1485)
introduced in the same window:

- **Deploy myK9Show is pre-approved** while `docs/agents/standing-approvals.md` says `status: ACTIVE`.
  Its only precondition is `pnpm qa:prelaunch-tripwire` exit 0, and that tripwire checks the
  approvals switch, Stripe mode and the club list — nothing about schema state
  (`scripts/qa/prelaunch-tripwire.ts`). `deploy-myk9show.yml` carries no migration guard either.
- **`supabase db push` is never pre-approved**, so MYK9-1513 correctly sits In Review with
  `needs:operator`, waiting for the owner.

The pre-approved unattended action can run; the gated one cannot. "Frontend ahead of schema" is the
default outcome of leaving the system alone. The last deploy (run `40986148294`,
2026-10-30T01:29:25Z) shipped `d24f07205`, before `90642fdf4`, so production is correct right now —
and four Deploy myK9Show runs fired on the evening of 2026-10-29 alone.

The same codebase already solves this. `3a0afd6d8` (MYK9-1473), merged in the same 24 hours, carries
a commit titled _"fix(entries): secretary read survives a deploy before the tie migration"_ and
`apps/myk9show/src/services/replication/optionalColumn.ts`, which appends new columns as an optional
set and drops the set when PostgREST names an unknown column. `90642fdf4` did not apply it.
`docs/qa/findings.md` records the same class twice before (`people.is_early_adopter`,
`classes.ring_number`).

**Immediate action (no code): push `20261030174300` before the next Deploy myK9Show run.** The issue
carries the structural fix (optional-column path for the classes read) and the guard (refuse a
pre-approved deploy whose commit carries an unapplied migration).

## P3

Both are sub-issues of [MYK9-1528](https://linear.app/myk9-platform/issue/MYK9-1528).

### NCR-2026-10-30-02 — the coin-flip migration's header contradicts its own grant section

[MYK9-1529](https://linear.app/myk9-platform/issue/MYK9-1529) · new · confidence high.

`20261029043900_myk9_1473_coin_flip_tie_order.sql` lines 30-31 say the authenticated `entries`
column grant goes `56 -> 58`. Lines 591-599 say "the entries allowlist stays at 56 columns" and
`REVOKE ALL (placement_tiebreak, placement_tie) ON public.entries FROM anon, authenticated`. The
applied catalog agrees with the section, not the header: `authenticated` holds 56 column grants,
neither tie column among them, and `anon` holds none. The header is pre-review text that Codex
round 3 superseded without updating. No runtime effect; it misleads the next ACL audit, and
"fixing" the apparent drift would re-open the leak that round closed.

### NCR-2026-10-30-03 — only one of two run-order call sites maps the adapter's `0` sentinel

[MYK9-1530](https://linear.app/myk9-platform/issue/MYK9-1530) · new · latent, inert today.

`transformEntry` (`atShowDataAdapter.ts:263`) exposes an unset `run_order` as `exhibitorOrder: 0`.
`c666223db` fixed `applyCombinedRunOrder.ts:36` to map that sentinel to `null`, with a comment
saying 0 is never a real slot; the sibling `useAtShowEntryListHandlers.ts:331` still uses
`?? null`, which keeps `0`. It is inert because the single-class path calls the unscoped
`calculateRunOrder`, which never reads `runOrder`. Had it reached the scoped `preserve` branch, a
lone scoped entry with `runOrder: 0` beside real slots would satisfy `slotsUsable` and be written
`run_order = 0`. The correctness of the unfixed call site rests on an invariant in another module
that nothing pins.

## Verified, not a defect — do not re-file

- **`3a0afd6d8` function and view lineage is correct.** `recalculate_class_placements` and
  `mark_class_results_verified` were both copied from `20261008014300`, which is the latest
  migration defining either before `20261029043900`; the entries view was rebuilt from
  `20261029023100` (the 1369 hoist). LESSON `replace-function-latest` satisfied.
- **Both entries results views carry `WITH (security_invoker = false)` inline** across the two
  rebuilds in this window. `pg_class.reloptions` on the applied database returns
  `{security_invoker=false}` for `view_authenticated_entry_results` and
  `view_authenticated_entry_results_replication`; `relacl` is `authenticated=r` plus `service_role`,
  with no `anon` grant. LESSON `replace-view-reloptions` satisfied.
- **`08c01f4fb`'s move of the three cold entry reads to the replication view does not 42703.** All
  72 columns of `COLD_ENTRY_ROW_SELECT` (`ENTRY_VIEW_MAPPER_COLUMNS` + the four replication-only
  `shows` columns + `version`) exist on `public.view_authenticated_entry_results_replication` in the
  applied database — checked as a set, not by eye, because the generated types do not cover that
  view so `tsc` cannot.
- **`92aade1bf`'s `private.entry_results_caller_access_epoch()` is safe inside the owner-run view.**
  It is `STABLE SECURITY DEFINER SET search_path = ''`, reads only the caller's own row by
  `auth.uid()` (a session GUC, unaffected by the view being owner-run), and returns `NULL` for a
  caller with no epoch row — which `GREATEST` ignores. The new `private.user_access_epoch` table is
  `REVOKE ALL … FROM PUBLIC, anon, authenticated` plus RLS, against this project's `anon`
  default-privileges trap.
- **`a1399914e`'s gateway fix is live, not inert.** `GatewayTransientError` has a string `message`
  and no `code`, so `isSupabaseError` accepts it, every permanent branch is skipped, and the
  fail-open default returns `true` — so `canRetry && isGatewayTransientError(error)` fires. A 502
  whose body _is_ a structured refusal keeps its shape and still parks, because `canRetry` is false
  for it.
- **`909e0a14c`'s `heldForLocalWrite` design does not exist on `main`.** The shipped form is one
  IndexedDB transaction (`putRowAndMutation`), so there is no "held mutation stranded by a crash"
  path; `prepare` throwing writes nothing and `write` throwing commits neither half.
- **`cfb4bb1b6`'s existence read names a column.** `serverHasOwnEntries` uses
  `.select('id', { count: 'exact', head: true })`, not `*`. LESSON `postgrest-count-column` satisfied.
- **`aba7d18bf`'s cached person identity cannot cross accounts.** `loadPersonIdentityCache(userId)`
  is keyed on the auth uid and `usePersonIdentity` clears the previous user's entry on an account
  transition, so `resolveViewerPersonId`'s new fallback can only ever return the current account's
  own person id. `useCurrentUserPersonId` stays confirmed-only for the write path.
- **`45c90a422`'s new `timerVoiceEnabled` defaults to on for existing devices.** The notification
  store's custom `merge` spreads defaults first and then only the non-`undefined` persisted keys, so
  a localStorage blob written before this commit inherits `true`.
- **`d24f07205`'s `createdEntryOutcomes` precedence drops nothing.** `entryBlankOptions.ts:197`
  filters to `outcome === 'created'` anyway, and the offline path sets the new state to `[]` so it
  falls back to `entryOutcomes`.
- **`85f99aafb`'s 4,480-line deletion is clean.** No `OfflineScoringService` / `offlineScoringService`
  reference survives anywhere in `apps/` or `packages/`.
- **`872d384df`'s CI-polling hook is quote-aware and fails open**, so the repo's own
  `AI Projects` path cannot misparse it. LESSON `guard-word-split` satisfied.
- **`78e7e6417`'s drag diff compares stored against desired, not display index.** `snapshot` is the
  pre-drag array of untouched objects (`entriesWithNewOrder` is built with spreads), so skipping an
  unchanged row leaves the database holding the value the UI shows.
- **No edge function changed in this window**, and the one new RPC the app calls
  (`set_class_tie_order(uuid, uuid[])`) exists in `pg_proc`.

## Checks run

| Check                                                                                                                                                                                     | Result                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `git rev-list --count 35c77a6c1..origin/main` against the inventory                                                                                                                       | 33 = 33                                                     |
| Previous stamp: filelist, matching report, rev-list count                                                                                                                                 | Verified on both halves; coverage honoured                  |
| Stranded-report sweep (20 worktrees, `/private/tmp/myk9-ncr-*`, `git diff docs/qa/`)                                                                                                      | Clean                                                       |
| `pnpm vitest run --sequence.shuffle` over `src/features/at-show`, `src/features/results-tab`, `src/services/replication`, `src/components/layout`, `useHasOwnEntries`                     | 263 files / 2762 tests passed, seed `1793334051322`, exit 0 |
| Live SQL (read-only): applied migrations, `classes` columns, `entries` column ACLs, both views' `relacl` + `reloptions`, `pg_proc` for 4 RPCs, 72-column set against the replication view | All as reported above                                       |
| `gh run list --workflow deploy-myk9show.yml`                                                                                                                                              | Last success `40986148294`, head `d24f07205`                |
| Linear dedup (`includeArchived: true`, two queries)                                                                                                                                       | No existing issue for the deploy-ordering defect            |
| Worktree bootstrap                                                                                                                                                                        | Exit 0                                                      |

## Verification limits

A skipped check is a coverage gap, not a pass.

- **`main`'s own CI has not run for the last four commits.** `gh run list --branch main --workflow ci.yml`
  shows `queued` for `1e863d802`, `90642fdf4`, `c666223db` and `895ce90c9` — the oldest queued since
  2026-10-30T03:13Z. Each PR was green on its own head before merge, but post-merge `main` is
  unverified for this window's tip.
- Not run: full app suite, `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`, e2e,
  browser walk, behavioural SQL (`supabase/tests/` is CI-only; the three suites added this window —
  `myk9_1473_coin_flip_tie_order_test.sql`, `myk9_1476_caller_access_epoch_test.sql`,
  `myk9_1513_class_ring_phase_test.sql` — are registered, not observed passing).
- No payment, load, deployment or fixture operation; no write to the database. All SQL was read-only
  catalog and `schema_migrations` queries.
- The P1 is proved by the two halves (code names the column; the database lacks it) and by the
  absence of a guard, not by observing a broken deploy. Deliberately so: observing it would require
  deploying the break.
- No credentials, tokens, PII or connection strings appear in this report or in any Linear issue.

## Notes for the next run

- **The label set the task prompt names still does not exist.** `p0`, `p1`, `source:claude` and
  `audit:commit-review` are absent from this workspace; the live set is `needs:*` / `verify:*` /
  `Bug` / `Feature` / `Improvement` / `Test` / `Ops` / `Parked`. Severity and `source: claude` went
  in the issue bodies, with `Bug` + `needs:operator` on the P1. Creating a label definition needs
  confirmation, so do the same rather than inventing labels.
- **Standing approvals changed what a review has to look for.** From this window on, a merged
  frontend can reach production unattended while its migration waits on the owner. "Does this commit
  read something the applied database does not have?" is now a per-window check, not an occasional
  one. The query is two lines: diff the window's added migrations against `schema_migrations`, then
  grep the app for the columns each adds.
- **The in-repo precedent beat the generic rule.** The finding was not "this looks risky" — it was
  that a sibling commit twelve hours earlier solved the identical problem with a named helper
  (`optionalColumn.ts`) and this one did not. When two commits in one window touch the same hazard,
  compare them.
