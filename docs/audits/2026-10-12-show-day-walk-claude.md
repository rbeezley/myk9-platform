# Show-day walk, 2026-10-12 (Claude)

- Prompt version (`origin/main`): `4ea223bc69d7646cc6cfbda653c88ec502b0e4fd` (also the worktree base)
- Run token: 2026-10-12 0313 (America/Chicago; entry created 08:15:31Z)
- Prior show-day walk baseline: `2026-10-06-show-day-walk-claude.md`, base `3d11bfc6a`. 115 commits since touch `apps/myk9show/src`, `packages` or `supabase/migrations`. Walked first: #2818 (online entries get the next run order, MYK9-1048), #2824 (place in line, MYK9-992), #2879/#2885/#2895/#2902 (at-show entry list redesign, combined A/B, run-ordered dogs today), #2894/#2907/#2908 (max time), #2827/#2834 (synced entry takes server row; pending-flag repair), #2794 (MYK9-1026).
- Surface: deployed bundle at https://myk9show.com, built from `49692674c` (Deploy myK9Show run 38190810620, 2026-10-12 01:09Z). The only commit between it and `origin/main` is #2915 (Quick Create slide-out, MYK9-1081), which the walk's "Add entry for someone else" path did not open. Shares the staging database.
- Show `dededede-0000-0000-0731-a4f2faa73124`, trial `dededede-0000-0000-0731-be50769e7966` (Trial 7, 2026-10-12), class `dededede-0000-0000-0731-e841257c00eb` (Container Novice A, 09:00, upcoming, 2 entries before the walk).
- Readiness: `public.seed_demo_show_day_fixture_today()` returns 42501 over MCP again; ran its body from `pg_get_functiondef` inline. One row. Ranger entries in the class before the walk: 0.
- **Fixture lapses after today**: 2026-10-12 is Trial 7 of 7. The next run finds zero rows unless the owner restores (`select public.seed_demo_restore_show_day_fixture();`).
- **WALK ENTRY 6e52d586-8323-474d-867c-ba2cc1814d74** (Ranger, #202, handler Casey Morgan = exhibitor@, Check (pay at show), $35 unpaid, `is_day_of_show = true`). It joined Ranger's existing enrollment `e4a1b468-…` from the 2026-10-06 walk, so the receipt reused confirmation **MK9-000259**.
- **Teardown**: Delete refused for a scored entry (dialog, Delete disabled; known). Pulled from the per-class status chip. **Residue**: entry `6e52d586-…` live (`deleted_at` null), `entry_status = scratched`, `check_in_status = pulled`, `is_scored = true`, qualified, 58 s, v9. Prior residue `edcd882f-…` (2026-10-06) also still live. Both sit on seeded dog Ranger with nothing paid, so the next reseed removes them. Willow and Cooper equal their start values (no-status, not scored, pending, run 1 / 2, armband 200 / 201, version 1, `updated_at` 2026-10-06 15:03:37Z).

## Result

The secretary → judge → exhibitor chain passed. Every fact the secretary and judge set reached the exhibitor and matched SQL. The offline → reconnect cycle passed: the edit was held locally, SQL kept the online value until reconnect, then took the offline value with exactly two version increments, zero conflict responses and nothing retrying. **No P0/P1.** Prior S4 (run order NULL), S5 (offline wording), S6 (blank correction form) and S7 (delete-dialog link) read as resolved. Prior S8 recurs. Five new P2/P3 findings (S9-S13), filed under parent MYK9-1105.

## Cross-role fact table

| Fact                   | SQL                                                           | Secretary saw                                                                        | Judge saw                                                                                                     | Exhibitor saw (each surface)                                                                                                                                                                             | Agree?          |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Judge name             | Pat Donovan (class-level assignment)                          | Show home focused class: "3 entries · Judge Pat Donovan"; schedule row "Pat Donovan" | Scoresheet header "Container Novice A · Judge Pat Donovan"; account "Pat, Judge" (judge-only, MYK9-141 holds) | Show page run schedule: "Trial 7 · Judge Pat Donovan". Not shown: My Entries row, dog page, at-show Your dogs today, class view                                                                          | yes where shown |
| Class start            | 09:00:00                                                      | Schedule "9:00 AM"; People at show "Trial 7 - 09:00:00" (raw)                        | Dashboard "09:00 AM"                                                                                          | My Entries: not shown (date only). Show page "9:00 AM". At-show "Scheduled 9:00 AM". Dog page: not shown                                                                                                 | yes             |
| Check-in               | checked-in (v3) → in-ring (v4) → completed (v6) → pulled (v9) | People at show "Checked-in"                                                          | List chip "Checked in" before scoring                                                                         | My Entries "Scored"; show page "Completed"; at-show "Completed"                                                                                                                                          | yes             |
| Armband                | 202                                                           | "#202 Ranger" (Can move up; People at show)                                          | "202" on card and scoresheet                                                                                  | 202 on My Entries, show page, at-show list                                                                                                                                                               | yes             |
| Running-order position | `run_order = 3`                                               | Third in Can move up (#200, #201, #202)                                              | Third in list (Up next Willow, Then Cooper, Ranger)                                                           | Class view list order (Willow next, Cooper, Ranger completed). Not shown as a position on My Entries, show page or at-show row (completed dogs show state, not position, by the MYK9-992 owner decision) | yes             |
| Result                 | qualified                                                     | Not shown (Results tab 0; class not completed)                                       | "Q" on confirmation and Completed tab                                                                         | Q on My Entries, dog page, show page, class Completed tab; **not** on at-show Your dogs today (S8)                                                                                                       | yes where shown |
| Search time            | 65 → 58                                                       | Not shown                                                                            | 1:05.00, then 0:58.00; Completed tab "00:58.00"                                                               | 58.0s (My Entries), 0:58.00 (dog page, show page), 00:58.00 (class view)                                                                                                                                 | yes (final 58)  |
| Faults                 | 0                                                             | Not shown                                                                            | Scoresheet "Faults Count 0"; not on Completed tab                                                             | **Not shown on any surface** (S11)                                                                                                                                                                       | not shown       |

## SQL row after each step

Columns: check_in_status, is_scored, result_status, search_time_seconds, total_faults, run_order, armband, version, updated_at.

1. After mail-in entry: no-status, false, pending, 0, 0, **3**, 202, v2, 08:15:33Z (entry_status confirmed, handler exhibitor@).
2. After secretary check-in (People at show → Casey Morgan → Check in on the Trial 7 #202 Ranger row only): checked-in, false, pending, 0, 0, 3, 202, v3, 08:16:57Z.
3. Judge opens the scoresheet: in-ring, v4 (08:18:45Z, from the request log; not read separately in SQL).
4. Judge online score, Qualified 1:05.00, 0 faults: completed, true, qualified, 65, 0, 3, 202, v6, 08:19:24Z.
5. Offline edit 0:58.00 confirmed (08:21:27Z): SQL unchanged, 65, v6. The queue held it.
6. Reconnect (08:21:38Z): completed, true, qualified, 58, 0, 3, 202, v8, 08:21:38.9Z. One Ranger entry in the class. Willow and Cooper unchanged.
7. Teardown Pull: scratched / pulled, true, qualified, 58, 0, 3, 202, v9, 08:26:50Z.

## Offline cycle request log

Captured with a `requestfinished`/`requestfailed` listener on the judge page, filtered to `rpc/ringside*` and `rest/v1/entries`.

| Time (UTC)   | Method | Endpoint                              | Status                            |
| ------------ | ------ | ------------------------------------- | --------------------------------- |
| 08:18:23.809 | POST   | rpc/ringside_claim_generation_current | 200                               |
| 08:18:45.102 | POST   | rpc/ringside_claim_generation_current | 200                               |
| 08:18:45.307 | POST   | rpc/ringside_update_entry (in-ring)   | 200                               |
| 08:19:15.091 | POST   | rpc/ringside_claim_generation_current | 200                               |
| 08:19:24.220 | POST   | rpc/ringside_update_entry (score)     | 200                               |
| 08:19:24.320 | POST   | rpc/ringside_update_entry (completed) | 200                               |
| 08:19:45.111 | POST   | rpc/ringside_claim_generation_current | 200                               |
| 08:19:45.696 | n/a    | setOffline(true)                      | n/a                               |
| 08:20:15.032 | POST   | rpc/ringside_claim_generation_current | failed, ERR_INTERNET_DISCONNECTED |
| 08:20:45.019 | POST   | rpc/ringside_claim_generation_current | failed, ERR_INTERNET_DISCONNECTED |
| 08:21:15.017 | POST   | rpc/ringside_claim_generation_current | failed, ERR_INTERNET_DISCONNECTED |
| 08:21:38.651 | n/a    | setOffline(false)                     | n/a                               |
| 08:21:38.876 | POST   | rpc/ringside_update_entry (score)     | 200                               |
| 08:21:38.999 | POST   | rpc/ringside_update_entry (completed) | 200                               |
| 08:21:45.128 | POST   | rpc/ringside_claim_generation_current | 200                               |

Zero conflict responses, no scoring request after the queue cleared: no OCC storm (MYK9-740 holds). While offline, non-scoring reads (`classes?select=…`, `view_authenticated_entry_results_replication`) retried every 2-4 s against the dead network (console). That is harmless to the server and relevant to S9.

## Findings

- **S9 · P2 · new · MYK9-1106.** Offline, "Correct this score" shows the "Loading scoresheet" skeleton for roughly 10-40 s before the (correctly prefilled) form appears. Still loading at 8 s, loaded by the next check about 30 s later. The judge sees only a skeleton with the ring waiting.
- **S10 · P3 · new · MYK9-1107.** Entry form detail shows two Ranger "Container Novice A" rows (Oct 6 pulled, Oct 12 accepted) with no trial or date; the destructive status and Remove controls live on these rows. The walk anchored on the Accepted chip after SQL proved the Pulled row was the 10-06 residue.
- **S11 · P3 · regressed · MYK9-1108.** Faults are not shown to the exhibitor anywhere; the 10-06 run saw "0 Faults" on the class Completed tab.
- **S12 · P3 · new · MYK9-1109.** Exhibitor show page labels past unrun days (Oct 8-11, Willow) "Next up · Not checked in" while My Entries says "not run".
- **S13 · P3 · new · MYK9-1110.** Offline confirmation string uses an em dash (`quickAdvancePanel.tsx:285`).
- **S8 · P3 · unchanged · MYK9-1026 (Done; commented).** At-show "Your dogs today" row still says only "Completed" for a scored dog whose Q and time four sibling exhibitor surfaces show. #2794 gates the row on released results, which is stricter than the siblings.
- **S4 · resolved (MYK9-868 / MYK9-1048).** The day-of mail-in entry got `run_order = 3` at creation.
- **S5 · resolved (MYK9-1023, In Review; evidence commented).** Offline: "Saved on this device — will send when you're back online"; it flips to "Score saved" after sync.
- **S6 · resolved (MYK9-1025).** "Correct this score" prefilled 1:05.00 / Qualified.
- **S7 · resolved (MYK9-1024).** The delete dialog's "Withdraw / Pull entries" link lands on `?queue=all&registration=<id>` with the entry visible.
- Open issues re-verified: MYK9-494 holds (judge named on exhibitor schedule rows); MYK9-637 holds (judge list showed all 3 entries); MYK9-740 holds (above); MYK9-639/640 not exercised (no move-up in this walk; Move up is offered on the focused class).

### Observations, not filed

- The new entry joined the dog's existing enrollment, so the receipt showed the 10-06 walk's confirmation number MK9-000259. Probably by design (one enrollment per dog per show); worth knowing when reading receipts.
- Pull from the status chip applies immediately with no confirm dialog (it is reversible from the same menu).
- My Entries shows a group headed "Unknown Show" (Willow, "paid $50.00 on Sep 30", dated Mon Oct 12). Not traced; outside this chain. Worth a look by the exhibitor walk.
- Willow's Oct 6 entry has sat at `check_in_status = in-ring` since another session on 2026-10-10, so her My Entries headline reads "In ring" today. Data residue, noted on MYK9-1109.
- The 10-06 walk's pulled Ranger entry still shows "Q preliminary 58.0s" to the exhibitor on My Entries. Same open question as last run: whether a pulled-but-scored result should be shown.
- People at show prints class times raw ("Trial 7 - 09:00:00") while the schedule beside it says "9:00 AM".
- Payment-step copy in the secretary's "Add entry for someone else" flow is exhibitor-voiced ("Please bring your check…", "Submit — bring check to show").
- The wizard's class step offers all seven trials, including the six past days.

## Canary candidates

- S9: offline, after a saved score, "Correct this score" shows the time field holding the saved value within 2 s.
- S10: on an entry form with the same class on two days, each entry row shows its own trial date.
- S11: after a score with faults > 0, the exhibitor's class Completed tab row shows the fault count.
- S12: on a multi-day show, a prior day's unscored entry on the exhibitor show page does not contain "Next up".
- S8: after scoring on an `open`-preset show, the exhibitor's at-show "Your dogs today" row for the dog contains "Q" and the time.
- Held: a secretary day-of mail-in entry gets a non-null run order and the next armband; after secretary check-in the judge's list shows the dog with "Checked in" and the same armband, in run order; the exhibitor show page run schedule for the scored dog reads `Judge Pat Donovan`, `9:00 AM`, armband, `Completed`, `Q · 0:58.00`; dog page Recent results shows today's run with `0:58.00` and `Q`; the offline confirmation contains "on this device" and SQL keeps the online value until reconnect, then holds the offline value after exactly two version increments, with no non-200 `ringside_update_entry`.

## Prompt corrections

- Part 1 (human edit via PR, not applied), carried over from 10-06 and still true: the readiness query calls `public.seed_demo_show_day_fixture_today()`, which the MCP role cannot execute (42501). Grant EXECUTE to the read role or document the inline form in Part 1. The teardown text should also say outright that delete is refused for a scored entry, so Pull is the expected path.
- Part 2 (applied in this commit): the readiness-function bullet now names this function; `/shows/:id/show-day` redirects to the show home with `?focus=`; the entry gets a run order at creation (MYK9-1048), not NULL; the confirmation can reuse the dog's existing enrollment; the submit button reads "Submit — bring check to show"; the judge's "Score <dog>" button is screen-reader-only, so open the scoresheet from the dog card; the delete-dialog link now lands on the entry form (MYK9-1024 fixed); Pull applies with no confirm; same-class rows on an entry form carry no date (S10), so identify today's by SQL; offline "Correct this score" takes 10-40 s (S9).
