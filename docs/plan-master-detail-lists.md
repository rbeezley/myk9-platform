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
4. **Entries.** Replace `EntryEditDialog` modal with a persistent detail pane (needs a detail view built from the dialog's content). **Staged, not a rebuild:** see "Design note: entries" below.
5. **Revisit hierarchy** (clubs, shows, trials, classes, entries) as a possible three-pane layout. See open question below.

## Decision: show-day hierarchy (2026-10-04)

Three-pane (hierarchy rail, list, detail) was considered for club → show → trial → class → entry. For the secretary's show-day work it is **not** built as a separate rail:

- `SecretaryCockpit` already is a split view: day-filtered schedule (trial → class) on the left, focused class on the right. A hierarchy rail would duplicate the schedule.
- [`plan-secretary-show-home.md`](plan-secretary-show-home.md) makes that cockpit the manager Overview, ships before the Oct 10 test show, and touches the same files.
- The real gap is the entry list: the focused class shows counts and actions, but individual entries live on the Entries tab or in `EntryEditDialog`.

**Scope:** after Show Home lands, add an entries list inside the focused-class panel, so the right side becomes list-then-detail (schedule | class entries | entry detail). Two columns plus the entry pane, not a new app-wide layout. This also subsumes Phase 4 (Entries) for the secretary; reconcile the two before building.

Browsing across clubs and shows stays two-pane (Phases 1-3) or plain pages. Do not touch the cockpit files until Show Home is merged.

## Design note: entries (2026-10-05)

Entries differ from People and Dogs: they have no list or detail route of their own. They live inside a show on the Entry Management tab (`/shows/:id/entries`, `EntryManagementPage` plus its cockpit), grouped by registration (one exhibitor's cart, approved, paid and emailed as a unit). `EntryEditDialog` is a slide-over for leaving a class (withdraw or pull), handler change and jump height, not a record view. Ringside scoring has its own route (`/scoring/classes/:classId/entries/:entryId`).

**Is the pane better than the sheet?** Partly. It wins for working down a queue (approve, check in, next) without losing the list, for giving an entry one place for status history, payment and classes, and for ending a second way to edit the same entry. It does not obviously win for the secretary's high-volume work (bulk status, decision emails, check-in), and rebuilding the sheet risks its tested edge cases (withdraw guards, jump-height errors, offline messages) on the workflow the launch goal puts first.

**Answers to the drawbacks:**

| Drawback                                  | Solution                                                                                                                  | Confidence                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| List is grouped by registration           | Rows are registrations that expand to their entries; the pane opens for the picked entry or registration                  | Solid                                                                    |
| Bulk work needs the full width            | Select mode (already built) carries the cockpit's bulk actions: status, emails, check-in. One-at-a-time work in the split | Mechanics solid; the mix of single vs bulk needs a secretary walkthrough |
| A ~38% pane is tight for an entry row     | Two lines per row (dog and handler; class, status, armband), resizable and persisted, the rest in the pane                | Good; check with a real show's class names                               |
| Rebuilding the sheet risks its edge cases | Do not rebuild: move the sheet's content into the pane and reuse `saveEntryEdits`, the withdraw guards and their tests    | Riskiest; the reason for the staging below                               |
| Timing                                    | Sequence around the Oct 10 test show                                                                                      | No technical fix needed                                                  |

**Staging:**

1. Now: this note only. No secretary entry code changes before the Oct 10 show.
2. After Oct 10 (and after `plan-secretary-show-home.md` lands): the experiment. An entries list inside the focused-class panel that opens the EXISTING sheet. It costs little and tells us whether secretaries want a pane.
3. Only if the experiment lands: one `EntryDetail` component, hosted by the Entry Management tab (`/shows/:showId/entries/:entryId`) and by the class panel, with the sheet's logic shared, not copied. Exhibitors' My Entries keeps its sheet.

Before step 3, walk two or three secretaries through the experiment with real entries.

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
