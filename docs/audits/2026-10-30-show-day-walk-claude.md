# Show-day walk, 2026-10-30 (Claude)

- Run token: 2026-10-30 0313 (America/Chicago; fixture restored 08:13Z, entry created 08:16:21Z, pulled 08:24:56Z)
- Prompt version (`origin/main`): `adb4cb3d170d0b2813f36a1c711041bd0b715406`. This report's worktree is cut from the same commit.
- Prior show-day walk baseline: `2026-10-23-show-day-walk-claude.md`, prompt version `f20731987`. 128 commits since then touch `apps/myk9show/src`, `packages` or `supabase/migrations` (`git log --oneline f20731987..adb4cb3d1 -- apps/myk9show/src packages supabase/migrations`). I walked the flows those commits touch and did not exercise each commit one by one. Commits in range that bear on this chain: `90642fdf4` (MYK9-1513, ring phase: see S5), `1e863d802` / `c666223db` / `45c90a422` (ringside Up control, Run Order dialog, spoken warning; not yet deployed), `e12bf1c0e` (MYK9-1342, judge cards name show and trial), `57f4cde86` (at-show "today" in the show's timezone), `27d725829` / `3870d2648` (un-pull restores check-in), `f5f8100f0` / `25787b036` (`set_class_judge` RPC), `909e0a14c` / `11a554af9` / `a1399914e` / `19a60f983` (replication queue and retry budget), `92aade1bf` / `13b6ae21d` / `90db9aa1c` (entry results view), `d8b762f19` (withheld result copy), `78e7e6417` (drag reorder writes only changed rows).
- **Surface: a local dev server (vite, port 5191) built from the deployed commit `d24f072057ae0b3dc96b08c5c353ae812804bf84`**. That commit was built by Deploy myK9Show run 40986148294 (2026-10-30T01:29Z, success). It ran against the shared staging/production database. I did not walk the deployed bundle itself, because the auto-mode classifier refused signing in on `https://myk9show.com` ("Production Reads"). I did not walk `origin/main` either: it reads `classes.ring_phase`, which the database does not have (S5), and every classes sync on it returned 400. The entry itself was created through the Add Entry wizard while the server still ran `origin/main` (08:16Z). Every later step ran on `d24f07205`, and from the judge's reload on, its own freshly built packages. See Harness notes for the one mixed-build artifact.
- Fixture restore (psql, one call): `{"today": "2026-10-30", "created": true, "show_id": "dededede-0000-0000-0731-d1fd68bbfe5e"}`. No fixture covered today, so this inserted a new one (Oct 30 – Nov 5).
- Today's class: `dededede-0000-0000-0731-6d9a618fe4d1` (Container Novice A, trial `dededede-0000-0000-0731-462c14b80057`, Trial 1, 2026-10-30, 09:00, upcoming, 2 entries). The precondition query returned one row. Ranger entries in the class before the walk: 0.
- **WALK ENTRY 57011622-e46e-4e96-a871-181a46e24ada** (Ranger, armband 202, run 3, handler Mary Smith = `exhibitor@`, Check (pay at show), $35 unpaid, `is_day_of_show = true`, confirmation **MK9-000320**).
- **Teardown: Pull.** I pulled it from its per-class status chip on the entry form (`Accepted` → `Pull`, applied at once). The row stays live with `deleted_at` null: `entry_status = scratched`, `check_in_status = pulled`, `withdrawn_at` 08:24:56Z, `is_scored = true`, qualified, 52 s, version 9. Declared residue. It sits on seeded dog Ranger with nothing paid, so the next reseed removes it.
- Willow and Cooper at teardown equal their start values: `confirmed`, `no-status`, not scored, `pending`, 0 s, 0 faults, run 1 and 2, armband 200 and 201, version 1, `updated_at` 2026-10-30 08:13:09.987 UTC. Nothing else in the class changed.
- Browser sessions: `sdw-20261030-secretary`, `sdw-20261030-judge`, `sdw-20261030-exhibitor` (playwright-cli, one per role, each its own in-memory context). `sdw-20261030-sec-prod` was opened at `about:blank` for the refused production sign-in and then closed. All are closed.

## Result

On the deployed code, the secretary → judge → exhibitor chain held on every fact the walk checks, including the offline cycle. No new P0/P1 in the chain itself. One open P1 deploy hazard was re-confirmed in a real browser: `origin/main` breaks classes sync against the live schema (S5, already filed as MYK9-1527; I commented there and did not file a new issue). The prior walk's S2 (MYK9-1341) and S3 (MYK9-1342) are resolved. Nothing new was filed.

## Cross-role fact table

| Fact                   | SQL                                                               | Secretary saw                                                                                                       | Judge saw                                                                        | Exhibitor saw (each surface)                                                                                                                                              | Agree?           |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Judge name             | Pat Donovan (`judge_assignments` class-level, `b0728006…`)        | Schedule row `Pat Donovan · 3 entered`; focused class `Judge: Pat Donovan`                                          | Scoresheet header `Container Novice A · Judge Pat Donovan`; account `Pat, Judge` | Show page `9:00 AM · Trial 1 · Judge Pat Donovan` on Ranger's and Willow's rows. Not shown on My Entries, the dog page or the at-show row                                 | yes where shown  |
| Class start time       | `09:00:00`                                                        | Schedule `9:00 AM`; focused class `Expected start 09:00`; People at show `Trial 1 - 9:00 AM`                        | Dashboard card `09:00 AM`; class header `Fri, Oct 30, 2026 • Trial 1`            | Show page `9:00 AM`; at-show `Scheduled 9:00 AM`; My Entries `First class 9:00 AM`                                                                                        | yes              |
| Check-in state         | checked-in (v3) → in-ring (v4) → completed (v6, v8) → pulled (v9) | People at show `Checked in 1 entry for Mary Smith.`; Needs attention reads `Check in 2 entries` (Willow and Cooper) | Entry list `Checked in` on Ranger before scoring                                 | Show page `Done · Completed`; at-show `Completed`; My Entries `Scored`, then `Pulled` / `pulled` after the pull                                                           | yes              |
| Armband                | 202                                                               | `#202 Ranger` on Can change class; `202` on People at show and the entry form (`202, change armband for Ranger`)    | `202` on the card and the scoresheet                                             | `202` on My Entries, show page (`Armband 202`), at-show (`#202`)                                                                                                          | yes              |
| Running-order position | `run_order = 3`                                                   | Third in Can change class (#200, #201, #202)                                                                        | Third (Up next Willow, Then Cooper, Ranger)                                      | Not shown as a position (owner decision MYK9-992); completed dog shows its state                                                                                          | yes (by design)  |
| Result                 | qualified                                                         | Not shown (Results tab 0; class not completed)                                                                      | `Qualified` on the Score Confirmation panel                                      | My Entries `Q preliminary`; show page `Q · 0:52.00 · preliminary`; at-show `Q 52.0s preliminary`; dog page Recent results `0:52.00 preliminary Q` (`1/1 qualifying runs`) | yes              |
| Search time            | 68 s (online), then 52 s (offline edit)                           | Not shown                                                                                                           | `1:08.00` online; `0:52.00` on the offline confirmation                          | `52.0s` (My Entries, at-show), `0:52.00` (show page, dog page)                                                                                                            | yes (final 52 s) |
| Faults                 | 0                                                                 | Not shown                                                                                                           | `Faults Count` stepper at 0 (minus disabled)                                     | Not shown on any surface. Correct for 0 faults (owner decision, #2923)                                                                                                    | yes (by design)  |

## SQL row after each step

Entry `57011622-e46e-4e96-a871-181a46e24ada` (Ranger).

| Step                                         | check_in_status | is_scored | result_status | search_time_s | faults | run_order | armband | version | entry_status | updated_at (UTC) |
| -------------------------------------------- | --------------- | --------- | ------------- | ------------- | ------ | --------- | ------- | ------- | ------------ | ---------------- |
| Secretary adds mail-in entry                 | no-status       | false     | pending       | 0             | 0      | 3         | 202     | 2       | confirmed    | 08:16:21.440     |
| Secretary checks in (People at show)         | checked-in      | false     | pending       | 0             | 0      | 3         | 202     | 3       | confirmed    | 08:18:51.108     |
| Judge opens the scoresheet                   | in-ring         | false     | pending       | 0             | 0      | 3         | 202     | 4       | confirmed    | 08:20:56.605     |
| Judge Confirm & Submit (online, 1:08.00)     | completed       | true      | qualified     | 68            | 0      | 3         | 202     | 6       | confirmed    | 08:21:32.249     |
| Offline edit to 0:52.00, confirmed on device | completed       | true      | qualified     | 68 (online)   | 0      | 3         | 202     | 6       | confirmed    | 08:21:32.249     |
| After reconnect, queue flushed               | completed       | true      | qualified     | 52            | 0      | 3         | 202     | 8       | confirmed    | 08:22:21.700     |
| Secretary pulls                              | pulled          | true      | qualified     | 52            | 0      | 3         | 202     | 9       | scratched    | 08:24:56.801     |

The entry also landed with `is_day_of_show = true`, `payment_method = check`, `payment_status = pending`, `deleted_at` null. Exactly one Ranger entry existed in the class at every read. I read Willow (`…a4fb460fe0a6`) and Cooper (`…a47c7b46567b`) at the start, after check-in, after the flush and at teardown. Every read returned version 1, `no-status`, not scored, `updated_at` 08:13:09.987.

## Offline cycle and request log

Judge session, `context.setOffline(true)` through `playwright-cli run-code` (`navigator.onLine` read back `false` from `page.evaluate` in the same call), then `Correct this score` → time `0:52.00` → Save → `Confirm & Submit` while offline. The panel read `Saved on this device. It will send when you're back online.`, with the page-foot banner `No internet connection · Changes will be saved locally and synced when connection is restored.` After `setOffline(false)` the first SQL poll, about 9 s later, already held 52 s / v8, and the panel read `Score saved`. The playwright-cli network log has order and status but no clock, so the times come from SQL `updated_at`.

| #   | Method | Endpoint                                                                                           | Status                                  | When                                 | What it wrote                              |
| --- | ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------------------------ |
| 1   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                               | 200                                     | 08:20:56Z, scoresheet opened         | `in-ring` (v4)                             |
| 2   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                               | 200                                     | 08:21:32Z, Confirm & Submit online   | score: qualified, 68 s, 0 faults (v5)      |
| 3   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                               | 200                                     | 08:21:32Z                            | `completed` (v6)                           |
| –   | GET    | `/rest/v1/classes?…` ×8, `/rest/v1/view_authenticated_entry_results_replication?…` ×8              | FAILED `net::ERR_INTERNET_DISCONNECTED` | offline window                       | background replication pulls, no write     |
| –   | POST   | `/rest/v1/rpc/entry_results_changed_since` ×2, `/rest/v1/rpc/ringside_claim_generation_current` ×2 | FAILED `net::ERR_INTERNET_DISCONNECTED` | offline window                       | change probe and claim heartbeat, no write |
| 4   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                               | 200                                     | 08:22:21Z, after `setOffline(false)` | score: qualified, 52 s, 0 faults (v7)      |
| 5   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                               | 200                                     | 08:22:21Z                            | `completed` (v8)                           |

Five scoring writes in all, every one 200: no 409 / 40001 conflict, no replay and nothing retrying after the label cleared. The log's `net::ERR_ABORTED` lines (vite dev modules, `clubs`, `judge_assignments`, `show_announcements`, `waitlist_entries`) come from the dev-server restart and reload before the judge's walk. They are harness noise, not offline behavior.

## Findings

### S2 (resolved, was P3): People at show printed a class's start time as raw `09:00:00`

- MYK9-1341 is Done. People at show now reads `Container Novice A · Trial 1 - 9:00 AM` on every day's row. Holds.

### S3 (resolved, was P3): judge dashboard Today cards named neither show nor trial day

- MYK9-1342 is Done (`e12bf1c0e`). The Today card reads `Container Novice A · Heartland Scent Work Week · Trial 1 · Fri, Oct 30, 2026 · 09:00 AM · 0/3 entries`. Holds.

### S4 (unchanged context, MYK9-1281): duplicate emptied fixtures

- Not re-measured. This run's restore created a fresh fixture, and the judge dashboard showed only one Today card, because no older fixture has a trial dated today. No new evidence either way.

### S5 (existing P1, MYK9-1527; not filed anew): `origin/main` reads `classes.ring_phase`, which the database does not have

- Role and route: secretary, `/shows/<show>/entries` and the Add Entry wizard, on a dev server built from `origin/main` `adb4cb3d1`, 08:14–08:16Z.
- Observed: every `GET /rest/v1/classes?select=…` returned 400 (24 in about 90 s). The console logged `[classes] Sync failed: Supabase query failed: column classes.ring_phase does not exist`, replication logged `Table sync failed {name: classes …}`, and the show header read `Offline copy: not saved on this device · Sync needs attention`.
- SQL: `ring_phase` is absent from `public.classes`. `supabase_migrations.schema_migrations` tops out at `20261029192700`, and `20261030174300_myk9_1513_class_ring_phase.sql` (merged in `90642fdf4`) is not applied.
- Production (`d24f07205`) predates `90642fdf4` and is unaffected. The hazard is the next Deploy myK9Show run, which standing approvals let an unattended session start, if it runs before an owner-authorized `supabase db push`.
- Dedupe (`includeArchived: true`, query `ring_phase`): **MYK9-1527** (High, Backlog, filed by the daily commit review the same morning) covers exactly this, with the fix plan. I commented there with the browser evidence. No new issue.
- Not measured: what a judge sees at ringside on `origin/main` against this schema. The one ringside crash I saw came from a mixed build (Harness notes), so I make no claim about it.

## Open issues re-verified

- **MYK9-494** (Done): the judge name renders on every exhibitor schedule row (`Judge Pat Donovan`), on the secretary's schedule row and on the focused class. Holds.
- **MYK9-637** (Done): the judge dashboard read `0/3 entries` and the at-show list `Pending 3`, which agrees with SQL. Holds.
- **MYK9-639** / **MYK9-640** (Done): no move-up in this walk. The check-in survived the whole chain (`checked-in` → `in-ring` → `completed`). No fresh evidence on the move-up itself.
- **MYK9-740** (Done): five scoring RPCs, all 200, two after the reconnect, no conflict and no replay. Holds.
- **MYK9-1258** (Done): after the pull, the exhibitor's My Entries card reads `Pulled` with its class row `pulled`, and shows no Q or time. Holds.

## Things checked and found correct

- The judge account renders as `Pat, Judge` (judge-only, so MYK9-141 holds).
- A day-of entry on today's trial was accepted (`is_day_of_show = true`), although the exhibitor's show page says `Entries closed on 10/27/2026`.
- Add Entry wizard: the dog search returns one `Ranger` (`German Shepherd Dog · Mary Smith · AKC SR034F848C`), and the class step lists all seven trials with weekday and date. Handlers was prefilled `Mary Smith · Owner`. `Check (pay at show)` plus the AKC agreement box enabled `Submit — bring check to show`. The receipt read `Submitted · Confirmation # MK9-000320 · Entry submitted.`
- Armband 202 and run order 3 were assigned at creation (MYK9-1048 holds).
- People at show: `Check in` on Ranger's Trial 1 row checked in one entry. Willow's row for the same trial still read `Not checked in`, and other days read `Not today`.
- Exhibitor cold replica (fresh in-memory context): the scored entry appeared on all four surfaces on first load, with `preliminary` labels, no fault count (0 faults, by design) and no placement (class not completed, by design).
- Pull from the status chip applied at once with no confirm dialog, and the chip then read `Pulled · refund at the club's discretion`. The menu offered `Accepted (current)`, `Mark pending`, `Pull`, `Reject`, `Withdrawn`, `Request payment…`.

## Not filed (noted only)

- The exhibitor's My Shows greets with `Good evening, Mary.` at 03:23 local time (recorded on 2026-10-23 as well).
- The exhibitor's My Entries lists Ranger in `Heartland Scent Work Classic` (Dec 7) as `Partially scored` with a `Q`. Ranger's dog page lists the same show's Interior Advanced entry as `Submitted — awaiting review`. That is seeded data in a future show, outside this chain, and I did not trace it.
- The Add Entry Payment step opens with `Secretary Payment (Already Received)` pressed. Recorded as a mechanic in Part 2. Whether that default is right for a mail-in entry is a product question, not a defect this walk can judge.

## Harness notes

- The `EnterWorktree` bootstrap hook did not run again (no `node_modules`, no `supabase/.env`). `bash scripts/bootstrap-worktree.sh` by hand fixed it.
- When I switched the worktree to `d24f07205`, my first package rebuild (`pnpm -r --filter "./packages/**" build`) matched no project and exited 0. The `origin/main` package `dist` stayed in place, and the judge's entry list crashed with `TypeError: Cannot read properties of undefined (reading 'label')` in `EntryListHeader` (`packages/ringside/dist`). After `turbo build --filter="./packages/*" --force` and a vite `--force` restart, the same page rendered correctly. The crash came from a mixed build (`origin/main` ringside package with `d24f07205` app source), not from the app. It is recorded in Part 2.
- The secretary's check-in ran on `d24f07205` app source with the stale `origin/main` package `dist`. SQL confirms it wrote exactly the expected row (v3 `checked-in`, nothing else changed).

## Canary candidates section

- S5 guard: with the deployed bundle, signed in as any role, no `GET /rest/v1/classes` request returns 400, and the show header never reads `Sync needs attention` while online.
- Cross-role fact held: after the secretary's `Check in` on the dog's row in People at show, SQL reads `check_in_status = 'checked-in'` within 5 s, and the judge's at-show list reads `Checked in` on the dog's card.
- Cross-role fact held: after the judge's `Confirm & Submit` online, the panel reads `Score saved` within 10 s, and SQL reads `is_scored = true`, `result_status = qualified`, `search_time_seconds` equal to the typed time, and `check_in_status = completed`.
- Cross-role fact held: an offline `Correct this score` → Save → `Confirm & Submit` reads `Saved on this device. It will send when you're back online.`, and SQL keeps the online time and version while offline. Within 10 s of reconnect, SQL holds the offline time, `version` has risen by exactly 2, and the network log shows exactly two more `ringside_update_entry` 200s and no 409 / 40001.
- Cross-role fact held: the exhibitor's show page row reads `9:00 AM · Trial N · Judge Pat Donovan` and `Q · <m:ss.cc> · preliminary`. My Entries reads `Q preliminary <ss.s>s`, at-show reads `Q <ss.s>s preliminary`, and the dog page's Recent results reads `<m:ss.cc> preliminary Q`. All four agree with SQL.
- Cross-role fact held: armband `202` reads the same for the secretary (Can change class, People at show, entry form), the judge (card, scoresheet) and the exhibitor (My Entries, show page, at-show).
- Cross-role fact held: the judge dashboard Today card names the show, the trial and the date (MYK9-1342 guard), and People at show prints class times as `9:00 AM` (MYK9-1341 guard).
- Cross-role fact held: after the secretary pulls the entry, the exhibitor's My Entries card reads `Pulled`, and no `Q` or time appears on that card.
- Cross-role fact held: Willow's and Cooper's rows keep `version = 1`, `check_in_status = 'no-status'` and `is_scored = false` through the whole chain.

## Prompt corrections section

Applied below the `# Part 2` line in this commit (`docs/qa/walks/show-day-walk.md`):

1. The fixture: a same-day restore can create a fresh fixture, making today its Trial 1, and the Today tab then shows one card.
2. Routes: People at show rows read `Trial N - 9:00 AM` (MYK9-1341). Today cards name show, trial and date (MYK9-1342), but the URL check stays.
3. Adding the entry: the Payment step opens with `Secretary Payment (Already Received)` pressed, so `Check (pay at show)` must be clicked. Confirmation `MK9-000320` recorded.
4. New bullet, "Choosing the surface": production sign-in is refused in a scheduled run; when `origin/main` carries an unapplied migration, walk the deployed commit locally. It gives the exact rebuild commands (the `pnpm -r --filter` trap), the mixed-build crash and the `$VAR` script-path refusal.

Listed only, for a human to apply through a reviewed PR (above the `# Part 2` line):

- **Preconditions → Surface** assumes the deployed bundle can be walked. In an unattended scheduled run, signing in on `myk9show.com` is refused by the auto-mode classifier ("Production Reads"), so the walk cannot use that surface without a permission rule. Either add the rule or say "a local dev server at the deployed commit" outright.
- **Preconditions → Surface / Isolation** says the worktree is cut from `origin/main` and treats a local `origin/main` server as equivalent to the deployed bundle. That is false whenever `origin/main` is ahead of the applied schema (this run, S5). Part 1 could tell the walker to compare `origin/main`'s migration files with `schema_migrations` before choosing.

## Not verified

- The deployed bundle at `myk9show.com` itself: sign-in was refused, so I walked a local build of the same commit.
- `origin/main`'s undeployed ringside commits (`1e863d802`, `90642fdf4`, `c666223db`, `45c90a422`): they cannot run against the current schema, so nothing past the secretary's first pages was walked on them.
- Secretary surfaces after the judge's score, beyond the entry form (focused class scored count, Results tab).
- The exhibitor's show page, dog page and at-show list after the pull (only My Entries was re-read).
- The `Remove entry` dialog for a scored entry (not opened; I took Pull directly).
- The move-up path (MYK9-639 / MYK9-640).
