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

1. **Labeled icon rail.** _[REORDERED 2026-10-15: was phase 3.]_ Every sidebar item renders as icon plus label at about 64px. The Browse items (Shows, Dogs, People, Clubs) stay as rail items until phase 3 merges them into tabs. Admin's long list may need a grouped "Admin" rail item that opens its own sub-list; decide when the item count is measured.
   - **[EXPANDED] Labels.** Each rail label is one or two short words (for example "Payments", not "My Payments"); a label that does not fit in two lines is renamed, never truncated. Count the rail per role combination before building: if any combination exceeds about eight items, group the lowest-use ones (the Admin pages first) under one item.
   - **Why first.** The spike measured the end state (64px rail + 320px list replacing the 240px sidebar). Shipped before the rail, the Shows list would sit beside the full sidebar and leave the show 880px at a 1440 window and 720px at 1280, where the cockpit still splits and the schedule gets about 340px. The rail first gives every page 176px back and lets the Shows list land at the measured widths.
   - **Built (MYK9-1214).** The rail is 88px, not 64: labels use `text-xs`, the app's 14px floor (`docs/INTENT.md`), and words like "Ringside" need that width at 14px. It returns 152px to every page (1440 window: 1200 → 1352px of content). The panels cap their height at the space available and scroll (all ten Admin destinations reachable at 1280×600). The phase 2 spike widths assumed a 64px rail; with 88px the show in the pane is 24px narrower than measured, still above the cockpit's split floor at 1280. Two groups fold into a labeled panel that opens on click: **My Club** (Our Shows, Members, Payments, Club Profile) and **Admin** (the admin pages plus Resources). Rail item counts, pinned in `railEntries.test.ts`:

     | Roles                                          | Before | Rail |
     | ---------------------------------------------- | ------ | ---- |
     | Exhibitor only                                 | 5      | 5    |
     | Judge only                                     | 3      | 3    |
     | Secretary + exhibitor                          | 8      | 7    |
     | Club admin + exhibitor                         | 8      | 5    |
     | Secretary + club admin + exhibitor             | 12     | 8    |
     | Site admin only                                | 10     | 1    |
     | Site admin + secretary, club admin, judge, exh | 22     | 9    |

     Renamed in the rail only (the drawer and the accessible name keep the full title): "Show Management" → **Manage** ("Management" was 21px wider than the rail). The counts include phase 2's removal of the next-show item (it was "Today's show / Next show / Draft show"). Phase 3 removes the four Browse items, leaving 4 and 5 for the two largest rows.

2. **Shows list with a detail pane.** _Requires phase 1 (rail); the decision below assumes it._ `/shows` list on the left, `/shows/:id` on the right from `lg`. Today / Upcoming / Past grouping, managed shows pinned. Replace the single `nextShow` sidebar link once the list covers it.
   - **[ADDED] Spike first.** In the browser at 1024, 1280 and 1440px, open every show management tab (Overview cockpit, Entries, Schedule, Results) inside the detail pane and record whether the cockpit split, pinned header and sticky entry pane still work. Write the result and the (a)/(b) decision into this plan before building.
   - **Spike result (2026-10-15, MYK9-1213).** Measured with Playwright as `secretary@myk9t.com` on Heartland Scent Work Week, every tab (Overview, Entry Forms, Results, Reports), with the main column narrowed by 384px (64px rail + 320px list) against today's 240px sidebar. A known-answer check (today's layout at 1440px must split) passed.

     | Window | Show width today | Show width in pane | Overview cockpit (schedule / focus) | Entry Forms two columns |
     | ------ | ---------------- | ------------------ | ----------------------------------- | ----------------------- |
     | 1440   | 1200             | 1056               | split, 671/481 → 588/420            | yes → yes               |
     | 1280   | 1040             | 896                | split, 579/413 → 488/360 (minimum)  | no → no                 |
     | 1024   | 784              | 640                | one column → one column             | no → no                 |

     No tab scrolled sideways at any width, and the pinned show header and tab strip stayed pinned after scrolling in every case. The pane costs only 144px, because the rail plus list replaces a 240px sidebar: at 1440 the show in the pane is about as wide as today's show at 1280. At 1024 the pane leaves 640px; nothing breaks, but the show header wraps to three rows, the title truncates and the entry-form table truncates its column headings.

     At the time the cockpit picked its split from the window width (`isSplitViewport`), not the width it is given, so at 1280 it split at its 360px minimum focus column: usable, but the floor. _[Superseded by MYK9-1216, below: the cockpit now splits on its own width.]_

   - **Decision: (a) from 1280, (b) below it.** _[SUPERSEDED by MYK9-1216, below: the fold now follows the measured width, not the window.]_ From a 1280px window the show page sits in the detail pane beside the list. Between 1024 and 1279 the list pane folds away automatically while a show is open, with a visible "Shows" button to bring it back, so the show keeps today's width there. The rule is the window width, matching the cockpit's own breakpoint, so the two never disagree.
   - **Follow-up built (MYK9-1216): the cockpit splits on its own width.** `SecretaryCockpit` measures its grid (`useElementWidth`) and splits from 868px (`cockpitSplit.ts`: the narrowest width whose 0.85fr share alone gives the focused class 360px), whatever the window. Measured with the 88px rail (headless Chromium, no scrollbar): full page it now splits at 1024 too (884px, focus 367; about 867px and stacked where a classic 17px scrollbar shows) and at 1280 (1140px, focus 476); beside a 320px list it is 552px at 1024 and 808px at 1280 (stacked), 968px at 1440 (split, focus 403). `ShowsMasterDetailPage` drops the window breakpoint: it measures its own split and folds the list from an open show wherever the cockpit beside a default-width list would stack (`showsPaneFold.ts`, 868 + 320 + 16px of handle and padding + 17px for a classic scrollbar = a 1221px split, about a 1357px window). So the list now folds at 1280 as well as 1024, where full width keeps the split; the viewer can still open it, and the cockpit beside it stacks instead of squeezing its schedule. As first built the rule was the same on every show tab, so at 1280 Entry Forms, Results and Reports open with the list folded too (#3054 had it beside them there). _[Since MYK9-1222 Entry Forms has its own, wider fold point, below; the owner accepted that the list then folds and returns as the secretary switches tabs between the two widths.]_ Where the list fits it offers no Hide: a list dragged wider than its default (up to 440px) narrows the show, and the cockpit stacks rather than squeeze until the list is dragged back. A remembered "hide even where it fits" was tried in review and removed, because it overrode the automatic fold on every other screen. **Per tab (MYK9-1222):** Entry Forms splits its queue and detail from `ENTRY_COCKPIT_COMPACT_WIDTH` (960px of its own width, inside 48px of page padding), so on that tab the list folds below a 1361px split (about a 1497px window); every other tab keeps Overview's 1221px. Between the two, the list folds on Entry Forms and returns on the other tabs. Because both widths are measured, the first frame is unmeasured: the pane mounts the show only once it has measured itself (before paint), so the show mounts once at its final width, and the cockpit scrolls a returning anchor once, only in its measured layout. Pinned by `cockpitSplit.test.ts` and `showsPaneFold.test.ts` (known answers from the browser) and `showsListPane.spec.ts` (real widths at 1024, 1280, 1440).
   - **Built (MYK9-1213).** `ShowsMasterDetailPage` is one layout route around `/shows` and `/shows/:id/*`, so the list stays mounted (scroll, search) while shows open. For signed-in staff (secretary, club admin, chairman, steward, site admin; an exhibitor or judge would only see Find Shows twice until phase 4) from `lg`: the list (`ShowsPaneList`, 320px, draggable 260 to 440) sits beside the route, which is Find Shows on `/shows` (kept whole: cards, table, calendar, map) and the show on `/shows/:id`. Wherever the cockpit beside the list would stack (`showsPaneFold.ts`; below about a 1357px window since MYK9-1216, about 1497px on Entry Forms since MYK9-1222, between `lg` and 1280 as first built), with a show open, the list folds behind a "Shows" button and the viewer's choice is remembered (`view-pref-shows-pane`). Signed-out visitors and windows under `lg` see no change. The list reads `useBrowseShowsList`, the shows half of `useBrowseShowsData` split out so a second caller adds none of Find Shows' entry and relationship side effects; it is the shows replica for an account, so it lists offline. Inside the pane the show page's sticky offsets read `--app-top-inset: 0px`, so the pinned header and tab strip pin to the pane's top. Groups are Today / Upcoming / Past on the show's own calendar day (its first trial's zone, `showsPaneGroups.ts`), shows the viewer is club staff for first, tagged "Managing"; a site admin manages everything, so nothing is singled out. The `nextShow` rail item is gone: today's show is the top of the Today group, one click after Shows. Under `lg` (tablet rail, phone drawer) there is no list, so today's show is Manage, then its card on the dashboard: also two taps. Folding and unfolding never remount the open show (`MasterDetailLayout`'s `listHidden` keeps the detail in one tree position), and the list sits inside its own error boundary. Real-data check (2026-10-15, 10 live shows): Today holds the Heartland week running Oct 14 to 20 (a Chicago show stored as UTC-midnight dates, read as its own calendar days); four in Past and five in Upcoming before RLS narrows them per viewer.
3. **One browse pane.** Shows / Dogs / People / Clubs tabs over a shared list pane; Clubs moves to a detail pane too. Remove the Shows, Dogs, People and Clubs items from the rail.
   - **Rail entry point (owner decision 2026-10-16).** The four items become one rail item, **Browse**, that opens the list pane on the tab used last (Shows the first time). "Browse" is the heading these four items already sat under, so returning users know the word. The remembered tab is a per-device convenience: if it cannot be read, Browse opens Shows. Each tab keeps its own URL (`/shows`, `/dogs`, `/people`, `/clubs`), so links, bookmarks and the back button land on the right tab, and Browse is current on all four. Rejected: labelling the item "Shows" (Dogs under "Shows" misleads), and keeping four rail items plus tabs (two paths to one place).

4. **Exhibitor-only users.** Two tabs, My Shows and My Dogs (exhibitors never see People or Clubs). My Shows lists the shows they entered, grouped Upcoming / Past; the detail pane is their entries for that show (dogs, classes, run order, receipts, withdraw). A "Find a show" button at the top of the list replaces the separate Find Shows item. Rail: **My Shows** (the single entry point, opening the My Shows / My Dogs tabs on the last one used, mirroring Browse), Payments, Show Day, Help, account.
   - **Duplication:** `/exhibitor/entries` (My Shows today) already groups entries by show. This phase _replaces_ that page's layout with the list and detail panes; it must not add a second copy. Carry over the Show Today banner, receipts and payment status, and keep the route so links and bookmarks still land.
   - Ships after phase 2 so the entries-page merge gets its own review. Mobile stays as it is today (menu drawer, full-page taps); most exhibitors are on phones, so this is mainly a desktop change.

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
