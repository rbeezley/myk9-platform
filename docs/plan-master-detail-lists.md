# Master-Detail Lists (List Left, Detail Right)

> **Status:** Active

## Goal

Replace full-page hops from list to detail with a split view on wide screens, so the list keeps its place and scroll position. Narrow screens keep today's page hop. This consolidates navigation; it adds no new pages.

## Duplication question

Does this duplicate an existing page? No. The detail components already exist (`UserDetailsView`, `DogDetailsMain`, `ClubDetails`); the layout hosts them beside the list. The routes stay, so deep links and the back button keep working.

## Survey (2026-10-04)

| Entity  | List                                  | Detail today                      | Mode     |
| ------- | ------------------------------------- | --------------------------------- | -------- |
| People  | `pages/BrowsePeoplePage.tsx`          | `/people/:id` → `UserDetailsView` | Page hop |
| Dogs    | `pages/BrowseDogsPage.tsx`            | `/dogs/:id` → `DogDetailsMain`    | Page hop |
| Entries | `pages/secretary/EntryManagementPage` | `EntryEditDialog`                 | Modal    |
| Clubs   | `pages/BrowseClubsPage.tsx`           | `/clubs/:id` → `ClubDetails`      | Page hop |
| Shows   | `pages/BrowseShowsPage.tsx`           | `/shows/:id`                      | Page hop |
| Trials  | inside `ShowDetailsPage`              | `/shows/:showId/trials/:trialId`  | Page hop |
| Classes | inside trial page                     | `/.../classes/:classId`           | Page hop |

Existing precedent: `features/show-map/cockpit/SecretaryCockpit.tsx` is a hand-rolled left/right grid at the `xl` (1280px) breakpoint, collapsing inline below it. No resizable-panel library is installed.

## Design

- One reusable `MasterDetailLayout` (shadcn `Resizable`, backed by `react-resizable-panels`).
- Wide (>= `lg`, 1024px; the cockpit's 1280px proved too high for a 1212px pane): list pane plus detail pane, draggable divider, layout persisted per entity.
- Narrow: unchanged page hop.
- The route param drives the right pane (`/people/:id`), so deep links, refresh and back button work. No selection state that the URL does not carry.
- Detail components must not assume they own the page: audit `PageShell`, breadcrumbs, `?fromDog=` and `?section=` params before embedding.
- `SlideOverPanel` is not portaled and its render order is load-bearing (see comments in `ClubDetails`, `UserDetailsView`, `DogDetailsMain`). Verify slide-overs open correctly from inside a pane.

## Phases

1. **Layout primitive.** `MasterDetailLayout`, responsive collapse, persisted sizes, unit tests. _Done (#2756)._
2. **People pilot.** `/people` shows the list with `/people/:id` in the right pane. Resolve `?fromDog` return flow. _Done (#2756)._
3. **Dogs.** Heaviest detail view; handle `?section=` and sub-panels. _Done (#2769), built on the People pieces:_ `CompactRecordList`, `useSelectMode`/`SelectModeButton` and `ListToolbarLayout` are shared; the dog detail stacks its identity rail, drops its route-entry focus/scroll and shows a close link when embedded. Select mode is staff-only (an exhibitor's roster has no bulk actions).
4. **Entries.** _Superseded (2026-10-05): the split already exists._ See "Design note: entries" below.
5. **Revisit hierarchy** (clubs, shows, trials, classes, entries) as a possible three-pane layout. See open question below.

## Decision: show-day hierarchy (2026-10-04)

Three-pane (hierarchy rail, list, detail) was considered for club → show → trial → class → entry. For the secretary's show-day work it is **not** built as a separate rail:

- `SecretaryCockpit` already is a split view: day-filtered schedule (trial → class) on the left, focused class on the right. A hierarchy rail would duplicate the schedule.
- [`plan-secretary-show-home.md`](plan-secretary-show-home.md) makes that cockpit the manager Overview, ships before the Oct 10 test show, and touches the same files.
- The real gap is the entry list: the focused class shows counts and actions, but individual entries live on the Entries tab or in `EntryEditDialog`.

**Scope:** after Show Home lands, add an entries list inside the focused-class panel, so the right side becomes list-then-detail (schedule | class entries | entry detail). Two columns plus the entry pane, not a new app-wide layout. This also subsumes Phase 4 (Entries) for the secretary; reconcile the two before building.

Browsing across clubs and shows stays two-pane (Phases 1-3) or plain pages. Do not touch the cockpit files until Show Home is merged.

## Design note: entries (2026-10-05, corrected)

**The Entry Management tab is already a master-detail split.** `/shows/:showId/entries` renders a registration queue on the left and a sticky "focused registration" pane on the right (`EntryManagementCockpit`, `?registration=` in the URL), collapsing to one column below 960px. Per-entry work (status, comp, remove, withdraw, refund, payment, email) is already in the pane. Show Home (MYK9-953 to 957) has also landed, so the show-day class panel exists.

An earlier version of this note proposed building a new split and an `EntryDetail` pane. That was wrong: it was written before the cockpit components were read. What remains is small:

- `EntryEditDialog` is still a slide-over for the per-entry edit (handler, jump height, leave class). Moving it inline is optional and risky (10 test files of edge cases); decide after the Oct 10 observation (MYK9-958).
- The show-day class panel lists only move-up and pull entries on purpose, and already links to the class page ("View entries and results") with a return path. No new list there.

**The real friction (browser walk, 2026-10-05): the work started below the fold.** The show hero (date block, quick-info cards) sat above every tab, so the entry queue began about 770px down a 900px window, and the Overview class panel about 1,200px down.

**Done in this change (variant B on the design canvas):**

- Every management tab, Overview included, gets one `ShowHeader` (name, dates, host club, entry count, and the same offline, sync, presence and status controls), pinned under the app header from `lg`; the tab strip is pinned under it. Its height is measured (`--show-header-h`), since the controls wrap on a narrow window. The full hero is gone.
- A chevron in the header slides open a details panel (`ShowDetailsPanel`): the quick-info cells on every tab, and on Overview the Premium List and Public Landing Page cards. Collapsed by default and remembered. A `#setup-publish*` link opens it, and while the premium list or landing page is unpublished a "Premium not published" chip in the header opens it, so collapsing hides no task.
- The Entry Management toolbar uses the list toolkit's compact layout (views, search and filters on one row, count only when narrowed); the page title is smaller and the show-name line is read aloud, not drawn (the pinned header names the show).
- The focused-registration pane sticks under the pinned header (`--show-sticky-offset`).

**Not done, by choice:** pinning the filter row (three rows tall, a third of the screen), the dog-first queue rows and the Overview variants from the canvas; take them after the Oct 10 observation.

## Testing

Each phase is not complete until these pass:

- Unit: layout collapses below `lg`, restores persisted sizes, renders detail from the route param.
- Component: detail view renders inside the pane on the real prop shape; slide-overs open from within the pane.
- E2E (Playwright, own session per CLAUDE.md): at 1440px, click a row, URL changes, list keeps scroll and selection; at 800px, click a row, full page hop; browser back returns to the list.
- Shuffled full-suite run before pushing (`pnpm vitest run --sequence.shuffle`).
- Read `docs/INTENT.md` for the affected roles before changing each list.

## Non-goals

- No new routes or pages.
- No change to detail-view content or permissions.
- No resizable panes below `lg`.

## Show header polish (2026-10-05)

Follow-up to the header redesign: the visible "Entry Management" title and the "Your show" title and kicker are gone (screen-reader headings stay), More and Add Entry live in the Entries toolbar row, and "About this show" is part of the expandable show header panel. The one-row toolbar applies from `lg` only; below it the controls stack so the search field keeps its width.
