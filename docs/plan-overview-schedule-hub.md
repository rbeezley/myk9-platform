# Overview Schedule as the Secretary's Hub — merge Setup, add next-step chips

> **Status:** Active

**Linear:** _to file_ (one issue per phase below) · **Date:** 2026-10-02 · **Supersedes in part:** [`plan-secretary-show-actions.md`](plan-secretary-show-actions.md) § "Phase 2 — one row of six tabs" (Setup is removed; the row becomes five tabs)
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary ("That was easy" — _absorb complexity, not add to it_) and [`archive/plan-show-map-workbench-collapse.md`](archive/plan-show-map-workbench-collapse.md) (the precedent for deleting a surface instead of rearranging it).

## Goal

The secretary should be able to start almost any job for a show from **one place**: the Show schedule on the Overview tab. Fewer tab switches, no hunting for the right filter.

The rule that keeps this simple: **the schedule is where work starts, not where it happens.** Every row says _is this OK, and what's next?_. One tap lands on the existing page that does the job, already filtered to that trial or class.

### The test for anything added to the schedule

A **status**, a **count** or a **link** → belongs on the schedule.
A **form**, a **list of dogs**, or a **destructive/mutating action** → belongs on the destination page, reached by a link.

The one existing exception stays: the inline class start-time editor (`ClassStartTimeEditor`), which is already on Overview for managers.

## Duplication question (CLAUDE.md § consolidate)

_Does this duplicate an existing page?_ No. It **removes** one (Setup) and adds only links into Entries, Show Day and Class details. No entry list, approval, scratch or scoring UI is rebuilt on Overview. The next-step chip reuses the Show Day cockpit's action rule (`getPrimaryActionForNode` in `features/show-map/showMapActions.ts`), so there is one rule for "what's next for this class", not two.

## Current state (verified 2026-10-02)

| Surface                  | File                                                         | What it gives a secretary                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview → Show schedule | `components/schedule/CompactScheduleTimeline.tsx`            | Collapsible trials → class rows with status, judge, time, **total** entry count; class row opens Class details; "View trial details"; inline start-time edit; **caps at 6 classes per trial** |
| Setup → Trials           | `components/shows/tabs/TrialsTab.tsx`                        | Trial cards/table, status filter, per-trial stats, **Add Trial** (wizard `mode=add-trials`)                                                                                                   |
| Setup → Classes          | `components/shows/tabs/ClassesTab.tsx`                       | Flat sortable class table, filters, **Add Classes** (wizard `mode=add-classes`)                                                                                                               |
| Setup → Show Map         | `features/show-map/ShowMapTab.tsx` (`canManageShow={false}`) | View-only tree down to dogs/entries, "all exhibitors" branch, day/completion filters, Running-now strip, totals. **Its only mount is Setup.**                                                 |
| Show Day cockpit         | `features/show-map/cockpit/*`                                | Per-class attention + primary actions, `?focus=<classId>` deep link                                                                                                                           |
| Entries deep links       | `features/entry-operations/entryAttentionRoutes.ts`          | `getClassReviewHref`, `getClassMissingInformationHref`, `getClassPaymentDueHref`, `getClassDayOfHref`, `getEntryManagementHref({ trialId, classId, … })`                                      |

Things that point at Setup today and must be retargeted: `?tab=classes` link in `CompactScheduleTimeline` ("View N more classes"), `LEGACY_SHOW_TAB_PARAM_REDIRECTS` (`map`, `trials`, `classes`), `getShowMapTrialScheduleHref` in `features/show-map/showMapRoutes.ts`, `routes/showRouteRedirects.tsx` default `'setup'`, the sidebar link, and e2e specs that open `/setup`.

`ShowOverviewTab` is shared with exhibitors and the public. Everything added below is **manager-only** (`canManageShow`).

## Phase 0 — confirm the data before building (no code)

1. Confirm the Overview index route receives the same outlet context as Setup (`mapTrials`, `mapClasses`, `mapEntries`, `entryDataState`). If not, decide whether Overview reads it from the outlet or from replicated tables. **No new direct PostgREST reads**; the schedule's own read already goes through `withReplicationFallback`.
2. Confirm the per-class entry breakdown (entered / pending / waitlist / scratched) can be computed from `mapEntries` with the same status buckets Entries uses (see memory: `paid` and `promotion-expired` count as **pending**). Name the helper that already does this, or the one to extract. Do not invent a third bucketing.
3. Walk Setup → Show Map as `secretary@myk9t.com` and record whether the "all exhibitors" branch or the day/completion filters do anything the Entries tab can't. **Decision gate:** if yes, list what moves where before Phase 2; if no, Phase 2 deletes them.

## Phase 1 — Overview absorbs Setup's structural actions

- Schedule header (manager-only): **Add Trial** button → `/secretary/create-show/wizard?showId=…&mode=add-trials`.
- Each trial group (manager-only): **Add classes** link → `…&mode=add-classes` (pass the trial id if the wizard accepts one; check before assuming).
- Empty state (no trials): the same "Add Trial" call to action Setup's Trials view shows today.
- Remove the 6-class cap for managers (or raise it so a real trial never truncates), and delete the `?tab=classes` "View N more" link. A collapsed trial already keeps the page short.
- Trial header gains the trial's total entry count next to its class count.

Acceptance: a manager can add a trial and add classes without leaving Overview's schedule; no class is hidden behind a link; exhibitor/public Overview renders unchanged (render test for both roles).

## Phase 2 — delete Setup

- Remove `'setup'` from `SHOW_TAB_IDS` / `SHOW_TABS` (five tabs: Overview · Entries · Show Day · Results · Reports).
- `/shows/:id/setup` and the legacy `?tab=map|trials|classes` params redirect to `/shows/:id` (Overview). Add `setup` to `LEGACY_SHOW_SECTION_REDIRECTS`-style handling so bookmarks never 404.
- Retarget `getShowMapTrialScheduleHref`, the sidebar link and the `showRouteRedirects.tsx` default.
- Delete `pages/secretary/ShowWorkbenchSetupPage.tsx` and `showSetupSections.ts`. Delete `TrialsTab` / `ClassesTab` **only if** nothing else imports them (grep, including `*.md`).
- `ShowMapTab` loses its only mount. Delete it and the parts of `features/show-map/` that only it uses. **Keep** everything the Show Day cockpit imports (`showMapTree`, `showMapActions`, `showDeskPendingSignals`, dialogs used by `ShowDeskPanel`, etc.). Prove each deletion with a grep and a green typecheck, not by name.
- Update `plan-secretary-show-actions.md` (six → five tabs) and the docs-site guides that mention Setup.

Acceptance: a render test asserts exactly five tab triggers for a manager (red on `main`); every old Setup URL lands on Overview; `pnpm typecheck`, lint and the app suite green; e2e specs that visited `/setup` updated.

## Phase 3 — status and one next-step chip per class

Each class row (manager-only) shows:

- **Entry breakdown** from Phase 0 step 2, e.g. `18 entered · 2 pending · 1 waitlist`. Counts only, never names.
- **At most one next-step chip**, chosen by `getPrimaryActionForNode` on the class node, so Overview and the Show Day cockpit always agree. The chip is always a **link**:
  - action has an `href` → link straight to it (e.g. pending entries → `getClassReviewHref`, missing info → `getClassMissingInformationHref`, payment due → `getClassPaymentDueHref`);
  - action is a mutation (e.g. `mark-class-started`, scratch, move-up) → link to Show Day with `?focus=<classId>` so the mutation happens in the cockpit, with its confirm dialog;
  - no action → no chip (the status badge says enough).
- Trial header: one rollup, e.g. `3 classes need attention`, linking to Show Day `?filter=needs-attention&day=<date>` (or to Entries filtered by trial before show day; reuse whichever attention source the cockpit uses).

Acceptance (assertion-first): unit tests that map a class node in each phase (pending entries, ready to start, in ring, needs closeout, closed) to the exact chip label and **exact href**, written red first; a render test on the real `mapEntries` shape proving the counts reach the row (last-hop drop lesson); exhibitor Overview shows no chips or breakdowns.

## Phase 4 — verification

- Unit + render tests from each phase, run shuffled (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet` (`CompactScheduleTimeline.tsx` is 275 lines; extract the chip and breakdown into sibling modules rather than growing it past 500).
- Browser walk as `secretary@myk9t.com` on the Heartland seeded show at 1440px and 375px: add a trial, add classes, follow each chip type and confirm the landing page is pre-filtered to that class; confirm `/setup` and `?tab=classes` redirect; confirm an exhibitor's Overview is unchanged.
- Offline check: load Overview, go offline, reload. The schedule, counts and chips still render from replicated data.

## Non-goals

- No dog/entry lists, approve/reject, scratch, move-up or scoring on Overview.
- No change to the Show Day cockpit, Entries tab or Class details beyond receiving deep links they already support.
- No new next-action rules; Overview only reads the existing one.

## Open questions

1. Phase 0 step 3: keep anything from the Show Map ("all exhibitors" branch, day/completion filters)? Default: delete.
2. Should the per-class chip also appear for club admins without secretary appointment? Default: follow `canManageShow` as Overview does today.
