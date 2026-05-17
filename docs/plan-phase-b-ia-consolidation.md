# Plan — Phase B IA Consolidation

**Date:** 2026-05-17
**Status:** Complete as of 2026-05-17 via [PR #223](https://github.com/rbeezley/myk9-platform/pull/223).
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)
**Input plan:** [`docs/plan-overview-tab-redistribution.md`](plan-overview-tab-redistribution.md)

## Goal

Build the secretary show workbench at `/secretary/shows/:showId` with phase tabs for **Setup**, **Today**, and **Wrap-up**, then move staff show-management surfaces into that route without changing the underlying panel contracts. The secretary should feel oriented around one show, not scattered across Dashboard, Day-of, Run Order, and Volunteer Scheduling.

This phase should preserve the Trial Secretary intent from `docs/INTENT.md`: "That was easy." The workbench must reduce navigation stress on show day, not add a new shell around the same sprawl.

## Current Surface Map

- Staff show details currently live in `apps/myk9show/src/pages/ShowDetailsPage.tsx`.
- The existing public/staff split happens in `ShowDetailsPage.tsx`: styled public landing renders for non-staff; staff see the management UI.
- Existing staff tabs are `overview`, `map`, `trials`, `classes`, `my-entries`, `my-stats`, and `results`.
- Secretary routes currently live in `apps/myk9show/src/routes/secretaryRoutes.tsx`; there is no `/secretary/shows/:showId` workbench route yet.
- `ShowOverviewTab` currently owns Schedule, Venue, Officials, Judges, Share, MyK9Q access, and More From Club.
- `QuickInfoCards`, `PremiumDownloadCard`, and `LandingPageCard` render above the current primary tabs.
- `ShowMapTab` already contains the ranked-action row menu, Next Best Action, and priority queue primitives from Phase A.

## Scope Guard

Do this phase as IA consolidation, not as another action-feature batch.

In scope:

- Add the `/secretary/shows/:showId` workbench route.
- Add URL-synced phase tabs: `setup`, `today`, `wrap-up`.
- Rehome existing staff panels into Setup / Today / Wrap-up.
- Add redirect mechanics for old secretary entry points.
- Keep the current public `/shows/:id` landing behavior intact.
- Keep existing drill-in destinations for edit, class detail, entry detail, paper scoresheets, and reports.

Out of scope:

- New Show Map tree extensions like Running Now, time scoping, or wrap-up taxonomy.
- New guided-UX features beyond placing already-shipped priority surfaces in Today.
- Schedule-slip communication, incident logging, hospitality, late entries, or refunds automation.
- Rewriting panel internals during the placement PRs.

## PR Slices

### PR 1 — Workbench shell and phase state

Create the route and page shell only.

Files likely touched:

- `apps/myk9show/src/routes/secretaryRoutes.tsx`
- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- `apps/myk9show/src/hooks/useUrlTab.ts` or a sibling `useActivePhase.ts`
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`

Deliverables:

- Register `/secretary/shows/:showId`.
- Protect the route for secretary/site-admin roles.
- Load the same show data the staff view already uses.
- Add phase tabs backed by URL state, using `?phase=` or `?tab=` consistently.
- Render a persistent show header with calm loading, error, and not-found states.
- Do not move Overview panels yet.

Tests:

- Route renders for secretary/site-admin.
- Non-staff cannot access the route.
- Invalid phase URL falls back to Setup or Today per the chosen default.
- Switching phases updates the URL without losing unrelated query params.

### PR 2 — Today tab anchors on Show Map

Make the Today tab useful without changing Show Map behavior.

Files likely touched:

- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- `apps/myk9show/src/features/show-map/ShowMapTab.tsx`
- `apps/myk9show/src/components/shows/overview/ScheduleSummary.tsx`
- Optional sibling for a read-only condensed schedule.

Deliverables:

- Render `ShowMapTab` inside Today for manageable shows.
- Keep the Phase A row actions and priority queue intact.
- Move or mirror `MyK9QAccessCard` into Today as a prominent operational card.
- Add a condensed, read-only current/next schedule surface if the data hook already supports it; otherwise leave a documented PR 3 pickup rather than inventing a new schedule data path.

Tests:

- Today renders the Show Map for a secretary.
- Today preserves the row action menu and Next Best Action / priority queue surfaces.
- MyK9Q access appears in Today for staff.

### PR 3 — Setup tab redistribution

Move setup-owned panels into the workbench.

Files likely touched:

- `apps/myk9show/src/components/shows/tabs/ShowOverviewTab.tsx`
- `apps/myk9show/src/components/shows/overview/*`
- `apps/myk9show/src/features/premium/PremiumDownloadCard.tsx`
- `apps/myk9show/src/features/premium/LandingPageCard.tsx`
- `apps/myk9show/src/test/components/ShowOverviewTab.test.tsx`
- `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

Deliverables:

- Setup renders Premium List, Landing Page, Schedule, Venue, Show Officials, and Judges.
- Keep `QuickInfoCards` persistent above phase tabs.
- Do not render Share Event or More From Club in the staff workbench unless public landing verification proves they have no other home.
- Keep component props/contracts stable.

Tests:

- Setup renders each setup panel once.
- Today and Wrap-up do not render Premium/Landing setup cards.
- Public `/shows/:id` styled landing behavior is unchanged for non-staff.

### PR 4 — Redirects and sidebar navigation

Move old secretary entry points toward the workbench.

Files likely touched:

- `apps/myk9show/src/routes/secretaryRoutes.tsx`
- `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`
- `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx`

Deliverables:

- `/secretary/day-of` routes to the active show's Today phase when a show can be resolved.
- `/secretary/check-in` routes to Today with the check-in intent preserved.
- `/secretary/run-order` routes to Setup when a show can be resolved.
- `/secretary/volunteers` routes to Setup/personnel when a show can be resolved.
- If no single active show is known, send the secretary to the show picker/dashboard instead of guessing.
- Sidebar links prefer the workbench route once the active show is known.

Tests:

- Each old route redirects to the correct phase when an active show exists.
- Each old route falls back calmly when no active show is selected.
- Sidebar config keeps accessible labels and active matching.

### PR 5 — Dashboard auto-route and cleanup

Finish the consolidation once the workbench is stable.

Files likely touched:

- `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/index.tsx`
- `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/MyShowsSection.tsx`
- Any remaining unrouted `PipelineDashboard` references found by `rg`.

Deliverables:

- `/secretary/dashboard` remains the multi-show overview.
- If exactly one active manageable show exists, offer or perform the documented auto-route to `/secretary/shows/:showId`.
- Delete unrouted pipeline components only after `rg` confirms there are no consumers.
- Update `OPEN-TODOS.md` with the final Phase B status.

Tests:

- Dashboard shows a picker/overview for multiple shows.
- Dashboard handles zero shows without a dead end.
- Single-show auto-route behavior is covered by a focused test.

## Redirect Rules

Use route-level redirects only after the target workbench phase exists.

| Old route               | Target                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/secretary/day-of`     | `/secretary/shows/:showId?phase=today`                                                                       |
| `/secretary/check-in`   | `/secretary/shows/:showId?phase=today&focus=check-in` if focus is implemented; otherwise Today               |
| `/secretary/run-order`  | `/secretary/shows/:showId?phase=setup&section=run-order` if section anchors are implemented; otherwise Setup |
| `/secretary/volunteers` | `/secretary/shows/:showId?phase=setup&section=personnel` if section anchors are implemented; otherwise Setup |
| `/secretary/dashboard`  | stays as multi-show overview; may auto-route only when exactly one active show exists                        |

Do not delete old routes before redirect coverage exists.

## Testing Phase

Do not consider Phase B complete until these pass:

- Unit tests for the phase-state hook/helper.
- Route tests for `/secretary/shows/:showId` protection and invalid phase fallback.
- Updated `ShowOverviewTab` and `ShowDetailsPage` tests for panel placement.
- Focused `ShowMapTab` tests proving Today keeps row actions, Next Best Action, and the priority queue.
- Sidebar/redirect tests for old secretary routes.
- `pnpm --dir apps/myk9show exec vitest run` on the touched test files.
- `pnpm typecheck`.
- `pnpm lint` if the branch touches linted TypeScript; note existing main-branch lint debt separately if it blocks.

After the final redirect PR, run a manual or automated secretary walk on a real show fixture:

- open the workbench,
- verify Setup panels,
- execute Today row-action smoke paths without saving destructive actions,
- confirm Wrap-up can reach reports/results,
- confirm old links redirect instead of dead-ending.

## Completion Criteria

Phase B is done when:

- `/secretary/shows/:showId` is the normal staff home for a single show.
- Setup / Today / Wrap-up phase tabs are live.
- Old day-of/run-order/volunteer links redirect.
- A secretary can move from setup checks to live operations to wrap-up without leaving the workbench.
- `OPEN-TODOS.md` and this plan are updated with shipped PR numbers.
