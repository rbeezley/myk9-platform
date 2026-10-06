# Show-day walk, 2026-10-06 (Claude)

- Run token: 2026-10-06 1005 (America/Chicago; entry created 15:08Z)
- `origin/main`: `3d11bfc6a5fb269103cc131f5bd03a8e00f5118c` (prompt and worktree base)
- Prior show-day walk baseline: `2026-09-28-show-day-walk-codex.md` (a5782973; the 2026-10-05 run was blocked). Commits since touching the walked paths: `git log` from `a5782973` is large; the only commit between the deployed bundle and `origin/main` is #2783 (seed restore), which is not app code.
- Surface: deployed bundle at https://myk9show.com, built from `485e34666` (Deploy myK9Show run 37467381527, 2026-10-06 13:00Z; ancestor of `origin/main`). Shares the staging database.
- Show `dededede-0000-0000-0731-a4f2faa73124`, trial `dededede-0000-0000-0731-22ae9267e800`, class `dededede-0000-0000-0731-a0d5f7f7f0d9` (Container Novice A, 09:00, status upcoming, 2 entries before the walk).
- **Readiness SQL**: `public.seed_demo_show_day_fixture_today()` returns `permission denied` (42501) over the MCP role, so the walk ran the function's own body (read from `pg_get_functiondef`) as a SELECT. It resolved to `dededede-0000-0000-0731-a4f2faa73124`, one trial dated 2026-10-06, one class, 2 live entries, Ranger entries in the class = 0. Fixture ready.
- **WALK ENTRY edcd882f-b851-4e6e-b531-816a4294a3a2** (Ranger, #202, confirmation MK9-000259, handler Casey Morgan = exhibitor@, payment method check, unpaid, $35)
- **Teardown**: DELETE refused by the UI for a scored entry (S7); removed through the secretary's Pull instead. **Residue remains**: entry `edcd882f-…` is live (`deleted_at` null), `entry_status = scratched`, `check_in_status = pulled`, `is_scored = true`, qualified 58 s, version 9, payment pending $0 paid. It sits on seeded dog Ranger; the next reseed's dog delete removes it and the money guard lets it go (nothing paid). Willow and Cooper equal their start values (`no-status`, not scored, run 1 / 2, version 1).

## Result

The secretary → judge → exhibitor chain passed: every fact the secretary and judge set reached the exhibitor correctly on every surface that states it. The offline → reconnect score passed: no conflict, no storm. No P0/P1. One known gap recurs in part (S4); four new P2/P3 findings (S5-S8). Prior S1/S2 (class time, dog page result) read as resolved.

## Cross-role fact table

| Fact | SQL | Secretary saw | Judge saw | Exhibitor saw | Agree? |
| --- | --- | --- | --- | --- | --- |
| Judge name | Pat Donovan (judge_assignments, class level) | "Judge Pat Donovan" Show Desk | account "Pat, Judge" (judge-only, no Secretary role) | show page My run schedule: Judge Pat Donovan. Not shown on My Entries row, at-show "Your dogs today", dog page | yes where shown (S8) |
| Class start | 09:00:00 | 9:00 AM | 09:00 AM on dashboard | 9:00 AM show page and at-show; not on My Entries row | yes |
| Check-in | checked-in (v3) then in-ring then completed | "Checked-in" in People at show | "Checked-in" chip before scoring | at-show row "Completed"; show page "Completed" | yes |
| Armband | 202 | 202 | 202 | 202 (My Entries, show page, at-show) | yes |
| Run-order position | `run_order` NULL | Show Desk lists #202 third | list sorted it last (after 200, 201) | not shown anywhere | S4 |
| Result | qualified | not shown on Show Desk (Results tab 0, class not completed) | Q on confirmation | Q (My Entries "Q preliminary", dog page, class Completed tab, show page) | yes |
| Search time | 65 then 58 | not shown | 1:05.00 then 0:58.00 | 58.0s / 0:58.00 / 00:58.00 | yes (final 58) |
| Faults | 0 | not shown | 0 | "0 Faults" class Completed tab; not on other surfaces | yes |

## SQL row after each step

Columns: check_in_status, is_scored, result_status, search_time_seconds, total_faults, run_order, armband, version.

1. After mail-in entry: no-status, false, pending, 0, 0, NULL, 202, v2 (entry_status confirmed, payment pending, is_day_of_show true).
2. After secretary check-in (People at show → Casey Morgan → Check in on #202 row only): checked-in, false, pending, 0, 0, **NULL**, 202, v3. Expectation "a run order" not met (S4).
3. Judge opens Score (entry to ring): in-ring, false, pending, 0, 0, NULL, 202, v4.
4. Judge online score, Qualified 1:05.00, 0 faults: completed, true, qualified, 65, 0, NULL, 202, v6 (v5 score, v6 transition).
5. Offline edit 0:58.00 saved: SQL unchanged (65, v6): queue held it.
6. Reconnect, 15 s wait: completed, true, qualified, 58, 0, NULL, 202, v8 (+2: score and check-in transition, as the known mechanic describes). One Ranger entry in class. Willow and Cooper unchanged.
7. Teardown Pull: scratched / pulled, is_scored true, qualified, 58, v9.

## Offline cycle request log

The browser's network list for the judge session has no timestamps. Scoring requests (`POST /rest/v1/rpc/ringside_update_entry`): 5 total, all HTTP 200, none failed, none retried: 3 online (in-ring, score, completed) and 2 after reconnect (score, completed). While offline: `ringside_claim_generation_current` twice `net::ERR_INTERNET_DISCONNECTED` (expected), then 200 after reconnect. Zero conflict responses and no request in flight after the queue cleared: no OCC storm (MYK9-740 holds). Not captured: per-request time.

## Findings

- **S4 · P3 · recurrence of MYK9-868 (Done), partial.** A day-of mail-in entry keeps `run_order = NULL` after check-in and scoring; judge list sorts it last, exhibitor sees no position and no "pending" text. Class time, check-in and result now reach the exhibitor. Commented on MYK9-868; not reopened.
- **S5 · P2 · new · MYK9-1023.** Offline save shows "Score saved", identical to online, with no on-device/pending wording; no on-screen sync confirmation after reconnect.
- **S6 · P3 · new · MYK9-1025.** "Correct this score" opens a blank form.
- **S7 · P2 · new · MYK9-1024.** Delete dialog for a scored entry links to "Withdraw / Pull entries", which lands on an empty Needs-review list. Delete is disabled for scored entries (deliberate) so teardown needed Pull from the status chip menu.
- **S8 · P3 · new · MYK9-1026.** Exhibitor at-show row says "Completed" with no result/judge/position.
- Observation, not filed (needs a decision): Pull on a scored entry leaves `is_scored = true`, `result_status = qualified` and a 58 s time on a `scratched` entry. Whether pulled-but-scored results should still count in class results was not checked.
- Observation: the judge account is judge-only ("Pat, Judge"), MYK9-141 holds. Secretary account reads "Secretary +3" (expected for that fixture user).
- Resolved vs prior: S1 (class time/check-in on exhibitor), S2 (dog page shows today's scored run) read as fixed; S3 (soft-deleted entry in search) not reproduced because Pull replaced Remove.
- Linear: parent MYK9-1022 (S5-S8 as sub-issues MYK9-1023..1026), comment on MYK9-868. MYK9-494 (judge on exhibitor schedule rows), MYK9-637, MYK9-740 hold in this chain.

## Canary candidates

- S5: offline, after Confirm & Submit the confirmation contains "on this device" or "pending", not bare "Score saved".
- S7: from a scored entry's delete dialog, the Withdraw / Pull link lands with that entry visible.
- S6: "Correct this score" shows the saved time and result.
- S8: after scoring, the exhibitor show-day row shows Q and the time.
- Held: after secretary check-in the judge's list shows the dog with chip "Checked-in" and the same armband; show page My run schedule for a scored dog reads `Judge Pat Donovan`, `9:00 AM`, armband, `Completed`, `Q · 0:58.00`; dog page Recent results shows the scored run; offline edit leaves SQL on the online value until reconnect, then SQL holds the offline value with exactly two version increments and no non-200 `ringside_update_entry`.

## Prompt corrections

- Part 1 (human edit via PR, not applied): the readiness query calls `public.seed_demo_show_day_fixture_today()`, but the MCP role gets 42501 permission denied on it. The walk had to inline the function body from `pg_get_functiondef`. Either grant EXECUTE to the read role or document the inline form. The safe-boundary teardown ("delete if the UI offers delete") also should say outright that delete is refused for a scored entry, and that Pull is the fallback.
- Part 2 (applied in this commit): entry route and mechanics corrected to what the run saw (see the diff).
