# Daily commit review — 2026-10-31

> **Status:** Reference

`source: claude`. **No P0 and no P1.** Two new P3s, both filed. All three findings inherited from
2026-10-30 are `resolved` with proof. Window
`(792773bfbcb8a9102c75ec1830eeb21c2095b620, 4da0bc5903ca83b14ba15c21e2da8b8a1ee1a2a7]` — 35
commits, 2026-10-30T05:01:11Z–2026-10-31T03:25:56Z. No coverage gap.

**The headline is a closure, not a finding.** [MYK9-1527](https://linear.app/myk9-platform/issue/MYK9-1527),
yesterday's P1 — `main` naming `classes.ring_phase` while migration `20261030174300` sat
unapplied, with Deploy myK9Show pre-approved and `supabase db push` owner-only — is gone in both
halves. The migration is applied, the whole 532-version tree is applied, and the deploy workflow
now refuses a commit carrying an unapplied migration from inside the job that picks the commit.
Production deployed current `main` _through_ that guard.

## Coverage

The `daily-commit-review` row named `792773bfbcb8a9102c75ec1830eeb21c2095b620`, window end
`2026-10-30T04:29:04Z`, run by `codex-daily-commit-review` on 2026-10-30.

**The stamp was verified before it was honoured, and it is an unusually honest one.**
`docs/qa/codex-daily-commit-review-2026-10-30.md` is on `main` and titles itself "Incomplete
review; not a clean bill of health". It adopted Claude's 2026-10-30 boundary `1e863d802` after
rev-list-counting that report's 33-commit range (`git rev-list --count 35c77a6c1..1e863d802`
returns 33 — confirmed here), reviewed only the one report-and-cursor commit `792773bfb`
(`git rev-list --count 1e863d802..792773bfb` returns 1 — confirmed here), and then **named the
three commits it had not covered**: `0c0ee971b`, `adb4cb3d1`, `07442f855`. All three are inside
this window, which begins exactly at the commit it stamped. So there is no coverage gap and no
over-stamp: the previous run under-stamped deliberately and said so, which is the behaviour the
boundary contract asks for.

**Trap 1 did not fire for a fifth consecutive run.** `git worktree list` shows 35 worktrees;
`git -C <wt> status --short -- docs/qa/` over every one names only this run's own untracked report.
`git diff --stat docs/qa/` in the primary checkout is empty. `/private/tmp/` holds three leftovers
and none is a stranded report: `myk9-ncr-20261020` is an empty directory that is no longer a git
repository, `ncr-run-29.md` is the already-published 2026-10-29 memory-ledger draft, and
`myk9-codex-ncr-20261030-bootstrap.txt` is a bootstrap log whose worktree is gone.

This run worked in a dedicated worktree `/private/tmp/myk9-ncr-20261031`, branch
`claude/ncr-review-20261031`, created off `origin/main` at `4da0bc590` with a clean tree
(`git status --porcelain` → 0 lines), never the primary checkout.

## Commits reviewed

| Commit      | Subject                                                                                                        | Change                |
| ----------- | -------------------------------------------------------------------------------------------------------------- | --------------------- |
| `0c0ee971b` | feat(stats): Show Stats and Results regain filters, breed chart, pending classes (MYK9-1512) (#3412)           | 23 files, +1375/-97   |
| `adb4cb3d1` | docs(qa): site-admin intent walk 2026-10-30 and Part 2 mechanics                                               | 2 files, +169         |
| `07442f855` | docs(qa): show-day walk 2026-10-30 and Part 2 mechanics                                                        | 2 files, +153/-3      |
| `d1bebff6c` | docs(qa): retain partial Codex review and precise cursor for October 30                                        | 2 files, +65/-1       |
| `2ed7ee806` | refresh My Shows and the Home card on focus (#3418)                                                            | 4 files, +246         |
| `fc55cb1f4` | MYK9-1501: scoresheet fits a phone (pinned Save/Cancel, one-row faults, compact header, timer) (#3422)         | 28 files, +2484/-2253 |
| `9231131e6` | feat(at-show): shared class dialog shell, grouped Class Options, class statistics (#3420)                      | 12 files, +719/-267   |
| `a1d63054a` | chore(qa): record backgrounded sleep as an accepted false deny (MYK9-1492) (#3424)                             | 2 files, +7           |
| `e0be5e3eb` | feat(entry-list): show the ring phase in the header and info popover (MYK9-1526) (#3421)                       | 14 files, +346/-30    |
| `89c69dbc0` | feat(at-show): staff dog finder and dog page (MYK9-1509) (#3419)                                               | 16 files, +1406       |
| `42b488c15` | fix(at-show): entry list says entries are not on this device, not No Entries Yet (#3425)                       | 12 files, +444/-38    |
| `18d18bb45` | fix(my-entries): rail own-entry check ignores soft-deleted entries (MYK9-1491) (#3428)                         | 2 files, +74/-4       |
| `34e807474` | test(e2e): update stale Shows list pane expectations (MYK9-1489) (#3429)                                       | 1 file, +10/-8        |
| `5529bff18` | docs: archive standing-approvals plan (MYK9-1485)                                                              | 3 files, +2/-3        |
| `0ea629e40` | test(e2e): 60 s gateway-503 control for the mutation queue (MYK9-1488) (#3433)                                 | 1 file, +94           |
| `3f7e94a88` | feat(review-gate): tag pre-existing defects as non-blocking, ask for bug classes (MYK9-1546) (#3435)           | 6 files, +104/-1      |
| `d6a7ad720` | fix(ci): update Node for Astro builds (MYK9-1499) (#3430)                                                      | 17 files, +30/-30     |
| `d96572e33` | docs: batch the 38 Linear Todo issues into 18 PRs (plan 2026-10-30)                                            | 2 files, +230/-125    |
| `e9878adc1` | feat(results): Nationals leaderboard view in the Results tab (#3423)                                           | 10 files, +1080/-20   |
| `caa1a69ec` | feat(at-show): ringside menu on class and entry lists (MYK9-1508) (#3427)                                      | 31 files, +1181/-25   |
| `5751d61c7` | fix(at-show): settle show hydration offline so cached dogs render (MYK9-1509) (#3434)                          | 7 files, +209/-15     |
| `80e4fbcb8` | fix(scoring): ASCA/UKC trial types resolve to their own scoresheet (MYK9-1543) (#3436)                         | 2 files, +75/-5       |
| `2c17a73bb` | fix(replication): clear a show on the next sync after a revoke-to-zero (MYK9-1521) (#3437)                     | 9 files, +608/-18     |
| `9ee460f7f` | Share the unset run-order rule and derive the A/B ring phase from one merge (#3439)                            | 11 files, +249/-52    |
| `6b27f92f1` | fix(shows): late Find Shows cards stay visible; Refresh app; /shows reloads offline (MYK9-1549, -1539) (#3441) | 9 files, +254/-28     |
| `35e9c3ecc` | fix(my-shows): hold the return refresh for every in-flight check-in (MYK9-1531) (#3442)                        | 3 files, +83/-2       |
| `2dfa6d0fb` | fix(qa): deploy guard refuses unapplied migrations; drop ring-phase read fallback (MYK9-1527, -1529) (#3438)   | 15 files, +316/-19    |
| `16df10636` | One smart time entry used everywhere a duration is typed (MYK9-1503) (#3449)                                   | 40 files, +1048/-1165 |
| `48407cf4b` | feat(show): ringside staff reach Results during the show (MYK9-1544) (#3448)                                   | 7 files, +171/-5      |
| `632cf0672` | Ask Queue: keep the conversation when the panel is closed and reopened (#3446)                                 | 6 files, +530/-11     |
| `3c452f9b8` | feat(settings): ringside Settings works offline, theme prefs local-first (MYK9-1545) (#3450)                   | 12 files, +845/-81    |
| `54baab09c` | feat(home): Your entries today card, restructured (MYK9-1524) (#3444)                                          | 14 files, +947/-75    |
| `e6f9b8db5` | fix(at-show): dog pages' not-on-device notice also covers trials and classes (#3445)                           | 9 files, +154/-46     |
| `7129af19d` | fix(admin): site-admin walk — auth-id deep link, 14px/44px floors, signups link (MYK9-1533..1536) (#3447)      | 17 files, +395/-44    |
| `4da0bc590` | docs(plan): Wave 3 adds 1540 and 1566; record 2026-10-30 owner decisions                                       | 1 file, +10/-4        |

305 files, +15,964/−4,326 in all. One migration was added in this window
(`20261031014300_myk9_1521_changed_since_caller_access.sql`) and it is applied.

## Counts

|                                      |                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| New                                  | 2 (0 P0, 0 P1, 0 P2, 2 P3)                                                           |
| Unchanged                            | 0                                                                                    |
| **Resolved**                         | **3** (MYK9-1527 P1, MYK9-1529 P3, MYK9-1530 P3)                                     |
| Duplicate                            | 0                                                                                    |
| Rejected                             | 0                                                                                    |
| Blocked                              | 0                                                                                    |
| Fixes found in subsequent commits    | 3 (all three inherited findings, by `2dfa6d0fb` and `9ee460f7f`)                     |
| Existing QA/Linear references reused | 5 (MYK9-1516, MYK9-1543, MYK9-1540, MYK9-1570, MYK9-1503 — referenced, not re-filed) |
| Linear issues created                | 3 (parent MYK9-1572 with MYK9-1573 and MYK9-1574)                                    |
| Linear comments posted               | 3 (closure proof on MYK9-1527, MYK9-1529, MYK9-1530)                                 |
| Baseline SHA                         | `4da0bc5903ca83b14ba15c21e2da8b8a1ee1a2a7`                                           |

## Resolved — with the proof, not the merge

A merge is not resolution. Each of these carries a passing check or a live measurement.

### MYK9-1527 / NCR-2026-10-30-01 — the deploy-ahead-of-schema P1

`2dfa6d0fb` (#3438). Measured against the live project `sojmvhhwsjxmfistvzbe` and GitHub Actions
on 2026-10-31:

- `supabase_migrations.schema_migrations` now ends `20261029192700, 20261030174300, 20261031014300`.
  The column migration that was missing yesterday is applied, and so is this window's new one.
- **The whole tree, not just that file.** `git ls-tree -r HEAD supabase/migrations` yields 532
  distinct 14-digit versions; `select count(*) … where version ~ '^[0-9]{14}$'` returns 532.
- **The guard is live and it ran.** `deploy-myk9show.yml`'s `preflight` job now carries a
  `Refuse a commit with unapplied migrations` step after `pick-deploy-commit.sh`, running
  `scripts/qa/deploy-migration-guard.ts` on `steps.pick.outputs.commit_sha`. In Deploy myK9Show
  run `41164306544` (head `7129af19d`, 2026-10-31T03:25:20Z) that step's conclusion is `success`
  and the `deploy` job completed through `Verify myk9show.com serves this deployment` — current
  `main` reached production _through_ the guard.
- **Neither a caller nor timing can skip it.** It lists migrations at the exact SHA the workflow
  picked (`git ls-tree -r --name-only <sha>:supabase/migrations`) rather than a moving
  `origin/main`, which is what the reverted pinning attempt got wrong, and it refuses on exit 2
  (could not decide) as well as exit 1.
- **The legacy `NNN_` files do not cause a permanent false refusal.** `MIGRATION_FILE` is
  `/(?:^|\/)(\d{14})_[^/]*\.sql$/`, so pre-2026 files are skipped — which the 532 = 532 count
  above demonstrates in the guard's own arithmetic.

Residual, stated rather than hidden: the **refusal** direction has unit coverage only
(`scripts/qa/deploy-migration-guard.test.ts` via `pnpm qa:prelaunch-tripwire:test`). No deploy has
yet been attempted against a commit with an unapplied migration, so there is no end-to-end red
observation.

### MYK9-1529 / NCR-2026-10-30-02 — the coin-flip migration header

`2dfa6d0fb`, comment-only. `20261029043900`'s header now says the authenticated entries column
SELECT "stays at 56 columns" and that both tie columns are revoked from `anon` and `authenticated`
on the base table, which is what its own section 6b does and what the applied catalog holds. The
diff touches lines 30–32 of that file and nothing else, so the applied migration is untouched.

### MYK9-1530 / NCR-2026-10-30-03 — the run-order `0` sentinel

`9ee460f7f` (#3439) exports one rule, `storedRunOrder`, in `apps/myk9show/src/lib/runOrderUtils.ts`,
and routes every caller through it: `applyCombinedRunOrder.ts`, `useAtShowEntryListHandlers.ts:331`
(the unfixed site the finding named), `persistEntryRunOrder.ts` (which previously wrote a literal
`0` through `?? index + 1`) and `persistRunOrderResults.ts`'s `previousOrder` map. The invariant
the finding objected to resting on is now the function.

Proof, run in this worktree: `pnpm vitest run src/lib/runOrderUtils.test.ts
src/features/show-map/pages/ClassList/utils/combinedSectionState.test.ts
src/features/at-show/ringsideStatusInfo.test.ts src/features/results-tab/nationalsLeaderboard.test.ts
src/services/replication/__tests__/ReplicatedEntriesTable.revokedAccess.test.ts
src/pages/scoring/scoresheetKeyForClass.test.ts src/components/classes/ClassResultsTable` →
**18 files, 162 tests, all passed, exit 0**.

## P3

Both are sub-issues of [MYK9-1572](https://linear.app/myk9-platform/issue/MYK9-1572).

### NCR-2026-10-31-01 — the nationals leaderboard reads a missing run time as 0

[MYK9-1573](https://linear.app/myk9-platform/issue/MYK9-1573) · new · first/last seen 2026-10-31 ·
1 consecutive run · confidence high on mechanism, medium on reach · role: anyone viewing
`/shows/:id/results?view=leaderboard`.

`e9878adc1` (MYK9-1516) ranks the board on points descending, then **total time ascending**, and
accumulates time as `row.totalTimeSeconds += entry.search_time_seconds ?? 0`
(`apps/myk9show/src/features/results-tab/nationalsLeaderboard.ts:188`). Nothing distinguishes "this
run took 0 seconds" from "no time was recorded", so an untimed run is the fastest value
`compareLeaderboard` can see and its dog outranks a dog with a real time at equal points.

The absent state arrives as a stored `0` as well as a `null`: the results grid requires a time only
for `Qualified` (`useClassResults.ts:212`) and `inputFormatToDbSeconds('')` returns `0`
(`scoringMappings.ts:50-57`). Measured live over `public.entries` where `is_scored is true and
deleted_at is null`: `nq` 5 rows, 4 of them time 0-or-null; `absent` 1 row, 1 of them; `qualified`
15 rows, 0 of them. `isRankableEntry` admits NQ and absent rows, so the state already exists on
exactly the entries the board counts.

Held at P3 because the surface is unreachable: `isNationalsLeaderboardView` requires
`isNationals === true` and `select count(*) filter (where is_nationals) from public.shows` returns
**0 of 28**. The URL alone never opens it. It becomes a P2 the first time a nationals show runs.

### NCR-2026-10-31-02 — a UKC/ASCA trial with no `trial_type` refuses every scoresheet

[MYK9-1574](https://linear.app/myk9-platform/issue/MYK9-1574) · new · confidence high on mechanism,
low on current reach · role: judge or secretary scoring a UKC/ASCA class.

`80e4fbcb8` (MYK9-1543) rightly stops a non-AKC show falling through to the AKC sheet, but it
dropped the `!trial.trialType` early return, so a UKC or ASCA trial with a NULL `trial_type` now
resolves to `UNRESOLVED_SPORT_TYPE` and the page says "Scoresheet Not Available" with no stated
cause and no remedy. `public.trials.trial_type` is nullable with no default, and
`cloneFromShow.ts:73,81` copies the value verbatim, so cloning reproduces it.

No live impact today: all six NULL-`trial_type` trials (5 UKC + 1 AKC) are disposable e2e/walk
fixtures with **0 live entries**, and the AKC one keeps its class-name fallback by design. The
strictness is correct; the gap is that the write path which produces the refused value is still
open and the refusal does not name the missing field.

## Verified, not a defect — do not re-file

- **`2c17a73bb`'s revoke-to-zero purge cannot strand an exhibitor.** `v_authorized` in
  `20261031014300` covers every arm the results view admits rows by, including `is_own_entry` and
  `is_show_exhibitor` (the per-entry arms, in two guarded `EXISTS` blocks), not just the
  manager/steward/passcode arms. `caller_has_access` is TRUE for NULL arguments, an unknown show
  and a missing `auth.uid()` ("unknown never purges"), and the client sets `callerHasNoAccess` only
  on an explicit `=== false`, so an older server that omits the field never purges.
- **`20261031014300`'s lineage and grants are correct.** `grep -l "entry_results_changed_since"
supabase/migrations/` finds three definitions; `20261029192700` is the latest before this one and
  is the file the body was copied from, satisfying LESSON `replace-function-latest`. The
  `DROP FUNCTION` + `CREATE` restates grants byte-identically to both predecessors
  (`REVOKE ALL … FROM PUBLIC, anon, authenticated` then `GRANT EXECUTE … TO authenticated`), so the
  `anon` exclusion is pre-existing policy, not a regression introduced here.
- **`18d18bb45`'s soft-delete filter does not 42501 or 400.** `view_authenticated_entry_results`
  exposes `deleted_at`, `is_own_entry` and `id` (`information_schema.columns`), and its ACL is
  table-level `authenticated=r/postgres` with **no** column-level `attacl` rows, so `authenticated`
  may filter on `deleted_at`. The count still names a column (`select('id', …)`), satisfying LESSON
  `postgrest-count-column`.
- **`16df10636`'s parser rewrite cannot write a value the save path mis-reads.** `DurationInput`
  stores `result.formatted` whenever the parse succeeds, and `joinSearch` always emits
  `m:ss.cc` with at most two minute digits — exactly what `inputFormatToDbSeconds`'s
  `^(\d{1,2}):([0-5]\d)\.(\d{2})$` accepts. An unresolved value is stored as the raw text and
  `useClassResults.validate` refuses to submit it. Only `formatTimeInputToMMSS` was deleted from
  `packages/core/src/utils/timeFormatting.ts`; `formatSecondsAsMSSCC` and the rest survive, so
  `dbSecondsToInputFormat` still round-trips. The bare-digit semantic change (`125` → `0:01.25`,
  not 125 s) is the owner's recorded decision, shown live under the field before it is saved.
- **`7129af19d`'s auth-id deep link uses the right column.** `useDeepLinkedUser` looks the id up as
  `people.auth_user_id`, never `people.id`, which is the `people.id ≠ auth.uid()` trap. The
  Signups deep link is real, not decorative: `parseUserListParams` reads `from` into
  `filters.dateRange.start` and `parseDate` accepts exactly the `YYYY-MM-DDTHH:mm:ss.sssZ` form
  `easternDayStartIso` produces.
- **`48407cf4b`'s audience widening does not bypass a server gate.** `hasRingsideAccess` only moves
  a ringside-admitted non-manager from the public landing to the tabbed view; the Results tab's
  release gate and the view's RLS are unchanged. The deliberate edge is documented in the hook: a
  judge whose assignments cannot be read yet (offline cold boot) is admitted rather than shown the
  wrong surface.
- **`6b27f92f1`'s "Refresh app" cannot land on a dead page.** `refreshApp` returns early when
  `navigator.onLine` is false and the menu item is disabled offline; the service-worker swap goes
  through the existing `SKIP_WAITING` contract with a 3 s `controllerchange` fallback. Queued
  mutations live in IndexedDB, so a reload does not drop them.
- **`actions/setup-node@v7` in the new deploy step is not a typo.** Every workflow in
  `.github/workflows/` pins `@v7` with `node-version: '22.23.4'`, and the step ran green in run
  `41164306544`.
- **`0c0ee971b`'s breed chart follows the page's existing qualification convention.**
  `computeBreedPerformance` tests `resultText === 'Q'`, the same test as the pre-existing
  `isQualified` (`analytics-utils.ts:98`) over the same `'Q' | 'NQ' | 'ABS' | 'EX' | 'DQ' | 'WD' |
'pending'` union, and `isScored` is the page's own `!== 'pending'`. Re-implementing the literal
  rather than calling `isQualified` is a DRY nit, not a defect.

## Checks run

| Check                                                                                       | Result                            |
| ------------------------------------------------------------------------------------------- | --------------------------------- |
| `bash scripts/bootstrap-worktree.sh` in the review worktree                                 | exit 0, "Worktree ready"          |
| Focused vitest over the seven touched areas (see MYK9-1530 above)                           | 18 files, 162 tests, exit 0       |
| Live `schema_migrations` vs `git ls-tree` migration versions                                | 532 = 532                         |
| Deploy myK9Show run `41164306544` migration-guard step                                      | `success`                         |
| Applied-catalog ACL read on `view_authenticated_entry_results` (table + column)             | `authenticated=r`, no column ACLs |
| Live distribution of `trials.trial_type` by `shows.organization`                            | 7 combinations, 6 NULL rows       |
| Live `entries` scored-row time distribution by `result_status`                              | 21 rows, 5 with time 0/null       |
| `git worktree list` (35) + per-worktree `status -- docs/qa/` + `/private/tmp` scan (trap 1) | no stranded report                |

## Verification limits

- **No browser, staging or e2e walk.** This stream reviews a commit range by reading; the UX
  commits in this window (`fc55cb1f4`, `9231131e6`, `caa1a69ec`, `54baab09c`, `632cf0672`,
  `e0be5e3eb`, `89c69dbc0`, `42b488c15`, `e6f9b8db5`) were read for logic and data flow, not
  walked. Their visual and interaction claims rest on their own PR evidence.
- **No full suite and no shuffled run.** This review changed no application code, so the shuffle
  arithmetic does not apply; the focused run above is the only test evidence.
- **The migration guard's refusal direction is unit-tested only** (see MYK9-1527 above).
- **Labels.** The task's `p0`/`p1`/`p2`/`p3`, `source:claude` and `audit:commit-review` labels do
  **not exist** in this Linear workspace, and creating label definitions needs owner confirmation
  (CLAUDE.md § Auto Mode). The three new issues carry `Bug` plus priority Low and record the
  intended taxonomy in their bodies. This is a reportable gap, not a silent skip: if the taxonomy
  matters, the labels need creating once by the owner.
- **No P2 was found.** That is a statement about this window's 35 commits under a reading review,
  not a clean bill of health for the surfaces they touch.

## Boundary

Stamped `daily-commit-review` → `4da0bc5903ca83b14ba15c21e2da8b8a1ee1a2a7`, window end
`2026-10-31T03:25:56Z`, run by `claude-daily-commit-review` on 2026-10-31. `origin/main` was
re-fetched after the review and had not moved, so this stamp is the tip actually reviewed.

## Related

- `docs/qa/audit-boundary.md` — the shared cursor.
- `docs/qa/codex-daily-commit-review-2026-10-30.md` — the previous, deliberately partial run.
- `docs/qa/claude-daily-commit-review-2026-10-30.md` — where the three resolved findings came from.
