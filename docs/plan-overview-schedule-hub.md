# Overview Schedule as the Secretary's Hub — status, a class checklist, and a lighter Setup

> **Status:** Active

**Linear:** MYK9-942, MYK9-948, MYK9-943 shipped; MYK9-944 and MYK9-945 superseded by [`plan-secretary-show-home.md`](plan-secretary-show-home.md) · **Date:** 2026-10-02 (revised the same day against `origin/main` @ `6e38d748f`) · **Related:** [MYK9-897](https://linear.app/myk9-platform/issue/MYK9-897) / [`plan-secretary-crud-consolidation.md`](plan-secretary-crud-consolidation.md)
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary ("That was easy" — _absorb complexity, not add to it_) and [`archive/plan-show-map-workbench-collapse.md`](archive/plan-show-map-workbench-collapse.md) (the precedent for deleting a surface instead of rearranging it).

## Goal

The secretary should be able to **start** almost any job for a show from one place: the Show schedule on the Overview tab. Fewer tab switches, no hunting for the right filter.

The rule that keeps this simple: **the schedule is where work starts, not where it happens.** Every row says _is this OK, and what's next?_. One tap lands on the existing page that does the job, already filtered to that trial or class.

### The test for anything added to the schedule

A **status**, a **count** or a **link** → belongs on the schedule.
A **form**, a **list of dogs**, a **bulk action** or a **destructive/mutating action** → belongs on the destination page, reached by a link.

The one existing exception stays: the inline class start-time editor (`ClassStartTimeEditor`), which is already on Overview for managers.

## Why Setup is not deleted (revision note)

The first draft of this plan deleted the Setup tab. That draft was written from a checkout 62 commits behind `main`. On current `main`, Setup is where MYK9-897 put the secretary's object-level work:

- Setup → Classes **is** Class Management now (MYK9-924): judge assignment, bulk status, bulk delete, export, views (pending / in progress / completed).
- Setup trial and class rows carry Edit and Delete (MYK9-900).
- MYK9-898 (watch a real secretary) records whether she finds those Setup row menus unaided.

All of that is forms and bulk actions, which fails the test above, so it cannot move onto the schedule. Deleting Setup would mean relocating Class Management, not simplifying. **Setup survives; this plan only removes its Show Map view.** Whether Setup itself should exist is decided after MYK9-898, from what the real secretary actually does (Phase 4).

## Duplication question (CLAUDE.md § consolidate)

_Does this duplicate an existing page?_ No. It removes one view (Setup → Show Map) and adds only links into Entries, Show Day, Setup → Classes and Class details. No entry list, approval, scratch, scoring or bulk UI is rebuilt on Overview. The class checklist lives in one place (Show Day's focused-class panel); Overview shows only its progress count and links to it, so there is one checklist, not two.

## Current state (verified on `origin/main`, 2026-10-02)

| Surface                  | File                                                         | What it gives a secretary                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview → Show schedule | `components/schedule/CompactScheduleTimeline.tsx`            | Collapsible trials → class rows with status, judge, time, **total** entry count; row opens Class details; "View trial details"; inline start-time edit; **caps at 6 classes per trial**, overflow link points at the stale `?tab=classes` |
| Setup → Trials           | `components/shows/tabs/TrialsTab.tsx`                        | Trial list, Add Trial, row Edit / Delete                                                                                                                                                                                                  |
| Setup → Classes          | `components/shows/tabs/ClassesTab.tsx`                       | Class Management: Add Classes (`getAddClassesHref`), row Edit / Delete, judge, bulk status/delete, export, views, `?trialId=` scoping                                                                                                     |
| Setup → Show Map         | `features/show-map/ShowMapTab.tsx` (`canManageShow={false}`) | View-only tree down to dogs/entries, "all exhibitors" branch, day/completion filters, Running-now strip, totals. **Its only mount is Setup.**                                                                                             |
| Show Day cockpit         | `features/show-map/cockpit/*`                                | Per-class attention + primary actions, `?focus=<classId>` deep link                                                                                                                                                                       |
| Entries deep links       | `features/entry-operations/entryAttentionRoutes.ts`          | `getClassReviewHref`, `getClassMissingInformationHref`, `getClassPaymentDueHref`, `getClassDayOfHref`, `getEntryManagementHref({ trialId, classId, … })`                                                                                  |

`ShowOverviewTab` is shared with exhibitors and the public (`ShowDetailTabs.tsx`); the manager shell renders it from `ShowManagementShell.tsx` with `mapTrials` / `mapClasses` / `mapEntries` already loaded. Everything added below is **manager-only** (`canManageShow`).

## Phase 1 — Schedule as launcher: structural links, no cap ([MYK9-942](https://linear.app/myk9-platform/issue/MYK9-942))

- Schedule header (manager-only): **Add Trial** → `/secretary/create-show/wizard?showId=…&mode=add-trials` (the same target Setup → Trials uses).
- Each trial group (manager-only): **Add classes** → `getAddClassesHref(showId, trialId)`, and **Manage classes** → `/shows/:id/setup?section=classes&trialId=<trialId>`.
- Remove the 6-class cap for managers so no class hides behind a link; replace the stale `?tab=classes` overflow link (for anyone who still gets a cap) with the Setup → Classes link above.
- Trial header shows the trial's total entry count next to its class count.

Acceptance: a manager can add a trial, add classes to a trial, and open that trial's Class Management from the schedule; no `?tab=classes` link remains; exhibitor/public Overview renders unchanged (render test for both roles).

## Phase 2 — A per-class checklist, and its progress on Overview

**Revised 2026-10-02 (owner decision).** The first version put one "next-step chip" per class on the schedule, chosen by the Show Day action rule. Two problems surfaced: applied to every class, that rule shows "Mark Class Started" on every unstarted class weeks before the show (Show Day only shows chips for the selected day); and a single next step hides work, because things happen out of order (sheets reprinted after a move-up, results printed before the signature). The replacement is a **checklist** that shows every item with its own status, checked off by the system when it can tell or by the secretary when the work happened outside the app. The trial-level "N classes need attention" rollup is dropped: matching Show Day's count would mean loading its paperwork-print and time-of-day inputs on Overview.

### Phase 2a — Class checklist on Show Day ([MYK9-948](https://linear.app/myk9-platform/issue/MYK9-948))

Grow the focused-class panel's existing **Paperwork** section (`SecretaryCockpitFocusedClass.tsx`, built from `buildClassPaperworkMap.ts`, print status replicated offline, **Mark printed** via `PaperworkPrintConfirmationDialog`) into a **Class checklist**, with no gating between items:

| Item                                  | Source                                        | Checked off by                              |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Check-in sheet printed (gate steward) | `check-in-sheet` paperwork record             | System when printed in-app, or Mark printed |
| Score sheets printed (judge)          | `scoresheet` paperwork record                 | Same                                        |
| Class started                         | class status                                  | System                                      |
| Scoring complete                      | scored count = entry count, or class complete | System                                      |
| Preliminary results printed           | `results-sheet` paperwork record              | System or Mark printed                      |
| Ribbon labels printed                 | `result-labels` paperwork record              | System or Mark printed                      |
| Judge signature collected             | class wrap-up status                          | System                                      |

One pure builder derives the items and a done / not done / unknown state for each, so Overview can reuse it. Unknown (for example, print records unavailable) never reads as done. Works for any day the panel opens, so printing 1–2 weeks before the show is covered. Check-in and score sheets are normally printed together; a combined one-click print of both is a separate idea (the Reports page prints one report per link today).

### Phase 2b — Breakdown and checklist progress on Overview ([MYK9-943](https://linear.app/myk9-platform/issue/MYK9-943))

Each class row (manager-only) shows:

- **Entry breakdown**, e.g. `18 entered · 2 pending · 1 waitlist`, from `mapEntries` with the canonical `getOperationalEntryState` (`features/entry-operations/attentionClassification.ts`), so `paid` and `promotion-expired` count as pending exactly as Entries does. Counts only, never names. **"N pending" links** to `getClassReviewHref` for that class.
- **Checklist progress**, e.g. `4 of 7 done` (with `· 1 unknown` when an item is unknown), from the 2a builder, linking to Show Day focused on the class (`getShowDeskHref` with `selectedDay` = trial date and `focusedClassId`).
- Data: `mapTrials` / `mapClasses` / `mapEntries` passed from `ShowManagementShell`, already loaded through replication; **no new direct PostgREST reads**. While entry data is loading or errored, show no breakdown rather than zeros.

Acceptance (assertion-first): breakdown tests including `paid` / `promotion-expired` as pending and terminal statuses excluded, written red first; exact hrefs for both links; a render test on the real `mapEntries` shape proving counts and progress reach the row (last-hop drop lesson); exhibitor Overview shows neither; offline reload still renders both.

## Phase 3 — Remove the Show Map view from Setup ([MYK9-944](https://linear.app/myk9-platform/issue/MYK9-944))

> **Superseded 2026-10-02** by [`plan-secretary-show-home.md`](plan-secretary-show-home.md): the owner chose one secretary home that absorbs Show Day and Setup, so this phase is folded into its Phase 4 / Phase 3.

1. **Walk first (decision gate).** As `secretary@myk9t.com` on a seeded show, open Setup → Show Map and record anything it shows that the schedule (after Phases 1–2), Entries or Class details cannot: the "all exhibitors" by-dog branch and the day/completion filters are the candidates. If something has no other home, name where it moves before deleting. Default: delete.
2. Remove `'map'` from `SETUP_SECTIONS`; `?section=map` and the legacy `?tab=map` redirect to Overview.
3. Delete `ShowMapTab` and the parts of `features/show-map/` that only it uses. **Keep** everything the Show Day cockpit imports (`showMapTree`, `showMapActions`, `showDeskPendingSignals`, dialogs used by `ShowDeskPanel`, …). Prove each deletion with a grep (code **and** `*.md`) and a green typecheck, not by name.
4. Drop `canShowMap` / `map*` outlet props if nothing else reads them (Phase 2b is now a reader; check).

Acceptance: Setup shows two views (Trials, Classes) with a render test asserting it (red on `main`); `?section=map` and `?tab=map` land on Overview; typecheck, lint and suite green; e2e specs that opened the map updated.

## Phase 4 — Decide Setup's future (after MYK9-898) ([MYK9-945](https://linear.app/myk9-platform/issue/MYK9-945))

> **Superseded 2026-10-02** by [`plan-secretary-show-home.md`](plan-secretary-show-home.md): the owner chose one secretary home that absorbs Show Day and Setup, so this phase is folded into its Phase 4 / Phase 3.

Not code. After the real-secretary observation (MYK9-898) runs, review: did she start work from the schedule? Did she find Setup → Classes from the schedule's "Manage classes" link, or from the tab? If the tab is unused, propose folding Trials and Classes somewhere else (e.g. reached only from the schedule) as a new plan; if it is used, close this question. Filed as a follow-up under MYK9-897.

## Testing (every phase)

- Unit + render tests per phase, run shuffled (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`. `CompactScheduleTimeline.tsx` is ~275 lines; put the breakdown, progress and trial-header links in sibling modules rather than growing it past 500.
- Browser walk as `secretary@myk9t.com` at 1440px and 375px: follow every new link and confirm the landing page is pre-filtered to that trial/class; confirm an exhibitor's Overview is unchanged.

## Non-goals

- No dog/entry lists, approve/reject, scratch, move-up, scoring, judge assignment or bulk actions on Overview.
- No change to Setup → Trials / Classes, the Show Day cockpit, Entries or Class details beyond receiving deep links they already support.
- No new next-action rules; Overview only reads the existing one.
- Not deleting the Setup tab (see Phase 4).
