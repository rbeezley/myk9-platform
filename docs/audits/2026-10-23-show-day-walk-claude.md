# Show-day walk, 2026-10-23 (Claude)

- Run token: 2026-10-23 0315 (America/Chicago; entry created 08:18:30Z, pulled 08:32:22Z)
- Prompt version (`origin/main`): `f20731987a349cd447e636601e15b5256f02167b`. This report's worktree is cut from the same commit.
- Prior show-day walk baseline: `2026-10-19-show-day-walk-claude.md`, prompt version `67032e1ce`. 90 commits since then touch `apps/myk9show/src`, `packages` or `supabase/migrations` (`git log --oneline 67032e1ce..f20731987 -- apps/myk9show/src packages supabase/migrations`). I walked the flows those commits touch and did not exercise each commit one by one. Commits in range that bear on this chain: `d19225ec2` / `e76231525` / `70cf347ae` (Tools button removed; show tools in the Actions menu, each a `?tool=` panel), `c26d8a2b5` (MYK9-1258, pulled entry shows "Pulled"), `ca1af9bef` / `855009bd3` / `e26b5b230` (judge assignment written onto the class row; change judge from the panel), `d98107fe0` / `87d7ebc07` (armbands `updated_at`, delta sync), `3331ce020` / `2fbd98f11` / `9ffd751a1` / `b31c565cb` (replication pass cadence), `e0f51f39c` (RBAC refresh on focus/reconnect), `49b2b0639` / `af9504d1a` / `aaf042aa3` (seed fixtures and reseed), `8c7b828a8` (entry views rebuilt without `promo_code_id`), `7c88ab310` (one release path on the class), `82555782e` (Enter / Entry wording).
- Surface: the deployed bundle at https://myk9show.com, built from `e26b5b230a3614b1194d2d47f04533eecf682b6f` by Deploy myK9Show run 39878806982 (2026-10-23T00:33Z, success, both jobs green). `origin/main` is three docs-only commits ahead of that build (`3a6990140`, `4c9bbc71c`, `f20731987`), so the bundle carries the same app code as `origin/main`. The bundle shares the staging database.
- Fixture restore (psql, one call): `{"today": "2026-10-23", "created": false, "show_id": "dededede-0000-0000-0731-307ddfd5dde6"}`. A fixture created 2026-10-23 01:10Z (Oct 22–28) already covers today, so nothing was written.
- Today's class: `dededede-0000-0000-0731-a6a0b6db874c` (Container Novice A, trial `dededede-0000-0000-0731-1206a539c759`, Trial 2, 2026-10-23, 09:00, upcoming). The precondition query returned one row. Ranger entries in the class before the walk: 0.
- **WALK ENTRY b3368b88-97ed-46f9-aa1e-d9cfb62c670a** (Ranger, armband 202, run 3, handler Mary Smith = `exhibitor@`, Check (pay at show), $35 unpaid, `is_day_of_show = true`, confirmation **MK9-000311**).
- **Teardown: Pull.** Delete is not offered for a scored entry, so I pulled it from its per-class status chip (`Accepted` → `Pull`, applied at once). The entry stays live with `deleted_at` null: `entry_status = scratched`, `check_in_status = pulled`, `withdrawn_at` set, `is_scored = true`, qualified, 55 s, version 9. Declared residue. It sits on seeded dog Ranger with nothing paid, so the next reseed removes it.
- Willow and Cooper at teardown equal their start values: `confirmed`, `no-status`, not scored, `pending`, 0 s, 0 faults, run 1 and 2, armband 200 and 201, version 1, `updated_at` 2026-10-23 01:10:09.311 UTC. Nothing else in the class changed.
- Browser sessions: `sdw-20261023-secretary`, `sdw-20261023-judge`, `sdw-20261023-exhibitor` (playwright-cli, one per role, each its own context); all three closed, `playwright-cli list` shows none of them.

## Result

The secretary → judge → exhibitor chain held on every fact the walk checks, including the offline cycle. No P0/P1. The prior walk's S1 (MYK9-1258) is resolved. Two new P3 findings (S2, S3) filed under MYK9-1340, and one recurrence commented on MYK9-1281.

## Cross-role fact table

| Fact                   | SQL                                                                | Secretary saw                                                                                                                                 | Judge saw                                                             | Exhibitor saw (each surface)                                                                                                                                       | Agree?                                     |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Judge name             | Pat Donovan (`judge_assignments.person_id b0728006…`, class-level) | Schedule row `Pat Donovan · 3 entered`; focused class `Judge: Pat Donovan`                                                                    | Scoresheet and confirmation `Container Novice A · Judge Pat Donovan`  | Show page `9:00 AM · Trial 2 · Judge Pat Donovan` (schedule row and Willow's list). Not shown on My Entries, the dog page or the at-show row                       | yes where shown                            |
| Class start time       | `09:00:00`                                                         | Schedule `9:00 AM`; focused class `Expected start 09:00`; People at show `Trial 2 - 09:00:00` (S2)                                            | Dashboard card `09:00 AM`; class header `Fri, Oct 23, 2026 • Trial 2` | Show page `9:00 AM`; at-show `Scheduled 9:00 AM`; My Entries `First class 9:00 AM`                                                                                 | yes (format differs on People at show, S2) |
| Check-in state         | checked-in (v3) → in-ring (v4) → completed (v6, v8) → pulled (v9)  | People at show `Checked-in`, status line `Checked in 1 entry for Mary Smith.`; Needs attention fell from `Check in 3 entries` to `Check in 2` | Entry list `Checked in` on #202 before scoring; Completed tab after   | Show page `Done · Completed`; at-show `Completed`; My Entries `Scored`, then `Pulled` after the pull                                                               | yes                                        |
| Armband                | 202                                                                | `#202 Ranger` on Can change class; `202` on People at show and the entry form                                                                 | `202` on the card, scoresheet and confirmation                        | `202` on My Entries, show page (`Armband 202`), at-show (`#202`)                                                                                                   | yes                                        |
| Running-order position | `run_order = 3`                                                    | Third in Can change class (#200, #201, #202)                                                                                                  | Third in the list (Up next #200, Then #201, #202)                     | Not shown as a position; completed dogs show their state (owner decision MYK9-992). Willow's row reads `Next up`                                                   | yes (by design)                            |
| Result                 | qualified                                                          | Not shown (Results tab 0; class not completed)                                                                                                | `Qualified` on the confirmation; `Q` on the Completed tab             | `Q preliminary` on My Entries; `Q · 0:55.00 · preliminary` on the show page; `Q 55.0s preliminary` at-show; `Q … preliminary` under Recent results on the dog page | yes                                        |
| Search time            | 72 s (online), then 55 s (offline edit)                            | Not shown                                                                                                                                     | `1:12.00` online, `0:55.00` offline; Completed tab `00:55.00`         | `55.0s` (My Entries, at-show), `0:55.00` (show page, dog page)                                                                                                     | yes (final 55 s)                           |
| Faults                 | 0                                                                  | Not shown                                                                                                                                     | `Faults Count 0` on the scoresheet                                    | Not shown on any surface. Correct for 0 faults (owner decision, #2923)                                                                                             | yes (by design)                            |

## SQL row after each step

Entry `b3368b88-97ed-46f9-aa1e-d9cfb62c670a` (Ranger).

| Step                                         | check_in_status | is_scored | result_status | search_time_s | faults | run_order | armband | version | entry_status | updated_at (UTC) |
| -------------------------------------------- | --------------- | --------- | ------------- | ------------- | ------ | --------- | ------- | ------- | ------------ | ---------------- |
| Secretary adds mail-in entry                 | no-status       | false     | pending       | 0             | 0      | 3         | 202     | 2       | confirmed    | 08:18:31.400     |
| Secretary checks in (People at show)         | checked-in      | false     | pending       | 0             | 0      | 3         | 202     | 3       | confirmed    | 08:20:16.488     |
| Judge opens the scoresheet                   | in-ring         | false     | pending       | 0             | 0      | 3         | 202     | 4       | confirmed    | 08:23:48.796     |
| Judge Confirm & Submit (online, 1:12.00)     | completed       | true      | qualified     | 72            | 0      | 3         | 202     | 6       | confirmed    | 08:24:55.151     |
| Offline edit to 0:55.00, confirmed on device | completed       | true      | qualified     | 72 (online)   | 0      | 3         | 202     | 6       | confirmed    | 08:24:55.151     |
| After reconnect, queue flushed               | completed       | true      | qualified     | 55            | 0      | 3         | 202     | 8       | confirmed    | 08:27:06.946     |
| Secretary pulls                              | pulled          | true      | qualified     | 55            | 0      | 3         | 202     | 9       | scratched    | 08:32:22.340     |

Willow (`…5cd58155e88b`) and Cooper (`…d2dbf34d72be`) were read at the start, after check-in, after the online score, after the flush and at teardown; every read returned version 1, `no-status`, not scored, `updated_at` 01:10:09.311.

## Offline cycle and request log

Judge session, `context.setOffline(true)` through `playwright-cli run-code`, then `Correct this score` → Save → `Confirm & Submit` while offline. The playwright-cli network log carries request order and status but no clock, so times below come from SQL `updated_at` and the console log's offsets.

| #   | Method | Endpoint                                                                              | Status                                  | When                                                            | What it wrote                          |
| --- | ------ | ------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------- | -------------------------------------- |
| 1   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                  | 200                                     | 08:23:48Z, scoresheet opened                                    | `in-ring` (v4)                         |
| 2   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                  | 200                                     | 08:24:54Z, Confirm & Submit online                              | score: qualified, 72 s, 0 faults (v5)  |
| 3   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                  | 200                                     | 08:24:55Z                                                       | `completed` (v6)                       |
| –   | GET    | `/rest/v1/classes?…` ×8, `/rest/v1/view_authenticated_entry_results_replication?…` ×8 | FAILED `net::ERR_INTERNET_DISCONNECTED` | 08:25:0x–08:27:0xZ, offline, backoff 1 s / 2 s / 4 s then ~10 s | background replication pulls, no write |
| –   | POST   | `/rest/v1/rpc/ringside_claim_generation_current` ×6                                   | FAILED `net::ERR_INTERNET_DISCONNECTED` | offline                                                         | claim heartbeat, no write              |
| –   | WS     | `/realtime/v1/websocket`                                                              | 7 connection failures (console)         | offline                                                         | realtime reconnect attempts            |
| 4   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                  | 200                                     | 08:27:06Z, after `setOffline(false)`                            | score: qualified, 55 s, 0 faults (v7)  |
| 5   | POST   | `/rest/v1/rpc/ringside_update_entry`                                                  | 200                                     | 08:27:06Z                                                       | `completed` (v8)                       |

- No scoring write was attempted while offline: SQL held 72 s / v6 through the offline Save and Confirm, so the edit did not bypass the queue.
- The offline confirmation read `Saved on this device. It will send when you're back online.`, with a foot banner `No internet connection · Changes will be saved locally and synced when connection is restored.` and a `Retry` button.
- After reconnect the label read `Score saved` within 8 s, and SQL held 55 s / v8 on the first poll.
- Whole judge session: 574 requests, 552 × 200, 1 × 201 (`analytics_events`), 22 × FAILED (all while offline, none a scoring write). Five `ringside_update_entry` calls, all 200. Zero 409 / 40001 / 4xx / 5xx. No request still retried after the indicator cleared (the only later RPC is one routine `ringside_claim_generation_current`, 200).
- Version increments: +2 for the online submission and +2 for the offline flush (score, then the `completed` transition), matching the two-writes-per-submission mechanic. Still exactly one Ranger entry in the class.

## Findings

### S1 (resolved, was P2): exhibitor still saw "Q preliminary 58.0s" on a pulled entry

- Filed 2026-10-19 as MYK9-1258; fixed by `c26d8a2b5` (merged 2026-10-20, in the deployed bundle).
- Re-walked after the pull: the exhibitor's My Entries card reads `Pulled` and the class row `Container Novice A · Fri, Oct 23 · Trial 2 · pulled`, with no `Q` and no time. The at-show `Your dogs today` list drops Ranger and keeps Willow. `You owe` fell from $125.00 to $90.00, the pulled unpaid $35 removed. Holds.

### S2 (new, P3): People at show prints a class's start time as raw `09:00:00`

- Role and route: secretary, `/shows/<show>?tool=people-at-show&view=needs-check-in`, the exhibitor row's class rows.
- Observed: `Container Novice A · Trial 2 - 09:00:00` (and `Trial 1 - 09:00:00` and so on for every day), while the schedule, the focused class and every exhibitor surface read `9:00 AM` or `09:00`.
- SQL: `classes.start_time = '09:00:00'`.
- Severity P3, cosmetic. Dedupe (`includeArchived: true`, "People at show", "09:00:00"): MYK9-1172 and MYK9-1193 cover ordering and missing times, not this format.
- Linear: **MYK9-1341**, under parent **MYK9-1340**.

### S3 (new, P3): judge dashboard Today cards name neither show nor trial day

- Role and route: judge, `/judge/dashboard`, Judging Assignments → Today.
- Observed: four cards, each `Container Novice A · 09:00 AM · Not started · Start Judging`; one `0/3 entries`, three `0/0 entries`. Nothing on a card names the show, the trial or the date, so only SQL told which card was the live class. The at-show header the card opens does carry `Fri, Oct 23, 2026 • Trial 2`.
- SQL: four published `Heartland Scent Work Week` shows have a trial dated today with a class-level assignment for this judge (`…307ddfd5dde6` with 3 entries; `…e22836daad53`, `…11072ba2b3e4`, `…7c93da8be416` with 0).
- Severity P3 here; P2 for a real judge working two trials in one day. Dedupe ("judge dashboard", "Start Judging", `includeArchived: true`): MYK9-1167, MYK9-1166, MYK9-143 are Done and do not cover the card label.
- Linear: **MYK9-1342**, under parent **MYK9-1340**.

### S4 (recurrence of MYK9-1281, not filed anew): three emptied show-day fixtures stay published beside the live one

- SQL: shows `…11072ba2b3e4` (created 2026-10-20 22:43Z, Oct 20–26), `…e22836daad53` (2026-10-22 16:13Z, Oct 22–28) and `…7c93da8be416` (2026-10-23 00:30Z, Oct 22–28) are `published`, have 7 trials and 7 judge assignments each, and 0 entries. `seed_demo_restore_show_day_fixture()` inserts Willow and Cooper into every class it creates, so these were emptied after creation (a reseed's demo-dog reset or a load-rehearsal packet clear fits), and the next restore created a fresh fixture beside them.
- Effect: S3's four cards; four same-named shows on signed-in Find Shows. MYK9-1281's acceptance criterion "No two seeded shows share a name and a date" does not hold.
- Commented on **MYK9-1281** (Done) with the table above rather than filing a duplicate. Staging hygiene, not a bug in the chain.

## Open issues re-verified

- **MYK9-494** (Done): judge name rendered on every exhibitor schedule row (`Judge Pat Donovan`), and on the secretary's schedule row and focused class. Holds.
- **MYK9-637** (Done): the judge dashboard read `0/3 entries` for the live class and the at-show list `Pending 3`; the `0/0` cards belong to classes that really hold 0 entries (S4). Holds.
- **MYK9-639** (In Progress) / **MYK9-640** (Done): no move-up in this walk; the check-in survived the whole chain (`checked-in` → `in-ring` → `completed`), nothing dropped it. No fresh evidence either way on the move-up itself.
- **MYK9-740** (Done): five scoring RPCs, all 200, two after the reconnect, no conflict and no replay. Holds.
- **MYK9-1258** (Done): see S1. Holds.

## Things checked and found correct

- The judge account renders as `Pat, Judge` (judge-only; MYK9-141 holds).
- Day-of entry on today's trial was accepted (`is_day_of_show = true`, $35 day-of fee) even though the exhibitor's show page says `Entries closed on 10/19/2026` (MYK9-642 mechanic).
- The Add Entry wizard: dog search returns one `Ranger`; the class step lists all seven trials with weekday and date; `Trial 2 · Friday, Oct 23` is today; Handlers prefilled `Mary Smith · Owner`; `Check (pay at show)` plus the AKC agreement box enable `Submit — bring check to show`; receipt `Entry submitted.`, `Confirmation # MK9-000311`, `Total · Fees due $35.00`.
- Armband 202 and run order 3 assigned at creation (MYK9-1048 holds).
- People at show: `Check in` on Ranger's Trial 2 row checked in one entry; Willow's row for the same trial still read `Not checked in`, other days `Not today`.
- The judge list's `Score Ranger` button is screen-reader-only; the card click opens the scoresheet (mechanic holds). Opening it set `in-ring`.
- Exhibitor cold replica (fresh context) showed the scored entry on all four surfaces on first load, with `preliminary` labels and no fault count (0 faults, by design) and no placement (class not completed, by design).
- Offline and online copy matched the Known mechanics (`Saved on this device. It will send when you're back online.` offline; `Score saved` after reconnect).
- Pull from the status chip applied at once with no confirm dialog; the chip then read `Pulled · refund at the club's discretion`.

## Not filed (noted only)

- The judge dashboard and the exhibitor's My Shows greet with `Good evening` at 03:22 local time. Trivial; a human can decide whether a small-hours greeting matters.
- The judge's entry list shows Willow's handler as `Casey Morgan` while the secretary sees `Mary Smith · Also entered as Casey Morgan`: seed data (`entries.handler` free text vs. `handler_id`), known from the 2026-10-19 walk.
- The `EnterWorktree` bootstrap hook did not run (no `node_modules`, no `.env` in the worktree); harness, recorded in Part 2.

## Canary candidates section

- Cross-role fact held: after the secretary's `Check in` on the dog's row in People at show, SQL `check_in_status = 'checked-in'` within 5 s and the judge's at-show list reads `Checked in` on `#202`.
- Cross-role fact held: after the judge's `Confirm & Submit` online, the panel reads `Score saved` and SQL reads `is_scored = true`, `result_status = qualified`, `search_time_seconds` equal to the typed time, `check_in_status = completed`, within 10 s.
- Cross-role fact held: an offline `Correct this score` → Save → `Confirm & Submit` reads `Saved on this device. It will send when you're back online.`, SQL keeps the online time and version while offline, and within 10 s of reconnect the panel reads `Score saved`, SQL holds the offline time, `version` rose by exactly 2, and the network log shows exactly two more `ringside_update_entry` 200s and no 409 / 40001.
- Cross-role fact held: the exhibitor's show page row reads `9:00 AM · Trial N · Judge Pat Donovan` and `Q · <m:ss.cc> · preliminary`; My Entries reads `Q preliminary <ss.s>s`; at-show reads `Q <ss.s>s preliminary`; the dog page's Recent results reads `<m:ss.cc> preliminary Q`; all four agree with SQL.
- Cross-role fact held: armband `202` reads the same on the secretary (Can change class, People at show, entry form), the judge (card, scoresheet, confirmation) and the exhibitor (My Entries, show page, at-show).
- Cross-role fact held (S1 regression guard): after the secretary pulls the entry, the exhibitor's My Entries card reads `Pulled`, its class row reads `pulled`, no `Q` or time appears on that card, and `You owe` drops by the pulled entry's unpaid fee.
- Cross-role fact held: Willow's and Cooper's rows keep `version = 1`, `check_in_status = 'no-status'`, `is_scored = false` through the whole chain.

## Prompt corrections section

Applied below the `# Part 2` line in this commit (`docs/qa/walks/show-day-walk.md`):

1. Routes: the Tools button is gone (MYK9-1262); People at show is an Actions-menu tool at `?tool=people-at-show`, and the Needs attention `Check in N entries` link opens it with `&view=needs-check-in`. The check-in path, row labels and status line are rewritten from this run. Added the judge-dashboard card ambiguity (S3) and the advice to check the class id in the URL.
2. The fixture: several fixtures can cover today at once (S4); only the restore's `show_id` identifies today's class.
3. Score submission: the offline `Correct this score` edit also takes Save then `Confirm & Submit`; version steps 4 / 6 / 8 recorded.
4. Adding the entry: a brand-new fixture gives a new confirmation number; the Handlers and receipt steps' copy and the created row's fields recorded.
5. Teardown: the chip menu's items, the post-pull chip text, the exhibitor's post-pull My Entries, owed total and at-show list (MYK9-1258 fixed).
6. Running the restore: the worktree guard also refuses heredocs and `&&` chains; the bootstrap hook did not run; how to recover.
7. Offline: the `navigator` ReferenceError in `run-code`, the offline banner copy, the background retry pattern, and the 8-second `Score saved` after reconnect.

Nothing above the `# Part 2` line was changed. Nothing in Part 1 was found stale.

## Not verified

- Secretary surfaces after the judge's score beyond the entry form (the focused class's `N of 3 scored` line and the Results tab were not re-read after scoring).
- The exhibitor's show page and dog page after the pull (only My Entries and at-show were re-read).
- The `Remove entry` dialog's wording for a scored entry (not opened; Pull was taken directly).
- The move-up path (MYK9-639 / MYK9-640) was not exercised.
