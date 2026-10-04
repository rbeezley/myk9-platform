# Master-Detail Lists (List Left, Detail Right)

> **Status:** Active

## Goal

Replace full-page hops from list to detail with a split view on wide screens, so the list keeps its place and scroll position. Narrow screens keep today's page hop. This consolidates navigation; it adds no new pages.

## Duplication question

Does this duplicate an existing page? No. The detail components already exist (`UserDetailsView`, `DogDetailsMain`, `ClubDetails`); the layout hosts them beside the list. The routes stay, so deep links and the back button keep working.

## Survey (2026-10-04)

| Entity  | List                                  | Detail today                       | Mode          |
| ------- | ------------------------------------- | ---------------------------------- | ------------- |
| People  | `pages/BrowsePeoplePage.tsx`          | `/people/:id` → `UserDetailsView`  | Page hop      |
| Dogs    | `pages/BrowseDogsPage.tsx`            | `/dogs/:id` → `DogDetailsMain`     | Page hop      |
| Entries | `pages/secretary/EntryManagementPage` | `EntryEditDialog`                  | Modal         |
| Clubs   | `pages/BrowseClubsPage.tsx`           | `/clubs/:id` → `ClubDetails`       | Page hop      |
| Shows   | `pages/BrowseShowsPage.tsx`           | `/shows/:id`                       | Page hop      |
| Trials  | inside `ShowDetailsPage`              | `/shows/:showId/trials/:trialId`   | Page hop      |
| Classes | inside trial page                     | `/.../classes/:classId`            | Page hop      |

Existing precedent: `features/show-map/cockpit/SecretaryCockpit.tsx` is a hand-rolled left/right grid at the `xl` (1280px) breakpoint, collapsing inline below it. No resizable-panel library is installed.

## Design

- One reusable `MasterDetailLayout` (shadcn `Resizable`, backed by `react-resizable-panels`).
- Wide (>= `xl`): list pane plus detail pane, draggable divider, layout persisted per entity.
- Narrow: unchanged page hop.
- The route param drives the right pane (`/people/:id`), so deep links, refresh and back button work. No selection state that the URL does not carry.
- Detail components must not assume they own the page: audit `PageShell`, breadcrumbs, `?fromDog=` and `?section=` params before embedding.
- `SlideOverPanel` is not portaled and its render order is load-bearing (see comments in `ClubDetails`, `UserDetailsView`, `DogDetailsMain`). Verify slide-overs open correctly from inside a pane.

## Phases

1. **Layout primitive.** `MasterDetailLayout`, responsive collapse, persisted sizes, unit tests.
2. **People pilot.** `/people` shows the list with `/people/:id` in the right pane. Resolve `?fromDog` return flow.
3. **Dogs.** Heaviest detail view; handle `?section=` and sub-panels.
4. **Entries.** Replace `EntryEditDialog` modal with a persistent detail pane (needs a detail view built from the dialog's content).
5. **Revisit hierarchy** (clubs, shows, trials, classes, entries) as a possible three-pane layout. See open question below.

## Decision: show-day hierarchy (2026-10-04)

Three-pane (hierarchy rail, list, detail) was considered for club → show → trial → class → entry. For the secretary's show-day work it is **not** built as a separate rail:

- `SecretaryCockpit` already is a split view: day-filtered schedule (trial → class) on the left, focused class on the right. A hierarchy rail would duplicate the schedule.
- [`plan-secretary-show-home.md`](plan-secretary-show-home.md) makes that cockpit the manager Overview, ships before the Oct 10 test show, and touches the same files.
- The real gap is the entry list: the focused class shows counts and actions, but individual entries live on the Entries tab or in `EntryEditDialog`.

**Scope:** after Show Home lands, add an entries list inside the focused-class panel, so the right side becomes list-then-detail (schedule | class entries | entry detail). Two columns plus the entry pane, not a new app-wide layout. This also subsumes Phase 4 (Entries) for the secretary; reconcile the two before building.

Browsing across clubs and shows stays two-pane (Phases 1-3) or plain pages. Do not touch the cockpit files until Show Home is merged.

## Testing

Each phase is not complete until these pass:

- Unit: layout collapses below `xl`, restores persisted sizes, renders detail from the route param.
- Component: detail view renders inside the pane on the real prop shape; slide-overs open from within the pane.
- E2E (Playwright, own session per CLAUDE.md): at 1440px, click a row, URL changes, list keeps scroll and selection; at 800px, click a row, full page hop; browser back returns to the list.
- Shuffled full-suite run before pushing (`pnpm vitest run --sequence.shuffle`).
- Read `docs/INTENT.md` for the affected roles before changing each list.

## Non-goals

- No new routes or pages.
- No change to detail-view content or permissions.
- No resizable panes below `xl`.
