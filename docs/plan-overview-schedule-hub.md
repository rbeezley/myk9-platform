# Overview Schedule as the Secretary's Hub — status, next steps, and a lighter Setup

> **Status:** Active

**Linear:** MYK9-942 → 943 → 944 (each blocks the next); MYK9-945 under MYK9-897 · **Date:** 2026-10-02 (revised the same day against `origin/main` @ `6e38d748f`) · **Related:** [MYK9-897](https://linear.app/myk9-platform/issue/MYK9-897) / [`plan-secretary-crud-consolidation.md`](plan-secretary-crud-consolidation.md)
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

_Does this duplicate an existing page?_ No. It removes one view (Setup → Show Map) and adds only links into Entries, Show Day, Setup → Classes and Class details. No entry list, approval, scratch, scoring or bulk UI is rebuilt on Overview. The next-step chip reuses the Show Day cockpit's action rule (`getPrimaryActionForNode` in `features/show-map/showMapActions.ts`), so there is one rule for "what's next for this class", not two.

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

## Phase 2 — Status and one next-step chip per class ([MYK9-943](https://linear.app/myk9-platform/issue/MYK9-943))

Each class row (manager-only) shows:

- **Entry breakdown**, e.g. `18 entered · 2 pending · 1 waitlist`. Counts only, never names. Compute from `mapEntries` with the **same status buckets Entries uses** (`paid` and `promotion-expired` count as pending). Reuse or extract the existing bucketing helper; never invent a third.
- **At most one next-step chip**, chosen by `getPrimaryActionForNode` on the class node, so Overview and the Show Day cockpit always agree. The chip is always a **link**:
  - action has an `href` → link to it (pending → `getClassReviewHref`, missing info → `getClassMissingInformationHref`, payment due → `getClassPaymentDueHref`);
  - action is a mutation (`mark-class-started`, scratch, move-up, …) → link to Show Day `?focus=<classId>`, so the mutation happens in the cockpit with its confirm dialog;
  - no action → no chip.
- Trial header: one rollup, e.g. `3 classes need attention`, linking to Show Day `?filter=needs-attention&day=<date>`.

Offline: everything reads from data the shell already loaded through replication; **no new direct PostgREST reads**.

Acceptance (assertion-first): unit tests that map a class node in each phase (pending entries, ready to start, in ring, needs closeout, closed) to the exact chip label and **exact href**, written red first; a render test on the real `mapEntries` shape proving the counts reach the row (last-hop drop lesson); exhibitor Overview shows no chips or breakdowns; offline reload still renders counts and chips.

## Phase 3 — Remove the Show Map view from Setup ([MYK9-944](https://linear.app/myk9-platform/issue/MYK9-944))

1. **Walk first (decision gate).** As `secretary@myk9t.com` on a seeded show, open Setup → Show Map and record anything it shows that the schedule (after Phases 1–2), Entries or Class details cannot: the "all exhibitors" by-dog branch and the day/completion filters are the candidates. If something has no other home, name where it moves before deleting. Default: delete.
2. Remove `'map'` from `SETUP_SECTIONS`; `?section=map` and the legacy `?tab=map` redirect to Overview.
3. Delete `ShowMapTab` and the parts of `features/show-map/` that only it uses. **Keep** everything the Show Day cockpit imports (`showMapTree`, `showMapActions`, `showDeskPendingSignals`, dialogs used by `ShowDeskPanel`, …). Prove each deletion with a grep (code **and** `*.md`) and a green typecheck, not by name.
4. Drop `canShowMap` / `map*` outlet props if nothing else reads them (Phase 2 may now be their reader; check).

Acceptance: Setup shows two views (Trials, Classes) with a render test asserting it (red on `main`); `?section=map` and `?tab=map` land on Overview; typecheck, lint and suite green; e2e specs that opened the map updated.

## Phase 4 — Decide Setup's future (after MYK9-898) ([MYK9-945](https://linear.app/myk9-platform/issue/MYK9-945))

Not code. After the real-secretary observation (MYK9-898) runs, review: did she start work from the schedule? Did she find Setup → Classes from the schedule's "Manage classes" link, or from the tab? If the tab is unused, propose folding Trials and Classes somewhere else (e.g. reached only from the schedule) as a new plan; if it is used, close this question. Filed as a follow-up under MYK9-897.

## Testing (every phase)

- Unit + render tests per phase, run shuffled (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`. `CompactScheduleTimeline.tsx` is ~275 lines; put the chip, breakdown and trial-header links in sibling modules rather than growing it past 500.
- Browser walk as `secretary@myk9t.com` at 1440px and 375px: follow every new link and chip type and confirm the landing page is pre-filtered to that trial/class; confirm an exhibitor's Overview is unchanged.

## Non-goals

- No dog/entry lists, approve/reject, scratch, move-up, scoring, judge assignment or bulk actions on Overview.
- No change to Setup → Trials / Classes, the Show Day cockpit, Entries or Class details beyond receiving deep links they already support.
- No new next-action rules; Overview only reads the existing one.
- Not deleting the Setup tab (see Phase 4).
