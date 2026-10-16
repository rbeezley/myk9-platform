# Judge intent walk: 2026-10-16

> Scheduled task `role-intent-walk`. Prompt version: `origin/main` @ `5347069aba464f8c1912f3a5ec7933271c0c5750` (`docs/qa/walks/role-intent-walk.md`).
>
> **ISO week 42 → 42 mod 3 = 0 → judge.** This is the second judge walk in week 42 (first: 2026-10-14). Lens: INTENT.md, Judge = _"Invisible technology"_.

source: claude · run date 2026-10-16 · author: Claude Code (scheduled, unattended)

## Executive assessment

**Role confidence: good.** All seven findings from the 10-14 walk (MYK9-1164 to MYK9-1170) were merged as fixes on 10-14 and 10-15. Six hold in the browser at 375, 1024 and 1280. The seventh (MYK9-1169, re-stamp on Resume) needs an in-ring staging write, which the write guard refuses, so it is unverified here. No regression. One new P3 (MYK9-1224): the ringside "Your ring" list gives a past day the same weight as today's class.

P0 0 · P1 0 · P2 0 · P3 1 (new). Filed under parent **MYK9-1223**.

## Scope

| Item     | Value                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor    | `judge@myk9t.com`, rendered "Pat". Sign-in succeeded (no auth drift). Judge-only, no `Secretary +2`.                                                                                  |
| Viewport | 375x812, 1280x800 and 1024x768, all three walked through the same read-only route set                                                                                                 |
| Build    | Worktree from `origin/main` `5347069ab`, Vite dev server on port 5437 (Playwright-owned)                                                                                              |
| Data     | Shared staging. Every write went through `installSharedStagingWriteGuard` (strict RPC writes). Only blocked write seen: `POST /rest/v1/analytics_events` (same harness gap as 10-14). |
| Fixtures | The demo data was re-dated since 10-14: Heartland Scent Work Week now runs Oct 14-20 (7 trials) beside an older Week show with Oct 6-12 classes. Dashboard "Past" lists both.         |

## Scoring replay (`pnpm test:e2e:audit:judge`, OWN mode)

**6 passed, 2 failed, identical to 10-14.** Failing cases: "re-uploads a version-conflicted score instead of dead-lettering it" and "advances from the saved dog to the next dog via the quick-advance chip". Both fail only in `attachWriteLedger` (`atShowJudgeAuditReplay.spec.ts:182`), on one blocked write: `POST /rest/v1/analytics_events` (`kind: unclassified-rest-write`). The guard aborted it, so staging received no writes. The scoring assertions before that line passed. Per the prompt this is a probe/harness bug: **reported, not filed**. It is now red on two consecutive runs; until `sharedStagingWriteGuard` classifies PWA-install telemetry, the scheduled replay cannot be green. The positive control (`intercepted` non-empty) is unchanged.

## Regression re-verification (10-14 findings)

| 10-14 finding | Linear    | Result in browser                                                                                                                                                                |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JUD-INT-01    | MYK9-1164 | **Holds.** `/judge/stats` Upcoming = 12, all 12 rows real (Week, Classic), no "Show not published yet", Assignment Status populated (Confirmed: 19). Same at 375 and 1280.       |
| JUD-INT-02    | MYK9-1165 | **Holds.** 7 "Your ring" cards read "Trial N · Wed, Oct 14, 2026" etc. Class header at 375 reads "Wed, Oct 14, 2026 • Trial 1" (date present).                                   |
| JUD-INT-03    | MYK9-1166 | **Holds.** Dashboard "0/2 entries" matches ringside "0 / 2" for the same class; Total Entries 2.                                                                                 |
| JUD-INT-04    | MYK9-1167 | **Holds.** The tab is now "Past"; not-started past classes say "Open class", never "Start Judging"; no "12:00 AM".                                                               |
| JUD-INT-05    | MYK9-1168 | **Holds.** Announcements bar measured 375x44, 1024x48, 1280x48; text 16px.                                                                                                       |
| JUD-INT-06    | MYK9-1169 | **Not reached.** Needs a write on an already in-ring dog; blocked by design. Opening a pending dog's sheet fired exactly one `ringside_update_entry` (expected).                 |
| JUD-INT-07    | MYK9-1170 | **Holds at 1024 and 1280:** after opening a scoresheet, 1 call each of `get_show_judges`, `get_show_class_hide_counts`, `get_account_today_entries`. See the note below for 375. |

Note: at 375 the same count read 6 each for `get_show_judges` and `get_show_class_hide_counts`. The three viewport tests ran in parallel under one dev server, so this is not conclusive and is **not filed**; re-measure on a production build.

## Findings

| ID         | Sev | Status | Linear                                                        | Finding                                                                                                                        |
| ---------- | --- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| JUD-INT-08 | P3  | new    | [MYK9-1224](https://linear.app/myk9-platform/issue/MYK9-1224) | Ringside "Your ring" lists Trial 1 (Oct 14) to Trial 7 (Oct 20) in date order on Fri Oct 16; past days weigh the same as today |

Evidence: at all three viewports the cards read Trial 1..7, Trials 1 and 2 are past and show "Not started 0 / 2", and the first card opens a past day. Intent: "I'm ready, one tap to begin". Fix direction: reuse the dashboard's local-day rule to lead with or highlight today. No new surface.

## Observations (not filed)

- **`/at-show` cold load.** A signed-in direct load of `/at-show` settles to the show picker ("Live now: Heartland Scent Work Week", "Coming up: Heartland Scent Work Classic", "At a show? Enter a passcode"). The 10-14 report said bare `/at-show` auto-jumps to the nearest assigned show; it now shows the picker. The "Live now" row is a clear single tap, so this is fine for intent. Whether the change was deliberate is unknown. In one early script, an in-app click on Ringside from the dashboard (after cycling the dashboard tabs) left a loading skeleton for 8s+. I could not reproduce it from a direct load (settled by 5s, LCP 6.6s on the dev server), so it is unconfirmed, probably a dev-server cold chunk.
- **`/judge/check-in`** still redirects to `/judge/dashboard` (role doc says `/at-show`); unchanged from 10-14, left for a human.
- **Scoresheet geometry** (Willow, Trial 1): armband, call name, handler, timer, Start, Qualified / NQ / Absent / Excused / DQ, Cancel / Save. No button or link under 44px in either dimension at 375, 1024 or 1280.
- "Good evening, Pat" appeared with "Next class 355m", which suggests the greeting treats early morning as evening. Not walked further; noting for a human.

## Coverage matrix

| Route                                             | Mobile  | Desktop | Tablet  | Notes                                      |
| ------------------------------------------------- | ------- | ------- | ------- | ------------------------------------------ |
| Sign-in → role home                               | walked  | walked  | walked  |                                            |
| `/judge/stats`                                    | walked  | walked  | walked  |                                            |
| `/judge/dashboard` Today / Upcoming / Past        | walked  | walked  | walked  |                                            |
| `/judge/check-in`                                 | walked  | walked  | walked  | redirect                                   |
| `/at-show` (picker)                               | walked  | walked  | walked  |                                            |
| `/at-show/:showId` (Your ring)                    | walked  | walked  | walked  |                                            |
| `/at-show/:showId/class/:classId`                 | walked  | walked  | walked  |                                            |
| `.../score/:entryId`                              | walked  | walked  | walked  | opened only; no score saved by hand        |
| Scoring, offline, drain, conflict                 | replay  | replay  | replay  | 6 of 8 green (harness gap)                 |
| Non-owned show (`/at-show/…0013`, `/shows/…0013`) | skipped | skipped | skipped | passed 10-14; not repeated                 |
| Combined A/B class, sign-off flow, passcode entry | skipped | skipped | skipped | no fixture, needs a write, or out of scope |
| Max-time prompt, Requirements dialog              | skipped | skipped | skipped | not opened                                 |
| Keyboard-only and focus order                     | skipped | skipped | skipped | coverage gap                               |

Skipped routes are coverage gaps, not passes.

## Prompt corrections

None found stale in `docs/qa/walks/role-intent-walk.md`. Two notes for a human (both above `# Part 2`, so not applied):

- "Judge week" could name the known `analytics_events` ledger failure; two consecutive runs hit it.
- The 10-14 report still describes bare `/at-show` auto-jumping; it now shows a picker.

## Next proof

1. MYK9-1224: today's trial card leads or is marked on "Your ring".
2. MYK9-1169: re-stamp on Resume, needs a write-capable verification.
3. Replay 8/8 once the guard classifies `analytics_events`.
