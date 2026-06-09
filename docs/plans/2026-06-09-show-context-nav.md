# Plan: Show Context Nav — Show Detail Page Navigation Overhaul

**Status:** In progress  
**Date:** 2026-06-09  
**Branch:** `claude/festive-swanson-e4e89a`

## Problem

Entry Management, Reports, Results Control, and Submit Results are standalone sidebar items with no guaranteed show context — a secretary can reach them without a show selected. The sidebar mixes cross-show navigation with show-scoped functions, creating a context-blind navigation model.

## Solution

Contextual top nav (GitHub repo tabs pattern) — appears only on show pages, contains all show-scoped navigation, stays visible across all of them with the active item highlighted.

### URL structure (new)

```
/secretary/shows/:showId              → Setup (index)
/secretary/shows/:showId/show-desk    → Show Desk
/secretary/shows/:showId/entry-management → Entry Management
/secretary/shows/:showId/reports      → Reports
/secretary/shows/:showId/results-control  → Results Control
/secretary/shows/:showId/submit-results   → Submit Results
```

### Redirects from old standalone routes

| Old route | New destination |
|-----------|----------------|
| `/secretary/entries/:showId?` | `/secretary/shows/:showId/entry-management` (or dashboard) |
| `/secretary/reports` | `/secretary/dashboard` + toast "Select a show to continue" |
| `/secretary/results-control` | `/secretary/dashboard` + toast |
| `/secretary/results-submission` | `/secretary/dashboard` + toast |
| `/secretary/run-order` | `/secretary/shows/:showId/setup` (was `?phase=setup`) |
| `/secretary/day-of` | `/secretary/shows/:showId/show-desk` (was `?phase=show-desk`) |
| `/secretary/check-in` | `/secretary/shows/:showId/show-desk` |

---

## Phase 1 — `ShowContextNav.tsx` ✅

Create `src/components/navigation/ShowContextNav.tsx`.

- Props: `{ showId: string }`
- Reads `useMatch` / `NavLink` for active state
- 6 items: Setup, Show Desk, Entry Management, Reports, Results Control, Submit Results
- Index route (Setup) uses `end` on NavLink to avoid always-active match

## Phase 2 — Extract sub-pages from `ShowWorkbenchPage.tsx` ✅

Extract the two tab contents into separate sibling files:

- `src/pages/secretary/ShowWorkbenchPage/SetupPage.tsx`
  - Content: `SetupAdaptiveHeader`, `SetupPublishSection`, `ScheduleSummary`, `VenueMap`, `ShowOfficials`, `JudgesList`
  - Data: `useFastShowDetails`, `useTrialStore`, `useShowJudges`, `useEntriesByShowQuery` (all cached)

- `src/pages/secretary/ShowWorkbenchPage/ShowDeskPage.tsx`
  - Content: `ShowDeskPanel` + closeout buttons
  - Data: same hooks + `useResultSubmissions`
  - Closeout links updated to new show-scoped URLs

## Phase 3 — `ShowWorkbenchPage.tsx` → layout shell ✅

Replace `PrimaryTabs` with `ShowContextNav` + `<Outlet />`.

Layout shell responsibilities:
1. `useFastShowDetails(showId)` → hero data
2. `useShowStore().selectShow(showId)` sync on param change (keeps store aligned for sub-components)
3. Render: `ShowPresenceProvider` → `PageShell` → `PageHeader` + `DetailHero` + `ShowContextNav` + `<Outlet />`
4. Loading / error / not-found guards

## Phase 4 — Update `secretaryRoutes.tsx` ✅

Convert `/secretary/shows/:showId` to a parent + nested children.

```tsx
<Route path="/secretary/shows/:showId" element={<ShowWorkbenchPage />}>
  <Route index element={<SetupPage />} />
  <Route path="show-desk" element={<ShowDeskPage />} />
  <Route path="entry-management" element={<EntryManagementPage />} />
  <Route path="reports" element={<ReportsPage />} />
  <Route path="results-control" element={<ResultsControlPage />} />
  <Route path="submit-results" element={<ResultsSubmissionPage />} />
</Route>
```

Update `SecretaryShowPhaseRedirect` to redirect to sub-route paths instead of `?phase=` params.

## Phase 5 — Migrate 4 pages to `useParams` ✅

All four pages remove their `useShowStore` + show-selector UI and call `useParams<{ showId: string }>()` instead.

- `ReportsPage/index.tsx`: remove show-selector `<Select>` from header, remove `selectShow` sync
- `ResultsControlPage/index.tsx`: remove `useShowStore`, use `useParams`
- `ResultsSubmissionPage/index.tsx`: remove `useShowStore`, use `useParams`
- `EntryManagementPage.tsx`: change `useParams<{ showId?: string }>` to `useParams<{ showId: string }>`

## Phase 6 — Update sidebar config ✅

`unifiedSidebarConfig.ts`:
- Remove: Entries, Reports, Results Control, Submit Results from Manage section
- Update `nextShow` link: `?phase=show-desk` → `show-desk` sub-route; `?phase=setup` → root path

## Phase 7 — Tests ✅

- `unifiedSidebarConfig.test.ts`: assert Entries/Reports/Results Control/Submit Results absent; nextShow links use sub-routes
- `ShowContextNav.test.tsx`: renders 6 items; active item matches current path
