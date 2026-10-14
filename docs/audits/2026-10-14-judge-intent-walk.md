# Judge intent walk: 2026-10-14

> Scheduled task `role-intent-walk`. Prompt version: `origin/main` @ `0b932fd097e4a7710bb0b4a2eab4e6e66c7f3926` (`docs/qa/walks/role-intent-walk.md`).
>
> **ISO week 42 → 42 mod 3 = 0 → judge.** Lens: INTENT.md, Judge = _"Invisible technology"_ (eyes on the dog, not the screen).

source: claude · run date 2026-10-14 · author: Claude Code (scheduled, unattended)

## Executive assessment

**Role confidence: moderate.** The ringside path a judge uses on show day (open the class, see who is in the ring and up next, score, correct, go offline and come back) feels right. Its targets are large, the in-ring and up-next cards are clear, and the scoring replay passed every functional assertion. The judge's own **home surfaces** are where the "invisible" promise breaks: `/judge/stats` reports 52 upcoming assignments when 5 are real, and `/judge/dashboard` counts dogs differently from the ring. On a multi-day trial the ringside class picker shows seven identical cards, so the judge has to hunt for today's class.

No P0 or P1. Three P2 and four P3 findings, all new (this is the first judge intent walk), all filed under **MYK9-1163**.

## Scope

| Item          | Value                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor         | `judge@myk9t.com` (person "Pat Donovan"). The `E2E_JUDGE_PASSWORD` preflight passed (`verify-e2e-auth-preflight.ts judge`).                                                                                                                 |
| Role validity | **Judge-only, verified in the DB**: `user_roles` = judge (global, active), judge (club `…0001`, active), exhibitor (**inactive**). It rendered as "Pat · Judge", never `Secretary +2`.                                                      |
| Persona       | Elderly, nontechnical, first-time judge                                                                                                                                                                                                     |
| Viewports     | 375x812 (mobile, touch) and 1280x800 (desktop) walked fully; 1024x768 (tablet landscape, touch) as the responsive pass                                                                                                                      |
| App build     | Worktree from `origin/main` `0b932fd09`, Vite dev server on port 5427 (not the primary checkout)                                                                                                                                            |
| Data          | Shared staging Supabase `sojmvhhwsjxmfistvzbe`. Every data write was **intercepted and refused** by the walk harness (`page.route` on `/rest/v1/**`; only GET, HEAD and `rpc/get_*`-style reads passed). No shared-staging writes.          |
| Records       | Heartland Scent Work Week `…0731-a4f2faa73124` (Oct 6–12, 7 assigned classes), Heartland Scent Work Classic `…0010` (Nov 9–11, 5 active assignments), non-owned Prairie Trail Spring Scent Work Trial `…0013` (club `…0002`, no assignment) |

## Scoring replay (`pnpm test:e2e:audit:judge`, OWN mode, port 5391)

**6 passed, 2 failed.** Both failures are a **harness gap, not an app defect**.

| Case                                                                           | Result                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| re-uploads a version-conflicted score instead of dead-lettering it             | **✘ (harness)**: body assertions passed; failed in `attachWriteLedger` |
| advances from the saved dog to the next dog via the quick-advance chip         | **✘ (harness)**: same                                                  |
| routes a judge score through `ringside_update_entry` and persists it           | ✓                                                                      |
| blocks an assigned judge from scoring an unassigned class before any write     | ✓                                                                      |
| records an explicit absence without exposing a qualified result                | ✓                                                                      |
| lets the judge pull a dog without turning it into a score                      | ✓                                                                      |
| reopens the saved dog for correction and keeps the next-dog shortcut explicit  | ✓                                                                      |
| keeps a judge score durable offline and drains it exactly once after reconnect | ✓                                                                      |

**Write ledger:** both failing cases recorded exactly one blocked write, `{"disposition":"blocked","kind":"unclassified-rest-write","method":"POST","path":"/rest/v1/analytics_events"}`. The guard refused it, so **shared staging received no writes**. The body is PWA-install telemetry (`event_type: "pwa_install_state"`, from `features/pwa/pwaInstallTelemetry.ts` via `PWAInstallBanner`). `sharedStagingWriteGuard.ts` does not classify it, so any case where the banner mounts fails the ledger assertion. Per the prompt this is a **probe/harness bug: report only, not filed.** Fix direction: classify `POST /rest/v1/analytics_events` as a known, blocked, non-scoring write, or block telemetry in the audit project. Until then the replay goes red on timing, not on the app. (`docs/qa/findings.md:773` still says `analytics_events` "has no writer today", which is stale.)

Vacuity check (Part 1's trap): the ledger summary asserts `intercepted` is non-empty ("the replay reached the shared-staging write path at least once"), so the absence assertion has a positive control on the same collector.

## Findings

| ID         | Sev | Status | Linear                                                        | Finding                                                                                                                                                                   |
| ---------- | --- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JUD-INT-01 | P2  | new    | [MYK9-1164](https://linear.app/myk9-platform/issue/MYK9-1164) | `/judge/stats` counts and lists assignments to **soft-deleted shows**: "Upcoming 52" (5 real), 47 rows "Show not published yet · Date TBD", blank Assignment Status chart |
| JUD-INT-02 | P2  | new    | [MYK9-1165](https://linear.app/myk9-platform/issue/MYK9-1165) | Ringside "Your ring" shows 7 identical "Container Novice A · Scheduled 9:00 AM" cards with no day or trial; at 375px the class header drops the date                      |
| JUD-INT-03 | P2  | new    | [MYK9-1166](https://linear.app/myk9-platform/issue/MYK9-1166) | `/judge/dashboard` counts include withdrawn and pulled dogs, and count a pulled dog as judged ("1/3" vs ringside "0/2")                                                   |
| JUD-INT-04 | P3  | new    | [MYK9-1167](https://linear.app/myk9-platform/issue/MYK9-1167) | Dashboard "Completed" tab lists not-started past classes with "Start Judging"; classes with no start time read "12:00 AM"                                                 |
| JUD-INT-05 | P3  | new    | [MYK9-1168](https://linear.app/myk9-platform/issue/MYK9-1168) | Ringside "Show announcements" bar: 40px target, "Show" label and badge at 10px, on every scoring screen                                                                   |
| JUD-INT-06 | P3  | new    | [MYK9-1169](https://linear.app/myk9-platform/issue/MYK9-1169) | Reopening ("Resume") a dog already in the ring re-stamps `ring_entry_time` with another `ringside_update_entry`                                                           |
| JUD-INT-07 | P3  | new    | [MYK9-1170](https://linear.app/myk9-platform/issue/MYK9-1170) | ~40 RPCs per ringside page view; per-show RPCs fire 7x and for shows the judge is not assigned to (dev-server measurement)                                                |

Counts: P0 0 · P1 0 · P2 3 · P3 4 (7 total) · new 7 · unchanged 0 · regressed 0 · resolved 0.

### Viewport matrix

| ID         | 375 mobile                              | 1024 tablet      | 1280 desktop     |
| ---------- | --------------------------------------- | ---------------- | ---------------- |
| JUD-INT-01 | yes                                     | yes              | yes              |
| JUD-INT-02 | yes (header date also missing)          | yes (cards only) | yes (cards only) |
| JUD-INT-03 | yes                                     | yes              | yes              |
| JUD-INT-04 | yes                                     | yes              | yes              |
| JUD-INT-05 | 375x40, 10px                            | 1024x40, 10px    | 1280x40, 10px    |
| JUD-INT-06 | viewport-independent (observed at 1024) | n/a              | n/a              |
| JUD-INT-07 | 4.5–10s page settle                     | 3.5–8s           | 3.5–5.3s         |

### Detail and evidence

**JUD-INT-01 (P2).** The live `judge_assignments` response embedding `shows!judge_assignments_show_id_fkey(...)` returned 59 rows, **47 with `shows: null`**. All 47 belong to three soft-deleted shows: `…000000000014` (7), `a783348f-…` (21), `7da14125-…` (19). `getJudgeUpcomingAssignments` maps a null embed to `SHOW_NOT_PUBLISHED_LABEL` and `show_end_date: ''`, and the filter `!a.show_end_date || a.show_end_date >= today` keeps every such row. Upcoming 52 = 47 ghosts + 5 real. The label came from #2975 (MYK9-1147, merged yesterday); it is honest for an exhibitor's unpublished entry and wrong for a judge's deleted show. Intent: the judge cannot tell which commitments are real.

**JUD-INT-02 (P2).** The show has 7 trial days, each with one Container Novice A assigned to this judge, and every card reads the same. The ringside class header carries "Tue, Oct 6, 2026 • Trial 1" at 1024 and 1280 but not at 375. This is the judge-side twin of MYK9-800 (exhibitor "seven identical Willow rows", fixed). Intent: "I'm ready, one tap to begin" fails when the judge must open seven cards to find today's.

**JUD-INT-03 (P2).** `deriveJudgeEntryCounts` (`hooks/queries/judgeEntryCounts.ts`) filters only soft-deleted rows. DB truth for the Oct 6 class: 2 confirmed + 1 `scratched`/`pulled`/`is_scored=true`. Exterior Excellent: 1 confirmed + 2 withdrawn. Buried Master: 1 scratched. The dashboard shows 1/3, 0/3, 0/1; ringside (canonical, MYK9-645) shows 0/2, 0/1, 0/0.

**JUD-INT-04 (P3).** The Completed tab is date-based, not status-based, and its rows say "Not started · Start Judging". Classes with no start time render `toLocaleTimeString` of midnight.

**JUD-INT-05 (P3).** Measured: the bar's bounding box is full-width x 40px; computed font size of "Show" and the count badge is 10px.

**JUD-INT-06 (P3).** The captured write body, twice per open: `{"p_fields":{"ring_entry_time":"<now>","check_in_status":"in-ring"},"p_expected_version":8}` for an entry already `in-ring`. `utils/checkInTransitions.ts` `transitionToInRing` no-ops only on `completed`. Writing on open is deliberate (marking a dog in-ring when its sheet opens); the re-stamp on Resume is not.

**JUD-INT-07 (P3).** One `/at-show/<week>` load: `get_show_judges` x11 (7 for this show, 4 for other shows including `6349d047-…`, where the judge has no assignment), `get_show_class_hide_counts` x11, `get_account_today_entries` x8. Dev server only; re-measure on a production build.

## Intent observations that held (not findings)

- **Scoring a dog, "Tap and done"**: the scoresheet shows armband, call name and handler large; a big Start button; a 0:00.00 timer; one row of Qualified / NQ / Absent / Excused / DQ; Cancel / Save. No sub-44px controls were measured on the scoresheet at any viewport.
- **Between dogs, "What's next?"**: the class page leads with "In the ring" (Resume) and "Up next" (Time) cards, then "Not running (1)". The quick-advance chip and the correction path pass in the replay.
- **Offline is normal**: "Offline ready" renders as a quiet chip, not an error. Offline durability and exactly-once drain pass in the replay.
- **Non-owned record (step 7)**: `/at-show/<Prairie Trail>` says "No classes assigned yet. Your secretary has not assigned you to a class for this show yet. Ask them to add your judge assignment." It offers no scoring or staff controls. `/shows/<Prairie Trail>` shows only public controls (Review details, See classes first). **Pass.**
- **`/judge/check-in`** redirects to `/judge/dashboard`. Per `docs/roles/judge.md` (MYK9-850) it should send the judge to the ringside surface at `/at-show`. The dashboard does link to ringside, so this is minor, and **not filed**: the role doc says `/at-show`, the app does `/judge/dashboard`, and someone with context should decide which one is correct.
- Sign-in lands on `/judge/dashboard`; `/` also redirects there; bare `/at-show` auto-jumps to the judge's nearest assigned show. Navigation into ringside is in-app, with the same session.

## Consolidation observations

- **Two judge homes count dogs three ways.** `/judge/dashboard` (JUD-INT-03), `/judge/stats` (JUD-INT-01) and ringside each derive entry and assignment counts independently. The fix for 01 and 03 is to reuse the ringside entry-accounting rule and one assignment-liveness predicate, not to add a fourth derivation.
- `/judge/stats` "Upcoming Assignments" and `/judge/dashboard` "Upcoming" list the same assignments in two places, with different data paths (the PostgREST embed vs the replication store). Once JUD-INT-01 is fixed, consider whether stats needs its own list at all or should link to the dashboard tab (the duplication question from CLAUDE.md).

## Data observations (staging fixtures, not filed)

- Entry `edcd882f-…` (class `…0731-a0d5f7f7f0d9`) is `entry_status=scratched`, `check_in_status=pulled`, **`is_scored=true`, `result_status=qualified`**. A pulled dog carrying a qualified score is the exact state the replay asserts the app never writes ("lets the judge pull a dog without turning it into a score"), so this is probably residue from an earlier fixture or tool. It feeds JUD-INT-03's "1 judged". Worth a reseed check; filed nowhere.
- Class `dec1a55e-…031` (Classic, Nov 9, a future show) is `status=completed`, all 3 scored, `judge_signed_off_at` null. This is fixture state; it makes the Upcoming tab show a "Completed" class.
- `docs/INTENT.md` § 6 names `shows.unified_ringside_enabled`; that column does not exist in the live schema (a query on it errored 42703). This is doc drift in INTENT.md, outside this walk's file; flagged for a human.

## Recent changes re-walked

| PR / issue                                                  | Result                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #2975 MYK9-1147 "Show not published yet" label (2026-10-13) | **failed on the judge surface**: now shown for deleted shows on `/judge/stats` (JUD-INT-01). Exhibitor surfaces were not in scope. |
| MYK9-1086 at-show entry cards redesign (option G)           | verified: in-ring and up-next cards render at all three viewports                                                                  |
| MYK9-645 / MYK9-637 ringside counts                         | verified on ringside (0/2, 0/1, 0/0 match canonical); **not applied** to `/judge/dashboard` (JUD-INT-03)                           |
| MYK9-850 `/judge/check-in` deletion                         | verified redirect; target differs from the role doc (see above)                                                                    |
| MYK9-1142 ringside replica account scoping                  | not applicable: single account per context, fresh contexts                                                                         |
| MYK9-1030 judge sign-off write path (Done today)            | **blocked**: no class was ready for sign-off without writing to staging                                                            |

## Regression re-verification

No prior judge **intent** walk exists (`git log` on `origin/main` finds no `*judge*intent*` or `*judge*walk*` report). The older rotation's judge reports (`*-judge-ux-walk-claude.md`) are not on `main`. **Nothing to re-verify; none reached.**

## Coverage matrix

| Route                                                        | Mobile      | Desktop           | Tablet      | Notes                                                                                     |
| ------------------------------------------------------------ | ----------- | ----------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `/sign-in` → role home                                       | walked      | walked            | walked      | lands `/judge/dashboard`                                                                  |
| `/judge/dashboard` (Today, Upcoming, Completed)              | walked      | walked (all tabs) | walked      | tabs clicked at desktop only                                                              |
| `/judge/stats`                                               | walked      | walked            | walked      |                                                                                           |
| `/judge/check-in`                                            | walked      | walked            | walked      | redirect                                                                                  |
| `/at-show` (smart landing)                                   | walked      | walked            | walked      | auto-jump                                                                                 |
| `/at-show/:showId` (Week, Classic)                           | walked      | walked            | walked      |                                                                                           |
| `/at-show/:showId/class/:classId` (pending, completed)       | walked      | walked            | walked      |                                                                                           |
| `/at-show/:showId/class/:classId/score/:entryId`             | walked      | walked            | walked      | **no score saved by hand**: writes intercepted; scoring persistence covered by the replay |
| `/at-show/:showId/class/:a/:b` (combined A/B)                | **skipped** | **skipped**       | **skipped** | no combined A/B class assigned to this judge                                              |
| Non-owned `/at-show/…0013`, `/shows/…0013`                   | walked      | walked            | walked      | pass                                                                                      |
| `/shows`, `/account`                                         | walked      | walked            | walked      |                                                                                           |
| Judge sign-off flow (MYK9-1030)                              | **skipped** | **skipped**       | **skipped** | needs a staging write                                                                     |
| Passcode (no-account) ringside entry                         | **skipped** | **skipped**       | **skipped** | out of the signed-in judge's scope; no passcode fixture used                              |
| Max-time prompt (MYK9-1099), Requirements dialog (MYK9-1100) | **skipped** | **skipped**       | **skipped** | not opened by hand; time ran to the replay                                                |
| Keyboard-only and focus order                                | **skipped** | **skipped**       | **skipped** | coverage gap                                                                              |

Skipped routes are coverage gaps, not passes.

## Blocked / harness notes (report only)

- **Replay harness:** `sharedStagingWriteGuard` does not classify `POST /rest/v1/analytics_events` (see above).
- **Walk harness:** the walk refused `rpc/ringside_claim_generation_current` (a write-shaped RPC), so the device-claim path ran in a refused state throughout. The induced toast "We couldn't update this entry. Retry or discard this change." is an artifact of the refused write, not a finding; on a real network the in-ring write queues offline instead.

## Prompt corrections

No statement in `docs/qa/walks/role-intent-walk.md` was found stale this run. Notes for a human (all above `# Part 2`, so listed, not applied):

- Part 1 "Output" says to file directly, while the `role-journey-ux-audit` skill it invokes says "Request one batch approval before any Linear create/update/close". The walk prompt governs scheduled runs, and this run followed it. Consider adding a line to the skill that a calling prompt's filing rule overrides its approval step, so the next run doesn't have to resolve the conflict itself.
- Part 1 "Judge week" could name the known `analytics_events` ledger failure until the guard is fixed. It is not stale, but the next run will meet the same red.

## Next proof

1. JUD-INT-01: stats Upcoming = 5 for this judge; no "Show not published yet" row for a deleted show.
2. JUD-INT-02: at 375, the class header shows its date, and every "Your ring" card names its day.
3. JUD-INT-03: dashboard 0/2, 0/1, 0/0 for the three classes above.
4. Replay goes 8/8 once the guard classifies telemetry.
