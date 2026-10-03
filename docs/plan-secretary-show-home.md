# Secretary Show Home — one page for Overview, Show Day and Setup

> **Status:** Active

**Linear:** to file, one issue per phase (see § Issues) · **Date:** 2026-10-02 · **Design:** [canvas, layout A](https://claude.ai/artifact/9zhKyepfGi62eaV1EvkgPJ) (private; boards "A · Secretary home", "A · Tools open", "A · Select classes")
**Supersedes:** [`plan-overview-schedule-hub.md`](plan-overview-schedule-hub.md) § Phases 3–4 (MYK9-944, MYK9-945) and MYK9-951.
**Read first:** [`INTENT.md`](INTENT.md) § Trial Secretary ("That was easy" — _absorb complexity, not add to it_) and [`plan-secretary-crud-consolidation.md`](plan-secretary-crud-consolidation.md) (MYK9-897).

## Timing — every phase ships before the first club test show

**Owner decision, 2026-10-02:** all phases land before the first club-run test show (planned for Oct 10, 2026; the date may slip). This reverses the earlier "after the show" sequencing and overrides the pre-show secretary-page freeze for this work. Consequences:

- Phase 0 decisions are needed immediately. Item 4 can no longer wait for the show; it uses the dress rehearsal or the owner's judgment.
- Phases ship in order (1 → 2 → 3 → 4), one PR each, with the review floor `pnpm qa:review-tier` reports. Phases 2 and 4 touch the show-day page and need offline-reload proof before merge.
- The dress rehearsal runs on the new home, not on Show Day, so it doubles as Phase 5's first pass.
- If the show date holds and a phase is not solid by the rehearsal, the owner decides whether to ship it or hold it. Show Day stays live until Phase 4, so holding Phase 4 leaves a working fallback.

## Goal

The secretary (and the club admins and site admins who can manage the show) gets **one view of the show before, during and after it**, instead of three tabs that each hold part of the picture. The owner chose layout A on 2026-10-02: a day-filtered schedule on the left, the selected class on the right with its checklist and actions, a "Needs attention" strip on top, and a slim Tools drawer.

Tabs today: **Overview · Setup · Entries · Show Day · Results · Reports**. Tabs after: **Overview · Entries · Results · Reports**.

Exhibitors and the public keep today's Overview unchanged (show info, schedule, judges, venue). Only the people who can manage the show see the new home.

### Who sees what

"Can manage the show" is `useShowManageScope(showId).canManage`: the show's trial secretary, club admins of the owning club, site admins. The narrower `canOperate` (secretary or site admin) still gates the operational tools — run sheet, show-wide entries read, mail-in entry — exactly as on Show Day today. A club admin sees the same home with those controls disabled and the existing one-line reason.

## Duplication question (CLAUDE.md § consolidate)

This plan **deletes** two tabs (Show Day, Setup) and one duplicate schedule. The Overview schedule and the Show Day cockpit schedule are two renderings of the same trials and classes with different rules; Access codes appear on both pages; Setup → Classes duplicates class editing that the class panel will own. Nothing new is built that does not replace an existing surface.

## What exists today (verified 2026-10-02)

| Today                                                                                                    | Where                                                                                                                             | Becomes                                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Overview schedule (all days, launcher links, entry breakdown)                                            | `components/schedule/CompactScheduleTimeline.tsx`                                                                                 | Replaced for managers by the cockpit schedule; kept for exhibitors/public |
| Show Day cockpit: day picker, filters, attention, focused class, checklist                               | `pages/secretary/ShowWorkbenchShowDeskPage.tsx` (540 lines), `features/show-map/ShowDeskPanel.tsx`, `features/show-map/cockpit/*` | The manager Overview                                                      |
| Show Day Tools sheet (11 tools)                                                                          | `ShowWorkbenchShowDeskPage.tsx` tools list, `features/show-map/ShowDeskToolsSheet.tsx`                                            | Tools drawer with 2 groups (Phase 1)                                      |
| Setup → Trials (Add Trial, row Edit/Delete)                                                              | `components/shows/tabs/TrialsTab.tsx`                                                                                             | Trial heading actions in the schedule                                     |
| Setup → Classes = Class Management (judge assignment, bulk status, bulk delete, export, row Edit/Delete) | `components/shows/tabs/ClassesTab.tsx`, `ClassBulkActionsBar`                                                                     | "Edit class" on the class panel + "Select classes" bulk mode              |
| Setup → Show Map (view-only)                                                                             | `features/show-map/ShowMapTab.tsx`                                                                                                | Deleted (absorbs MYK9-944)                                                |
| Class checklist (MYK9-948)                                                                               | `features/show-map/cockpit/classChecklist.ts`, `ClassChecklistSection.tsx`                                                        | Unchanged; now on the home page                                           |
| Entry breakdown (MYK9-943)                                                                               | `features/entry-operations/classEntryBreakdown.ts`                                                                                | Reused in the home schedule rows                                          |

## Phases

Each phase is its own PR and leaves the app shippable. Show Day stays reachable until Phase 4, so show-day behavior never depends on an unfinished merge.

### Phase 0 — Decisions (done, owner 2026-10-02, MYK9-953)

1. **Tools moves:** as in the Phase 1 table (Show closeout to Results step 3; the emergency trial packet stays in Tools → Show day).
2. **Day picker default:** today on a show day; the first show day before the show; the last show day after it.
3. **Quiet mode:** hide the "now" marker and the "starts in N minutes" preparation reminders unless the selected day is today.
4. **Usage audit:** a used/unused checklist of the Show Day tools and filters, ticked at the Oct 6 dress rehearsal (first pass) and the Oct 10 show (second pass). Anything unused is a deletion candidate, not a migration; nothing is deleted without the owner's yes.
5. **MYK9-898:** retarget the real-secretary observation at the new home instead of the Setup row menus Phase 3 removes, update its task list to match, and run it at the Oct 10 show (Phase 5, MYK9-958).

### Phase 1 — Slim the Tools (shippable on today's Show Day)

Owner decisions 2026-10-02 (MYK9-953 decision 1):

| Tool                                                                | Move to                                 | Notes                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| People at show, Self check-in, Access codes, Emergency trial packet | **Tools → Show day**                    | Remove the duplicate Access codes card from Overview (`ShowAccessCodesCard` in `ShowOverviewTab`) for managers. The packet keeps its own prepare-and-confirm flow; whether it moves to Reports is MYK9-959 |
| Volunteers, Judge hospitality, Tasks and notes, Incident log        | **Tools → Show logistics**              | —                                                                                                                                                                                                          |
| Add entries                                                         | **Entries** tab                         | Verify Entries already offers the same three doors (own dog, someone else's, late entry); add only what is missing                                                                                         |
| Show closeout                                                       | **Results, step 3 "Close the show"**    | After Review & release and Submit to registry (`ShowResultsSection.tsx`). Mount `ShowCloseoutSummary` + `CloseOutShowAction` unchanged; drop its three shortcut buttons                                    |
| Schedule slip script                                                | The class panel's expected-start change | Offer the wording where the time is changed                                                                                                                                                                |

Acceptance: Tools shows exactly two groups (render test, red on `main`); Results shows three steps with a deep link to Close the show; each moved tool is reachable from its new home with a test; no tool is lost (inventory test listing all 11 and their homes); browser walk as `secretary@myk9t.com`.

### Phase 2 — The home: Show Day's cockpit becomes the manager Overview

1. **Extract the assembly.** Move the data assembly from `ShowWorkbenchShowDeskPage.tsx` + `ShowDeskPanel.tsx` (entries query + availability, class summaries with tallies, tree, pending signals, paperwork prints, snapshot, model) into one hook, e.g. `useSecretaryShowHome(showId)`. Show Day keeps working by calling the same hook — a refactor with no behavior change, proven by the existing cockpit and Show Day tests passing unchanged. This is the shared hook MYK9-951 asked for.
2. **Mount it on Overview for managers.** `ShowManagementShell` renders the cockpit layout (attention strip, day-filtered schedule, selected-class panel with the checklist) where it renders `ShowOverviewTab` today, when `canManage`. Exhibitor/public paths (`ShowDetailTabs`) are untouched.
3. **Rows gain the entry breakdown** (`buildClassEntryBreakdowns`) and the checklist count (`summarizeClassChecklist`) from the same assembly, so the row count and the panel can never disagree.
4. **Collapsible trials (owner, 2026-10-02).** Keep today's Overview pattern: each trial is a collapsible group (chevron, trial name, date and start, `N classes · N entries` pill). Day chips **All days · each show day** filter the groups. The default is All days, with the selected day's trials open and the others collapsed (the day comes from Phase 0 decision 2).
5. **Quiet mode** per Phase 0 decision 3.
6. **About this show**: one folded card (venue, judges, registry, Edit show, Share) and a "View as exhibitor" link.

Show Day still exists in this phase (same hook), so a regression can be compared side by side.

Acceptance: assertion-first tests for the day-default rule and quiet mode; a render test proving the manager Overview shows the cockpit and an exhibitor's Overview is unchanged (red on `main`); the full cockpit suite passes untouched after the extraction; offline reload of the manager Overview renders the schedule, counts and checklist (this also closes MYK9-948's open offline criterion); browser walk at 1440 and 375px before the show, on a show day and after.

### Phase 3 — Setup folds into the home

- **Trial headings** in the schedule: "+ Add Classes" (`getAddClassesHref`), "Edit trial" (`TrialEditPanel`), ⋯ → Delete (existing delete dialog). "+ Add Trial" in the schedule header (`getAddTrialsHref`).
- **Class panel**: "Edit class" (`ClassEditPanel`), ⋯ → Class details, Delete (existing dialog).
- **"Select classes" mode**: checkboxes on rows and trial headings; the existing `ClassBulkActionsBar` actions (assign judge, change status, export, delete) with the same one-trial-at-a-time rule ClassesTab enforces today. "Done" leaves the mode.
- Reuse every existing panel, dialog and bulk handler. No new forms.

Acceptance: every Setup capability is reachable from the home (a checklist test enumerating Setup → Trials and Setup → Classes actions against their new homes); the bulk actions keep their existing tests; walk.

### Phase 4 — Delete Show Day and Setup tabs

- `SHOW_TABS` → Overview · Entries · Results · Reports (render test asserting exactly four, red on `main`).
- Redirects (bookmarks never 404):
  - `/shows/:id/show-day` → `/shows/:id`, **carrying `day`, `filter`, `focus`, `anchor`** (cockpit URL state).
  - `/shows/:id/show-desk` (legacy) → same.
  - `/shows/:id/setup` → `/shows/:id`; `?section=classes` → `/shows/:id?select=classes` (opens Select classes); `?section=trials|map` → `/shows/:id`; keep `trialId`.
  - `classes/:trialId` and `classes/:trialId/create` legacy routes retargeted from Setup to the home.
  - `?tab=map|trials|classes` legacy params → the home.
- Retarget every in-app link: `getSetupClassesHref`, `getShowDeskHref`, `getShowMapTrialScheduleHref`, the sidebar's show context entry (`unifiedSidebarConfig.ts`), the header Actions registry, cockpit `returnTo` values, e2e specs.
- Delete `ShowWorkbenchSetupPage`, `showSetupSections`, `ShowMapTab` and Show-Map-only modules, `ShowWorkbenchShowDeskPage` page shell; the compact Overview schedule stays for exhibitors. Prove each deletion by grep (code **and** `*.md`) and typecheck.

Acceptance: redirect table tested route by route; no remaining link to `/show-day` or `/setup` outside the redirect map (a test that greps built routes, plus a link-crawl e2e on the secretary home); typecheck, lint, full suite, e2e green.

### Phase 5 — Verify with a real secretary

Re-run the MYK9-898 observation (or its successor) on the new home: before-the-show tasks (review entries, print sheets, fix a class), a show-day pass (start, score, wrap up), and an after-show pass (results, closeout). Anything she trips on becomes an issue under this plan.

## Risks

- **Show-day reliability.** Phase 2 refactors the cockpit's data assembly. Mitigation: extraction first with zero behavior change and the existing suite as the guard; Show Day stays live until Phase 4; offline reload is an acceptance criterion.
- **Density before the show.** The cockpit was built for the day itself. Mitigation: Phase 0 quiet-mode decision; the walk covers a pre-show day.
- **Club admins.** They gain the home but not operational tools; keep `canOperate` gating and the existing disabled-with-reason pattern.
- **Bookmarks and returnTo links** to `/show-day` and `/setup`: the redirect table must carry the cockpit's URL state.
- **In-flight plans.** MYK9-897's observation (MYK9-898) measures Setup; sequence per Phase 0.5.

## Issues

| Phase | Action                                                                                  |
| ----- | --------------------------------------------------------------------------------------- |
| 0     | New: owner decisions (Tools moves, day default, quiet mode, MYK9-898 sequencing)        |
| 1     | New: slim Tools to two groups                                                           |
| 2     | New: secretary home on Overview (supersedes **MYK9-951**, which closes as replaced)     |
| 3     | New: fold Setup into the home (answers **MYK9-945**, which closes)                      |
| 4     | New: delete Show Day and Setup tabs with redirects (absorbs **MYK9-944**, which closes) |
| 5     | Retarget or follow **MYK9-898**                                                         |

MYK9-948 stays In Progress until its offline-reload criterion is met (Phase 2 covers it if not done sooner after the next deploy).

## Testing (every phase)

- Assertion-first unit tests for any new rule (day default, quiet mode, redirect mapping); render tests on the real data shapes; shuffled suite (`pnpm vitest run --sequence.shuffle`).
- `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet` (`ShowManagementShell.tsx` is ~470 lines and `ShowWorkbenchShowDeskPage.tsx` 540: extract, don't grow).
- Browser walks as `secretary@myk9t.com` at 1440 and 375px, plus an exhibitor walk confirming their Overview is unchanged; offline reload on the manager home.
- Review floor per `pnpm qa:review-tier` (expect adversarial or independent for Phases 2 and 4).

## Non-goals

- No change to Entries, Results or Reports beyond receiving the moved tools.
- No new reports, no combined one-click printing (separate idea).
- No change to the exhibitor or public show page.
