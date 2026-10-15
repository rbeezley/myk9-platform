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

## Phases

Each phase ships on its own; stopping after any phase leaves a coherent app.

1. **Shows list with a detail pane.** `/shows` list on the left, `/shows/:id` on the right from `lg`. Upcoming / Past grouping, managed shows pinned. Replace the single `nextShow` sidebar link once the list covers it.
2. **One browse pane.** Shows / Dogs / People / Clubs tabs over a shared list pane; Clubs moves to a detail pane too. Delete the sidebar "Browse" group.
3. **Labeled icon rail.** The remaining sidebar items (Show Management, Ringside, My Entries, My Club items, Admin, Help, account) render as icon plus label at about 64px. Admin's long list may need a grouped "Admin" rail item that opens its own sub-list; decide when the item count is measured.

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

## Non-goals

- No show, trial, class, entry tree in the browse pane.
- No hover-only labels or icon-only rail.
- No new routes, and no change to detail-view content or permissions.
