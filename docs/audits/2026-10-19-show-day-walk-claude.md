# Show-day walk, 2026-10-19 (Claude)

- Run token: 2026-10-19 0315 (America/Chicago; entry created 08:15Z)
- Prompt version (`origin/main`): `67032e1ce4f8f7aa4b6020c52d1496466ca1d58d`. This report's worktree is cut from the same commit.
- Prior show-day walk baseline: `2026-10-14-show-day-walk-claude.md`, prompt version `3ce11fc03`. 113 commits since that touch `apps/myk9show/src`, `packages` or `supabase/migrations` (`git log --oneline 3ce11fc03..67032e1ce -- apps/myk9show/src packages supabase/migrations`). I walked the flows those commits touch (check-in, scoring, offline queue, entry form, exhibitor surfaces). I did not exercise each commit one by one. Notable commits in range: `7a7505f76` (integer-ms search times), `84d537dfa` (m:ss.cc rounding), `43b3912ad` (class sheets from Overview), `2281cfa3f` (Q result grid), `f9add37f3` (hand-completed class placement).
- Surface: the deployed bundle at https://myk9show.com. I did not look up which commit that bundle was built from (the latest Deploy myK9Show run summary), so treat the bundle commit as unverified. The bundle shares the staging database.
- Fixture restore (psql, one call): `{"today": "2026-10-19", "created": false, "show_id": "dededede-0000-0000-0731-47330ec0b729"}`. The 2026-10-14 fixture still covers today, so nothing was written.
- Today's class: `dededede-0000-0000-0731-4125cbd0f557` (Container Novice A, trial `dededede-0000-0000-0731-bc9d7ad7ffa3`, Trial 6, 2026-10-19, 09:00, upcoming). The precondition query returned one row. Ranger entries in the class before the walk: 0.
- **WALK ENTRY e120011e-5a4f-4d87-b3bf-9e6f3ae6a814** (Ranger, armband 202, run 3, handler exhibitor@, Check (pay at show), $35 unpaid, `is_day_of_show = true`, confirmation **MK9-000297**). The confirmation number repeats the one from the 2026-10-14 walk because Ranger's enrollment on this show already exists. That is the documented behaviour.
- **Teardown: Pull.** Delete was not offered (the entry is scored). I pulled it from its per-class status chip (Accepted → Pull, no confirm dialog). The entry stays live with `deleted_at` null: `entry_status = scratched`, `check_in_status = pulled`, `is_scored = true`, qualified, 58 s, version 9. Declared residue. It sits on seeded dog Ranger with nothing paid, so the next reseed removes it.
- Residue from the 2026-10-14 walk (entry `74e96d34-f023-41c3-81a9-2e9f2f5af852`, Oct 14 Trial 1) is still live, pulled, qualified, 58 s. Not touched in this run.
- Willow and Cooper at teardown equal their start values: `no-status`, not scored, `pending`, run 1 and 2, armband 200 and 201, version 1, `updated_at` 2026-10-14 19:33:57.917 UTC. Nothing else in the class changed.

## Result

The secretary → judge → exhibitor chain held on every fact the walk checks, including the offline cycle. One new P2 finding (S1): the exhibitor still sees a result on a pulled entry. No P0/P1.

## Cross-role fact table

| Fact | SQL | Secretary saw | Judge saw | Exhibitor saw (each surface) | Agree? |
| ---- | --- | ------------- | --------- | ---------------------------- | ------ |
| Judge name | Pat Donovan (class-level assignment) | Focused class "1 of 3 scored · Judge Pat Donovan" | Scoresheet "Container Novice A · Judge Pat Donovan" | Show page schedule "9:00 AM · Trial 6 · Judge Pat Donovan" | yes where shown |
| Class start | 09:00:00 | Focused class "09:00" | Class header "Mon, Oct 19, 2026 · Trial 6" with "09:00" implied by the at-show list | Show page "9:00 AM"; at-show "Scheduled 9:00 AM" | yes |
| Check-in state | checked-in (v3), then in-ring (v4), completed (v6, then v8), pulled (v9) | People at show "Checked in 1 entry" status line; row "Checked in" | Dashboard and class list "Checked in" before scoring | At-show "Completed"; show page "Done · Completed"; My Entries card "Scored" before the pull, "Pulled" after | yes until the pull (see S1) |
| Armband | 202 | "#202 Ranger" on the Can change class list | "202" on the card and scoresheet | 202 on My Entries, show page, at-show | yes |
| Running-order position | run_order = 3 | Third in the Can change class list (#200, #201, #202) | Third in the class list | Not shown as a position on My Entries, show page or at-show (completed dogs show their state; MYK9-992 owner decision) | yes |
| Result | qualified | Not shown (Results 0; class not completed) | "Qualified" on the confirmation panel | "Q preliminary" on the at-show row, dog page, show page and the class's Completed tab. My Entries shows "Q preliminary 58.0s" on both Ranger rows before the pull and still after it (S1) | yes before the pull; S1 after |
| Search time | 65 s, then 58 s | Not shown | 1:05.00 online, then 0:58.00 offline, Score saved | 58.0s (My Entries, at-show), 0:58.00 (dog page, show page) | yes (final 58 s) |
| Faults | 0 | Not shown | Scoresheet "Faults Count" 0 | Not shown on any surface. Correct for 0 faults (owner decision, #2923) | yes (by design) |

## SQL row after each step

Entry `e120011e-5a4f-4d87-b3bf-9e6f3ae6a814` (Ranger), except where noted.

| Step | check_in_status | is_scored | result_status | search_time_s | faults | run_order | armband | version | entry_status |
| ---- | --------------- | --------- | ------------- | ------------- | ------ | --------- | ------- | ------- | ------------ |
| Secretary adds mail-in entry | no-status | false | pending | 0 | 0 | 3 | 202 | 2 | confirmed |
| Secretary checks in | checked-in | false | pending | 0 | 0 | 3 | 202 | 3 | confirmed |
| Judge saves online (1:05), before Confirm | in-ring | false | pending | 0 | 0 | 3 | 202 | 4 | confirmed |
| Judge clicks Confirm & Submit (online) | completed | true | qualified | 65 | 0 | 3 | 202 | 6 | confirmed |
| Offline edit to 0:58 held on device | completed | true | qualified | 65 (still online value) | 0 | 3 | 202 | 6 | confirmed |
| After reconnect, queue flushed | completed | true | qualified | 58 | 0 | 3 | 202 | 8 | confirmed |
| Secretary pulls | pulled | true | qualified | 58 | 0 | 3 | 202 | 9 | scratched |

Willow and Cooper were read at the start and at teardown; both unchanged (see above).

## Offline cycle and request log

- Judge session (`context.setOffline(true)` through `playwright-cli run-code`). The score sheet opened the prefilled form via `Correct this score`. The offline Save read `Saved on this device. It will send when you're back online.`. SQL held the online value (65 s, v6) while offline, so the edit did not bypass the queue.
- While offline, the background calls failed with `ERR_INTERNET_DISCONNECTED`: `classes`, `view_authenticated_entry_results_replication`, and `rpc/ringside_claim_generation_current` (2 calls). No scoring write was attempted while offline, so the `FAILED` rows are not scoring retries.
- After `setOffline(false)`: `rpc/ringside_update_entry` returned 200 twice. The label read `Score saved` within 5 s of reconnect. SQL reached the offline value (58 s, v8) on the first poll.
- Across the whole judge session the log holds five `ringside_update_entry` calls, all 200. Zero 409 or 40001 responses. No request still retried after the indicator cleared.
- Version increments: +2 for the offline cycle (two accepted writes: score and completion transition). This matches the existing mechanic note about two writes per submission.
- The request log is a session-wide file, and I did not split it by phase. The counts above are from the whole file.

## Findings

### S1 (new, P2): exhibitor still sees "Q preliminary 58.0s" on a pulled entry

- Role and route: exhibitor, `/exhibitor/entries`. Object: Ranger's entry `e120011e…`, Mon Oct 19, Trial 6, and the residue on Wed Oct 14, Trial 1.
- Observed after the secretary pulled the entry: the card header reads **Pulled**, but both Ranger class rows still read `Q preliminary 58.0s`. The secretary sees **Pulled** on the same rows.
- SQL: `entry_status = scratched`, `check_in_status = pulled`, `is_scored = true`, `result_status = qualified`, 58 s, version 9.
- Severity: P2. A withdrawn entry shows a result. No money or scoring is affected.
- Linear: **MYK9-1258**, under parent **MYK9-1257** (`Show-day walk 2026-10-19 — P2/P3 findings`). Dedupe with `includeArchived: true` found no open issue for this symptom.

## Things checked and found correct

- The entry form, the cart and `Submit — bring check to show` worked as the Known mechanics describe.
- Check-in: `Check in 3 entries` opens People at show; the `Check in` on Ranger's Trial 6 row checked her in and left Willow and Cooper alone.
- The judge's `Score Ranger` button is screen-reader-only and intercepted. Opening the card works (the Known mechanics say so).
- Offline copy and sync copy matched the Known mechanics.

## Canary candidates section

- Cross-role fact held: after the judge's online score is confirmed, the secretary's focused class reads `1 of 3 scored · Judge Pat Donovan`, and the exhibitor's show schedule reads `9:00 AM · Trial 6 · Judge Pat Donovan`.
- Cross-role fact held: the secretary's check-in leaves the exhibitor's at-show row `Completed` and the judge's list `Checked in` before scoring.
- Cross-role fact held: armband 202 reads the same on the secretary, judge and exhibitor surfaces.
- Cross-role fact held: the offline edit keeps the online value in SQL until reconnect, then the offline value is written. The judge sees `Score saved` within a few seconds of reconnect.
- For S1 (P2, not P0/P1): exhibitor's My Entries shows a pulled dog's row with `Q` and a time, and the header `Pulled` on the same card. Assert that no `Q preliminary` text appears on a card whose header reads `Pulled`.

## Prompt corrections section

Applied below the `# Part 2` line in this commit (`docs/qa/walks/show-day-walk.md`):

1. The Adding-the-entry bullet said Ranger's handler is Casey Morgan. On this run the exhibitor row read `Mary Smith · also entered as Casey Morgan`, and the judge scoresheet read `Handler: Mary Smith`. Corrected.
2. The score-submission bullet did not say that an online score needs `Confirm & Submit` on the Score Confirmation panel after Save. The row is only written after Confirm. Added.

Nothing above the `# Part 2` line was changed.

## Not verified

- The bundle commit at myk9show.com (no Deploy run summary was checked).
- The exhibitor's schedule and My Entries after the pull (only the card header and rows were read once, before the pull and right after it).
- The secretary's view after the judge's score (checked once, at the focused class; the per-dog row was not read).
