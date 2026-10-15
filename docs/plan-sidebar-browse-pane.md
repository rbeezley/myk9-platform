# Sidebar: Labeled Icon Rail and Browse Pane

> **Status:** Active

## Goal

Make navigation simpler by turning the app into three columns on wide screens: a narrow labeled icon rail, one browse list pane, and the detail pane. A secretary can then find any of their shows from the list, not just the next one.

Follows on from [`plan-master-detail-lists.md`](plan-master-detail-lists.md) (People and Dogs already use list left, detail right).

## Problem

- The sidebar's Manage group links "Show Management" plus only `nextShow` (`components/layout/sidebar/unifiedSidebarConfig.ts`). A secretary with several shows has to go through the dashboard to reach the others.
- Shows, Dogs, People and Clubs are four separate sidebar items under "Browse", each opening its own page. Shows and Clubs still hop to a separate detail page.

## Duplication question

Does this duplicate an existing page? No. It removes the "Browse" sidebar group and reuses the existing list pages, `MasterDetailLayout`, `CompactRecordList` and detail views. No new routes.

## Design

```
| rail (~64px)  | browse pane                    | detail                |
| icon + label  | [Shows][Dogs][People][Clubs]   | route-driven detail   |
|  Home         | search                         | (/shows/:id,          |
|  Ringside     | Upcoming                       |  /dogs/:id, ...)      |
|  My Entries   |   My show A  (pinned first)    |                       |
|  Members      |   Show B                       |                       |
|  Help         | Past                           |                       |
|  account      |   Show C                       |                       |
```

- **Rail: Slack/Teams style.** Every item is an icon with a short label under it, always visible. No hover-only labels: touch devices (ringside tablets) have no hover, and the audience reads labels rather than exploring icons. `RoleSidebar` already has a collapsed icon-rail mode with hover `title`s; this replaces that presentation, it does not add a second one.
- **Browse pane tabs.** A segmented switch above one list: Shows, Dogs, People, Clubs. Each tab is the existing list for that route, and the tab reflects the URL (`/shows`, `/dogs`, ...). Role gating is unchanged: tabs a role cannot see today stay hidden.
- **Shows list.** Grouped Upcoming / Past, with shows the viewer manages pinned to the top of Upcoming. Builds on the existing role tabs in `utils/unified-shows-config.ts` (Managing, My Assignments, Browse All); reconcile those tabs with the grouping rather than stacking both.
- **Hierarchy stops at the show.** Clicking a show opens the show page in the detail pane. Trials, classes and entries are not nested in the list: `SecretaryCockpit` already shows trial and class on the left with the focused class on the right, and the Entries tab is already a list with a detail pane (see "Decision: show-day hierarchy" in the master-detail plan).
- **Narrow screens** keep today's behavior: the mobile drawer, and tapping a row opens a separate page.
- **[ADDED] Show-day shortcut is not lost.** Removing the `nextShow` link must not cost a secretary the one-click route to today's show. The Shows list gets a **Today** group above Upcoming (a show whose dates include the current show-timezone day), and Ringside stays a rail item. Show-day reliability is the launch priority, so this lands in the same PR that removes the link.
- **[ADDED] The show page is too wide to embed blindly.** `/shows/:id` carries the pinned `ShowHeader` (sticky offsets measured from the app header, `--show-header-h`), a tab strip, and `SecretaryCockpit`, whose split only appears at `xl` (1280px). Squeezed beside a list, a 1440px window leaves it under 1280px and the cockpit collapses to one column. Phase 1 therefore starts with a measured spike (below) and only then picks one of: (a) embed the show page in the detail pane, (b) collapse the list pane automatically while a show is open, with a visible "Shows" control to bring it back, the remembered choice per user. Default to (b) if the spike shows any management tab losing its split or sticky behavior.
- **[ADDED] Data source and offline.** The Shows tab reads through the same hook as today (`useBrowseShowsData`); no direct Supabase reads are added. The list must render from cached or replicated data when offline, and a secretary already inside a show must never lose that show's page because the list pane failed to load.
- **[ADDED] States.** Every tab has loading (skeleton rows), error (inline message with Retry; the detail pane keeps working), and empty states written per role: a secretary with no shows sees a link to Show Management, an exhibitor with no entries sees "Find a show", a search with no match says so and offers to clear it.
- **[ADDED] Multi-role users.** A user who is secretary, judge and exhibitor sees one Shows list: Today, Upcoming and Past, each with shows they manage first, then shows they judge, then shows they entered, with a small role tag on each row. Browse All (shows they have no part in) moves behind the same "Find a show" button exhibitors get. This replaces the Managing / My Assignments / Browse All tabs in `utils/unified-shows-config.ts` rather than stacking a second axis on top.
- **[ADDED] Accessibility.** The tabs are a real `tablist` (arrow keys move between tabs, the URL follows the selection); rail items are links with `aria-current="page"`; the visible label is the accessible name, never an icon alone; the list pane keeps its scroll position and focus when the detail pane changes.
- **[ADDED] Size and widths.** Rail about 64px, the list pane uses `MasterDetailLayout`'s persisted, draggable split. At 1024px (the `lg` floor) the three columns must still leave the detail pane at least 600px; if not, the list pane collapses as in (b). Long lists (site admin's Browse All, a large Dogs roster) use the existing list toolkit's paging or virtualization; the plan adds no unbounded render.

## Phases

Each phase ships on its own; stopping after any phase leaves a coherent app.

1. **Shows list with a detail pane.** `/shows` list on the left, `/shows/:id` on the right from `lg`. Today / Upcoming / Past grouping, managed shows pinned. Replace the single `nextShow` sidebar link once the list covers it.
   - **[ADDED] Spike first.** In the browser at 1024, 1280 and 1440px, open every show management tab (Overview cockpit, Entries, Schedule, Results) inside the detail pane and record whether the cockpit split, pinned header and sticky entry pane still work. Write the result and the (a)/(b) decision into this plan before building.
2. **One browse pane.** Shows / Dogs / People / Clubs tabs over a shared list pane; Clubs moves to a detail pane too. Delete the sidebar "Browse" group.
3. **Labeled icon rail.** The remaining sidebar items (Show Management, Ringside, My Entries, My Club items, Admin, Help, account) render as icon plus label at about 64px. Admin's long list may need a grouped "Admin" rail item that opens its own sub-list; decide when the item count is measured.
   - **[EXPANDED] Labels.** Each rail label is one or two short words (for example "Payments", not "My Payments"); a label that does not fit in two lines is renamed, never truncated. Count the rail per role combination before building: if any combination exceeds about eight items, group the lowest-use ones (the Admin pages first) under one item.

4. **Exhibitor-only users.** Two tabs, My Shows and My Dogs (exhibitors never see People or Clubs). My Shows lists the shows they entered, grouped Upcoming / Past; the detail pane is their entries for that show (dogs, classes, run order, receipts, withdraw). A "Find a show" button at the top of the list replaces the separate Find Shows item. Rail: My Shows, My Dogs, Payments, Show Day, Help, account.
   - **Duplication:** `/exhibitor/entries` (My Shows today) already groups entries by show. This phase _replaces_ that page's layout with the list and detail panes; it must not add a second copy. Carry over the Show Today banner, receipts and payment status, and keep the route so links and bookmarks still land.
   - Ships after phase 1 so the entries-page merge gets its own review. Mobile stays as it is today (menu drawer, full-page taps); most exhibitors are on phones, so this is mainly a desktop change.

## Testing

A phase is not complete until these pass:

- Unit: Shows grouping (upcoming vs past on the show-timezone calendar day, managed shows pinned, empty groups hidden); tab visibility per role.
- Component: the rail renders a visible label for every item at every width from `md`; detail renders in the pane on the real prop shape.
- E2E (Playwright, own session per CLAUDE.md): a secretary with several shows finds a past show from `/shows` at 1440px; switching tabs keeps the URL in sync and back returns to the previous tab; at 800px a row tap is a full page hop.
- Exhibitor (phase 4): an exhibitor-only account sees exactly My Shows and My Dogs tabs; selecting an entered show shows only their own entries; the Show Today banner, receipts and payment status still render; `/exhibitor/entries` still resolves.
- Real-data check: run the Shows grouping against the live shows list before shipping (the class-label lesson).
- Shuffled full-suite run before pushing (`pnpm vitest run --sequence.shuffle`).
- Read `docs/INTENT.md` for secretary, exhibitor and club-admin before each phase.
- **[ADDED]** States: loading, error with Retry, and each per-role empty state render; a failed list load leaves an open show's detail pane usable.
- **[ADDED]** Offline: with the network off, a secretary who opened a show earlier still sees it in the Shows list and can open it.
- **[ADDED]** Today group: a multi-day show is in Today on each of its days in the show's timezone, including just after midnight UTC.
- **[ADDED]** Accessibility: arrow keys move between tabs and update the URL; every rail item has a visible label as its accessible name; `aria-current` marks the active one.
- **[ADDED]** Spike result recorded (phase 1) and the cockpit split still appears in whichever layout was chosen at 1440px.
- **[ADDED]** Before each phase, grep `apps/myk9show/e2e/` and the guides (`apps/docs`) for the sidebar labels it changes ("Browse", "Find Shows", "My Shows", "Show Management"); update locators and guide text in the same PR, and list stale guide screenshots for `screenshot-docs`.

## [ADDED] Rollout and rollback

- One PR per phase. No migrations, no data changes, no new routes, so any phase reverts with a single `git revert` and a Deploy myK9Show run.
- Deploy each phase on a non-show day; do not ship navigation changes during a weekend with a live club show.
- Watch Sentry for new errors on `/shows`, `/dogs`, `/people`, `/clubs` and `/exhibitor/entries` for a day after each deploy.

## Non-goals

- No show, trial, class, entry tree in the browse pane.
- No hover-only labels or icon-only rail.
- No new routes, and no change to detail-view content or permissions.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: changes the app shell and navigation for every role, touches more than three production files, and the Shows list sits in the show-day path, so every phase needs the full suite plus a browser walk.
