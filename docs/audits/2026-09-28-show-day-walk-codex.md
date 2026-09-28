# Show-day cross-role walk — 2026-09-28

> **Status:** First supervised run completed. The offline score reached SQL after reconnect. Secretary teardown soft-deleted the fixture entry; a fresh secretary search still displayed its registration.

- Run token: `2026-09-28 1513` America/Chicago; approved staging walk continued through 15:49.
- Issue: [MYK9-732](https://linear.app/myk9-platform/issue/MYK9-732).
- Walk/code baseline: `a5782973106fd464efd5b25f686c39f06a6d9a75` (`origin/main` when the local Vite server started). The branch later incorporated `6b4921ad5`; no prior show-day walk report exists. Relevant intervening changes included on-behalf mail-in acceptance (`4347e2e51`), same-day trial/check-in checks (`940907063`), judge screen gating (`430e8f2a3`), and replication/network handling (`1c51a1c59`). The first two affected this walk's entry and check-in paths.
- Surface: isolated local Vite server at `http://127.0.0.1:5183`, connected to shared staging; three separate role browser sessions.
- Today's class: `dec1a55e-0000-0000-0014-000000000003`, Container Novice A, Trial 4, 2026-09-28, 09:00 America/Chicago. SQL assigned Test Judge and class status `upcoming`.
- WALK ENTRY `831292ce-e4ec-4dba-9d4c-b76eb88890aa`; Ranger (`dededede-0000-0000-0000-000000000042`), armband 202, unpaid $35 check-at-show registration `MK9-000253`.
- Teardown: secretary **Remove Entry** set `deleted_at = 2026-09-28 20:49:25.726+00`, `deleted_by` to the secretary, and version 9. SQL found zero live Ranger rows (`deleted_at is null`). The soft-deleted row remains in `entries`, and a fresh secretary search still displayed Ranger and “Payment due.” Willow and Cooper retained every baseline value measured below.

## Schedule and preflight

The installed Claude `show-day-walk` routine was paused; its 2026-09-28 03:12 attempt had been skipped while the computer slept. I enabled it. The UI showed **Active** with the next run on Oct 5 at about 03:05. `pnpm qa:prompt-parity` passed all seven pointer checks. `pnpm exec tsx scripts/verify-e2e-auth-preflight.ts secretary judge exhibitor` passed; read-only `select 1` succeeded. The fixture showed two seeded entries and no Ranger entry before mutation. The user confirmed a signed fixture AKC agreement, allowing the secretary's agreement attestation. The secretary submitted only Ranger's unpaid entry through the UI.

## Cross-role fact table

“Not shown” identifies a surface that did not display the fact during this walk. Exhibitor surfaces checked were **My Entries**, Ranger's dog page, the show's **My Entries/run schedule**, and the class details/results page. SQL reflects the final live score immediately before teardown.

| Fact                   | SQL                                                 | Secretary saw                                               | Judge saw                                                        | Exhibitor saw (each surface)                                                                                                            | Agree?                                                             |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Judge name             | `Test Judge` class assignment                       | Test Judge on focused class                                 | Judge-only dashboard opened assigned class                       | Show run schedule and class details: Test Judge; My Entries and dog page: not shown                                                     | Yes where shown                                                    |
| Class start time       | `09:00:00`                                          | Focused class: 09:00 AM                                     | Dashboard: 09:00 AM                                              | Show run schedule said “schedule details pending”; My Entries, dog page, class details: not shown                                       | **No exhibitor time** (S1)                                         |
| Check-in state         | `completed` after scoring; `checked-in` before ring | People at show: Ranger checked in                           | Ringside: Ranger #202 checked-in before scoring                  | My Entries and class results: “Scored”; show schedule/dog page: no check-in state                                                       | Semantic scored/completed match; no exhibitor check-in detail (S1) |
| Armband                | `202`                                               | Show Desk run order and Entry Management: #202              | Ringside: #202                                                   | My Entries, show schedule, class result table: 202; dog page: not shown                                                                 | Yes where shown                                                    |
| Running-order position | `run_order NULL` for Ranger; Willow 1, Cooper 2     | Show Desk visually listed Ranger third under #200/#201/#202 | Ringside listed Ranger after Willow/Cooper; no explicit position | Show run schedule said “schedule details pending”; other surfaces did not give a position                                               | **No stored position** (S1)                                        |
| Result                 | `qualified`, preliminary until class completion     | Entry Management did not present the score                  | Score confirmation and saved state: Qualified                    | My Entries `Q preliminary`; show schedule `Q · 0:43.21 · preliminary`; class results `QUALIFIED`/`Q`; dog page did not show today's run | Yes where shown; dog gap (S2)                                      |
| Search time            | `43.21` seconds                                     | Not shown in entry work queue                               | Online 0:45.12, then corrected offline 0:43.21                   | My Entries rounded to `43.2s`; show schedule and class results showed `0:43.21`; dog page: not shown                                    | Yes, allowing My Entries rounding                                  |
| Faults                 | `0`                                                 | Not shown                                                   | Scored with 0 faults                                             | Class details: 0; My Entries, show schedule, dog page: not shown                                                                        | Yes where shown                                                    |

The judge-only account remained `Test, Judge`, its dashboard displayed the class at 0/3 scored, and Ringside displayed three entries. This specifically held against the earlier missing-assignment and 0/0 failure modes. The class results table showed one completed Ranger row and two pending seeded rows; placement remained Pending, appropriate for an uncompleted class.

## SQL score cycle

All rows below came from read-only SQL against shared staging. The online and offline saves each caused two `ringside_update_entry` writes: score data and the separate completion transition in `useAtShowScoresheet.ts`; version +2 therefore does not by itself indicate duplicate score acceptance. The network trace showed no 409 conflict response.

| Step (UTC)                     | Check-in      | Scored | Result    |   Seconds | Faults | Run order | Armband | Version | `updated_at`                           |
| ------------------------------ | ------------- | ------ | --------- | --------: | -----: | --------- | ------: | ------: | -------------------------------------- |
| Preflight                      | Ranger absent | —      | —         |         — |      — | —         |       — |       — | —                                      |
| Entry submitted, 20:33         | `no-status`   | false  | pending   |         0 |      0 | NULL      |     202 |       2 | `20:33:37.504585+00`                   |
| Secretary check-in, 20:35      | `checked-in`  | false  | pending   |         0 |      0 | NULL      |     202 |       3 | `20:35:43.608614+00`                   |
| Opened score screen, 20:37     | `in-ring`     | false  | pending   |         0 |      0 | NULL      |     202 |       4 | `20:37:46.646706+00`                   |
| Online score, 20:39            | `completed`   | true   | qualified |     45.12 |      0 | NULL      |     202 |       6 | `20:39:09.976001+00`                   |
| Offline save, before reconnect | `completed`   | true   | qualified | **45.12** |      0 | NULL      |     202 |       6 | unchanged                              |
| Reconnected, 20:41             | `completed`   | true   | qualified | **43.21** |      0 | NULL      |     202 |       8 | `20:41:08.220142+00`                   |
| UI Remove Entry, 20:49         | `completed`   | true   | qualified |     43.21 |      0 | NULL      |     202 |       9 | `20:49:25.843027+00`; `deleted_at` set |

Ranger's handler was the seeded exhibitor (`6fd402f4-88fb-447d-876e-7c6ae3c429d1`); payment stayed `pending`. The judge's offline confirmation was anchored to Ranger and 0:43.21. While offline, the UI said “Score saved” and separately warned that changes were saved locally for sync; SQL still held 45.12. On reconnect, the warning cleared and SQL advanced to 43.21. One Ranger row existed throughout, with no retrying/conflict requests after reconnect.

Scoring RPC trace, from `.playwright-cli/network-2026-09-28T20-41-30-713Z.log` (the CLI records ordered lines, not individual timestamps):

| Approximate event time UTC                                 | Method and endpoint                       | HTTP status | Trace line |
| ---------------------------------------------------------- | ----------------------------------------- | ----------- | ---------: |
| 20:37, opening Ringside score                              | `POST /rest/v1/rpc/ringside_update_entry` | 200         |        346 |
| 20:39, online score and completion                         | `POST /rest/v1/rpc/ringside_update_entry` | 200, 200    |   448, 450 |
| 20:41, queued offline score and completion after reconnect | `POST /rest/v1/rpc/ringside_update_entry` | 200, 200    |   653, 655 |

**Seeded-row invariants:** Willow (`...0103`) and Cooper (`...0203`) both remained `no-status`, `is_scored=false`, `result_status=pending`, 0 seconds, 0 faults, run orders 1/2, armbands 200/201, version 1, and `updated_at=2026-09-25 16:44:16.728044+00` after teardown.

## Findings

There is no prior show-day report; all findings are **new**. These are first-run observations, pending tracker filing under the repository's shared-system write gate.

- **S1 · P2 · Missing exhibitor day-of time and run position.** SQL start time was 09:00; the secretary and judge saw it, but the exhibitor's show run schedule said “schedule details pending.” Ranger was visually third in secretary/judge lists while `entries.run_order` remained NULL after entry, check-in and scoring. The exhibitor saw no position or check-in state on the tested surfaces. This weakens a handler's ability to plan arrival at the ring. Repro: one new day-of Ranger entry in Trial 4; inspect the show My Entries schedule and the same row in SQL.
- **S2 · P2 · Today's scored run absent from Ranger's dog page.** A cold exhibitor context showed the qualified 43.21-second result in My Entries and class results. Ranger's dog Overview/Upcoming Shows showed only a future November entry, while Past Results showed an older September 25 Heartland run and not today's September 28 run. This is a cross-surface discoverability gap during an active show; the scored result itself was correct where displayed.
- **S3 · P2 · Soft-deleted fixture still appears in secretary registration search.** Secretary Remove Entry set `entries.deleted_at`, and SQL found zero live Ranger entries. After a full page reload, Entry Management search for Ranger still returned registration `MK9-000253` with “1 Entry · 1 Class,” Accepted and Payment due. The registration search is therefore inconsistent with the live entry set and could direct staff toward payment for a removed run. No payment was attempted.

The Score Confirmation card used for Ranger/time verification was not exposed as `[role=dialog]`; this is recorded as a prompt/automation accessibility observation rather than a separate finding without a focused accessibility pass.

## Canary candidates

- As exhibitor, today's Container Novice A row for a checked-in Ranger entry shows Test Judge, 09:00 AM, armband 202, a running-order position, and current check-in state.
- As judge, Ringside for the assigned Container Novice A class shows three entries and Ranger #202 checked-in before scoring.
- After offline 0:43.21 correction and reconnect, the exhibitor's show schedule and class results show Ranger as preliminary Q at 0:43.21 with zero faults.
- After secretary removes the unpaid fixture entry, Ranger is absent from live Entry Management search and no payment-due action remains for that registration.

## Prompt corrections and follow-up

Part 1's preflight `count(*) from entries` must account for `deleted_at`; otherwise this completed, soft-deleted run will falsely appear as residue and stop the next scheduled walk. The same applies to “exactly one Ranger entry” after scoring. Part 1's “an armband and a run order” criterion failed: the UI assigned armband 202 but stored `run_order NULL`. The Part 1 version assertion should distinguish the score write from the separate completion transition and count conflicts/actual result rows. These Part 1 changes require review and were not edited here. The secretary attestation step should explicitly require a signed fixture agreement; the user confirmed one for this run.

Part 2's routine mechanics should mention UI soft deletion and paired score/completion RPCs. `docs/operations/scheduled-task-walks.md` also says the show-day routine is not installed, despite the observed active routine and passing pointer parity; update that documentation through its own review.

The report is the first-run evidence. Do not treat the soft-deleted Ranger row as a live entry or reuse it on a later walk. The P2 findings have not yet been filed to Linear because that is a separate external write under the repository's shared-system gate.
