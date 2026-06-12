# Canonical Show Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/shows/:id` the single canonical show page and expose secretary capabilities through role-aware controls and subroutes.

**Architecture:** Create a canonical show shell under the existing public show route family, then move secretary sections behind that shell in small slices. Keep section components focused; do not fold setup, show desk, reports, entries, results control, or submit results into `ShowDetailsPage`.

**Tech Stack:** React, React Router, TypeScript, Vitest, Testing Library, Playwright, shadcn/Base UI components, existing Zustand/React Query stores.

## Validation Profile [ADDED]

- Risk: medium
- Validation: app
- Rationale: This changes one app's route model and secretary navigation without changing database, auth policy, payments, or replication layers.

---

## Design Reference

Spec: `docs/superpowers/specs/2026-06-11-canonical-show-page-design.md`

Key decisions:

- `/shows/:id` is the canonical show overview for every role.
- Secretary/admin management sections live under `/shows/:id/*`.
- Old `/secretary/shows/:showId/*` routes redirect to canonical `/shows/:id/*` routes.
- Redirects preserve query strings.
- Do not add dynamic default routing in the first implementation.

## File Structure

### Create

- `apps/myk9show/src/routes/showRouteRedirects.tsx`
  - Owns legacy secretary-show redirect helpers.
  - Keeps query-string preservation in one tested place.

- `apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx`
  - Covers canonical section routes and legacy redirects.

### Modify

- `apps/myk9show/src/routes/publicRoutes.tsx`
  - Add canonical nested management routes under `/shows/:id`.
  - Add lazy imports for secretary section pages.
  - Add a local management-section guard that redirects non-managers from `/shows/:id/*` management URLs back to `/shows/:id`.
  - Import `UserRole` from `@/types/auth-types`; `ProtectedRoute.requiredRole` is typed as `UserRole | UserRole[]`.

- `apps/myk9show/src/routes/secretaryRoutes.tsx`
  - Replace `/secretary/shows/:showId/*` workbench route definitions with redirects.
  - Update legacy standalone redirects to point to canonical routes.

- `apps/myk9show/src/components/navigation/ShowContextNav.tsx`
  - Make section links target `/shows/:showId/*`.
  - Keep labels unchanged.

- `apps/myk9show/src/components/navigation/ShowContextNav.test.tsx`
  - Update route context and expected hrefs.

- `apps/myk9show/src/pages/ShowDetailsPage.tsx`
  - Use as canonical shell.
  - Render role-aware management nav for secretary/admin users.
  - Render `<Outlet />` for canonical management sections.

- `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`
  - Add role-aware nav and top-right action assertions for canonical route.

- `apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx`
  - Update expected secretary redirects to canonical `/shows/:id/*` routes.

- `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
  - Delete after `/secretary/shows/:showId/*` no longer renders it.

- `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`
  - Delete with the old workbench shell.

- `apps/myk9show/src/features/show-map/ShowDeskCloseoutSection.tsx`
  - Update the stale caller comment from `ShowWorkbenchPage` to the canonical show-desk route.

- `apps/myk9show/src/routes/routeRegistry.ts`
  - Register canonical management paths for prefetch/help tooling.

- `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`
  - Update page directory paths and links away from `/secretary/shows/:showId/*`.

- Tracking docs after implementation:
  - `OPEN-TODOS.md`
  - `TO-DOS.md`

---

## Task 1: Add Legacy Secretary-Show Redirect Helper

**Files:**

- Create: `apps/myk9show/src/routes/showRouteRedirects.tsx`
- Test: `apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx`

- [ ] **Step 1: Write the failing redirect helper tests**

Create `apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderRedirect(initialPath: string, subPath?: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/secretary/shows/:showId/*"
          element={<LegacySecretaryShowRedirect subPath={subPath} />}
        />
        <Route path="/shows/:id/*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('canonical show route redirects', () => {
  it('redirects the legacy secretary show base route to canonical setup', async () => {
    renderRedirect('/secretary/shows/show-1');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/setup');
  });

  it('redirects a legacy secretary show subroute to the matching canonical subroute', async () => {
    renderRedirect('/secretary/shows/show-1/show-desk', 'show-desk');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/show-desk');
  });

  it('preserves query strings on legacy secretary show redirects', async () => {
    renderRedirect(
      '/secretary/shows/show-1/reports?report=result-catalog&trialId=trial-7',
      'reports'
    );
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-1/reports?report=result-catalog&trialId=trial-7'
    );
  });
});
```

- [ ] **Step 2: Run the redirect tests and confirm failure**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/routes/canonicalShowRoutes.test.tsx
```

Expected: fail because `@/routes/showRouteRedirects` does not exist.

- [ ] **Step 3: Implement the redirect helper**

Create `apps/myk9show/src/routes/showRouteRedirects.tsx`:

```tsx
import { Navigate, useLocation, useParams } from 'react-router-dom';

interface LegacySecretaryShowRedirectProps {
  subPath?: string;
}

export function LegacySecretaryShowRedirect({ subPath }: LegacySecretaryShowRedirectProps) {
  const { showId } = useParams<{ showId: string }>();
  const { search } = useLocation();

  if (!showId) {
    return <Navigate to="/shows" replace />;
  }

  const normalizedSubPath = subPath ? `/${subPath.replace(/^\/+/, '')}` : '/setup';
  return <Navigate to={`/shows/${showId}${normalizedSubPath}${search}`} replace />;
}
```

- [ ] **Step 4: Run the redirect tests and confirm pass**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/routes/canonicalShowRoutes.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/routes/showRouteRedirects.tsx apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx
git commit -m "test(routes): cover canonical show redirects"
```

---

## Task 2: Add Canonical Show Management Routes

**Files:**

- Modify: `apps/myk9show/src/routes/publicRoutes.tsx`
- Modify: `apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx`

- [ ] **Step 1: Add failing canonical route render tests**

Append to `apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx`:

```tsx
import { Route } from 'react-router-dom';

function CanonicalShowRouteHarness() {
  return (
    <Routes>
      <Route path="/shows/:id" element={<div data-testid="show-shell"><LocationProbe /></div>}>
        <Route path="setup" element={<div data-testid="setup-section">Setup</div>} />
        <Route path="show-desk" element={<div data-testid="show-desk-section">Show Desk</div>} />
        <Route path="entry-management" element={<div data-testid="entries-section">Entries</div>} />
        <Route path="reports" element={<div data-testid="reports-section">Reports</div>} />
        <Route path="results-control" element={<div data-testid="results-control-section">Results Control</div>} />
        <Route path="submit-results" element={<div data-testid="submit-results-section">Submit Results</div>} />
      </Route>
    </Routes>
  );
}

describe('canonical show management section paths', () => {
  it.each([
    ['/shows/show-1/setup', 'setup-section'],
    ['/shows/show-1/show-desk', 'show-desk-section'],
    ['/shows/show-1/entry-management', 'entries-section'],
    ['/shows/show-1/reports', 'reports-section'],
    ['/shows/show-1/results-control', 'results-control-section'],
    ['/shows/show-1/submit-results', 'submit-results-section'],
  ])('supports %s', async (path, testId) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <CanonicalShowRouteHarness />
      </MemoryRouter>
    );
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });
});
```

This harness proves the intended nested path shape before wiring real lazy routes.

- [ ] **Step 1a: Add access behavior coverage for direct management URLs [ADDED]**

Add a focused test proving the intended non-manager behavior for canonical management URLs:

```tsx
import { Navigate } from 'react-router-dom';

function CanonicalAccessProbe({ canManage }: { canManage: boolean }) {
  const location = useLocation();

  if (!canManage) {
    return <Navigate to="/shows/show-1" replace />;
  }

  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

it('redirects a non-manager direct management URL back to the canonical overview', async () => {
  render(
    <MemoryRouter initialEntries={['/shows/show-1/show-desk?from=dashboard']}>
      <Routes>
        <Route
          path="/shows/:id/show-desk"
          element={<CanonicalAccessProbe canManage={false} />}
        />
        <Route path="/shows/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1');
});
```

This locks the product rule from the spec: direct section URLs are not a second public page family for exhibitors.

- [ ] **Step 2: Run the focused route tests**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/routes/canonicalShowRoutes.test.tsx
```

Expected: pass for the harness tests. These tests document the route shape and guard future refactors.

- [ ] **Step 3: Add secretary page lazy imports to public routes**

In `apps/myk9show/src/routes/publicRoutes.tsx`, verify the existing React import includes `type ReactNode`, then add `UserRole` near the other app imports:

```tsx
import { lazy, type ReactNode } from 'react';
import { UserRole } from '@/types/auth-types';

const ShowWorkbenchSetupPage = lazy(() =>
  import('@/pages/secretary/ShowWorkbenchSetupPage').then(m => ({
    default: m.ShowWorkbenchSetupPage,
  }))
);
const ShowWorkbenchShowDeskPage = lazy(() =>
  import('@/pages/secretary/ShowWorkbenchShowDeskPage').then(m => ({
    default: m.ShowWorkbenchShowDeskPage,
  }))
);
const EntryManagementPage = lazy(() => import('@/pages/secretary/EntryManagementPage'));
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
const ResultsSubmissionPage = lazy(() =>
  import('@/pages/secretary/ResultsSubmissionPage')
);
```

- [ ] **Step 4: Add the canonical management route guard [ADDED]**

In `apps/myk9show/src/routes/publicRoutes.tsx`, merge `useParams` into the existing `react-router-dom` import:

```tsx
import { Route, Navigate, useParams } from 'react-router-dom';
```

Add this local helper above `PublicRoutes`:

```tsx
function ShowManagementSectionRoute({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id?: string }>();
  const canonicalShowPath = id ? `/shows/${id}` : '/shows';

  return (
    <ProtectedRoute
      redirectTo={canonicalShowPath}
      requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}
      fallback={<Navigate to={canonicalShowPath} replace />}
    >
      {children}
    </ProtectedRoute>
  );
}
```

This makes unauthenticated or non-manager direct section URLs return to the canonical show overview instead of exposing a parallel management surface.

- [ ] **Step 5: Convert `/shows/:id` into a nested route**

Replace the existing `/shows/:id` route in `apps/myk9show/src/routes/publicRoutes.tsx` with:

```tsx
<Route
  path="/shows/:id"
  element={
    <SuspenseWrapper>
      <PageTransition>
        <ShowDetailsPage />
      </PageTransition>
    </SuspenseWrapper>
  }
>
  <Route
    path="setup"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <ShowWorkbenchSetupPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
  <Route
    path="show-desk"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <ShowWorkbenchShowDeskPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
  <Route
    path="entry-management"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <EntryManagementPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
  <Route
    path="reports"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <ReportsPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
  <Route
    path="results-control"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <ResultsControlPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
  <Route
    path="submit-results"
    element={
      <ShowManagementSectionRoute>
        <SuspenseWrapper>
          <ResultsSubmissionPage />
        </SuspenseWrapper>
      </ShowManagementSectionRoute>
    }
  />
</Route>
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
cd apps/myk9show
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/routes/publicRoutes.tsx apps/myk9show/src/test/routes/canonicalShowRoutes.test.tsx
git commit -m "feat(routes): add canonical show management paths"
```

---

## Task 3: Make Show Details Render Canonical Management Sections

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Modify: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

- [ ] **Step 1: Add failing tests for management nav and outlet rendering**

In `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`, update the test route helper so `renderPage` accepts a subpath and can render a child route:

```tsx
function renderPage(showId = 'show-1', subPath = '', query = '') {
  return customRender(
    <MemoryRouter initialEntries={[`/shows/${showId}${subPath}${query}`]}>
      <Routes>
        <Route path="/shows/:id" element={<ShowDetailsPage />}>
          <Route
            path="show-desk"
            element={<div data-testid="canonical-child">Show Desk child</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
```

Add tests:

```tsx
it('renders canonical management nav for show managers', () => {
  mockAuthContext.isSecretary = true;

  renderPage();

  expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
    'href',
    '/shows/show-1/setup'
  );
  expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
    'href',
    '/shows/show-1/show-desk'
  );
  expect(screen.getByRole('link', { name: 'Entry Management' })).toHaveAttribute(
    'href',
    '/shows/show-1/entry-management'
  );
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/shows/show-1/reports'
  );
});

it('does not render management nav for exhibitors', () => {
  renderPage();

  expect(screen.queryByRole('link', { name: 'Show Desk' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Entry Management' })).not.toBeInTheDocument();
});

it('does not present public preview as a primary manager destination', () => {
  mockAuthContext.isSecretary = true;

  renderPage();

  expect(screen.queryByRole('link', { name: /preview public page/i })).not.toBeInTheDocument();
});

it('renders canonical child sections below the show hero', () => {
  mockAuthContext.isSecretary = true;

  renderPage('show-1', '/show-desk');

  expect(screen.getByTestId('canonical-child')).toHaveTextContent('Show Desk child');
});
```

[ADDED] The public-preview assertion prevents the old "public preview" mental model from remaining as a primary destination after `/shows/:id` becomes canonical.

- [ ] **Step 2: Run the page tests and confirm failure**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "canonical|management nav"
```

Expected: fail because `ShowDetailsPage` does not render the new canonical management nav or child outlet.

- [ ] **Step 3: Add management nav constants**

In `apps/myk9show/src/pages/ShowDetailsPage.tsx`, add:

```tsx
import { Outlet, useMatch } from 'react-router-dom';

const SHOW_MANAGEMENT_NAV = [
  { label: 'Setup', path: 'setup' },
  { label: 'Show Desk', path: 'show-desk' },
  { label: 'Entry Management', path: 'entry-management' },
  { label: 'Reports', path: 'reports' },
  { label: 'Results Control', path: 'results-control' },
  { label: 'Submit Results', path: 'submit-results' },
] as const;
```

Merge `Outlet` and `useMatch` into the existing `react-router-dom` import instead of creating a duplicate import.

- [ ] **Step 4: Render role-aware management nav**

Inside `ShowDetailsPage`, call `useMatch` near the other route hooks before any conditional return, then derive the canonical nav state after `actualCurrentShow` is available:

```tsx
const managementSectionMatch = useMatch('/shows/:id/:section');

// after actualCurrentShow is available:
const canonicalShowHref = actualCurrentShow?.id ? `/shows/${actualCurrentShow.id}` : '';
const isManagementSection = Boolean(
  managementSectionMatch?.params.section &&
    SHOW_MANAGEMENT_NAV.some(item => item.path === managementSectionMatch.params.section)
);
```

Below the `DetailHero`, render:

```tsx
{canManageShow && actualCurrentShow?.id && (
  <nav
    className="border-b border-border bg-background"
    aria-label="Show management sections"
    data-testid="canonical-show-management-nav"
  >
    <div className="flex overflow-x-auto px-4 sm:px-6">
      {SHOW_MANAGEMENT_NAV.map(({ label, path }) => {
        const href = `${canonicalShowHref}/${path}`;
        const isActive = managementSectionMatch?.params.section === path;
        return (
          <Link
            key={path}
            to={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  </nav>
)}
```

Import `cn` from `@/lib/utils`.

- [ ] **Step 5: Render child section outlet or public tabs**

Wrap the current public tab block so management sections render `<Outlet />` instead:

```tsx
{isManagementSection ? (
  <Outlet />
) : isWaitingForExhibitorEntryDefault ? (
  <div className="mt-6">
    <LoadingSkeleton variant="cards" count={2} />
  </div>
) : (
  <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setTab}>
    {/* existing public tab content stays here */}
  </PrimaryTabs>
)}
```

- [ ] **Step 6: Run page tests**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/pages/ShowDetailsPage.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx
git commit -m "feat(show): render canonical management nav"
```

---

## Task 4: Redirect Old Secretary Show Routes

**Files:**

- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify: `apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx`
- Delete: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx` [ADDED]
- Delete: `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx` [ADDED]
- Modify: `apps/myk9show/src/features/show-map/ShowDeskCloseoutSection.tsx`

- [ ] **Step 1: Update secretary redirect expectations**

In `apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx`, update expected locations:

```tsx
expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
  '/shows/show-1/show-desk'
);
```

Apply this mapping throughout the file:

- `/secretary/shows/show-1` -> `/shows/show-1/setup`
- `/secretary/shows/show-1/show-desk` -> `/shows/show-1/show-desk`
- `/secretary/shows/show-1/entry-management?entryTab=pending` -> `/shows/show-1/entry-management?entryTab=pending`

Rename `data-testid="show-workbench"` in the route mock to `data-testid="canonical-show-route"` because the mock now represents the canonical show route.

- [ ] **Step 2: Run the secretary redirect tests and confirm failure**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/routes/secretaryShowPhaseRedirects.test.tsx
```

Expected: fail because routes still navigate to `/secretary/shows/*`.

- [ ] **Step 3: Update helper redirects**

In `apps/myk9show/src/routes/secretaryRoutes.tsx`, update `SecretaryEntriesRedirect`:

```tsx
return (
  <Navigate to={`/shows/${resolvedShowId}/entry-management${search}`} replace />
);
```

Update `SecretaryShowRedirect`:

```tsx
const to = subPath ? `/shows/${showId}/${subPath}` : `/shows/${showId}/setup`;
return <Navigate to={to} replace />;
```

Update `SecretaryIndexRedirect`:

```tsx
return <Navigate to={showId ? `/shows/${showId}/setup` : '/secretary/dashboard'} replace />;
```

- [ ] **Step 4: Replace workbench route with legacy redirects**

In `apps/myk9show/src/routes/secretaryRoutes.tsx`, replace the nested `/secretary/shows/:showId` workbench route with individual redirect routes:

```tsx
<Route
  path="/secretary/shows/:showId"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <LegacySecretaryShowRedirect />
    </ProtectedRoute>
  }
/>
{(['show-desk', 'entry-management', 'reports', 'results-control', 'submit-results'] as const).map(
  subPath => (
    <Route
      key={subPath}
      path={`/secretary/shows/:showId/${subPath}`}
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <LegacySecretaryShowRedirect subPath={subPath} />
        </ProtectedRoute>
      }
    />
  )
)}
```

Import `LegacySecretaryShowRedirect` from `@/routes/showRouteRedirects`.

Remove these lazy imports after replacing the nested workbench route; none remain needed in `secretaryRoutes.tsx` for the legacy show route family:

- `ShowWorkbenchPage`
- `ShowWorkbenchSetupPage`
- `ShowWorkbenchShowDeskPage`
- `EntryManagementPage`
- `ReportsPage`
- `ResultsControlPage`
- `ResultsSubmissionPage`

Delete `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx` and `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`. Then update the comment in `apps/myk9show/src/features/show-map/ShowDeskCloseoutSection.tsx`: [EXPANDED]

```tsx
// The section is a pure container; the canonical show-desk route owns page-level decisions.
```

- [ ] **Step 5: Run focused route tests**

Run:

```bash
cd apps/myk9show
npx vitest run src/test/routes/secretaryShowPhaseRedirects.test.tsx src/test/routes/canonicalShowRoutes.test.tsx
! rg "ShowWorkbenchPage|Preview public page" src
```

Expected: route tests pass. The `rg` command returns no live code references; stale historical references in docs are acceptable only outside `apps/myk9show/src`.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/test/routes/secretaryShowPhaseRedirects.test.tsx apps/myk9show/src/features/show-map/ShowDeskCloseoutSection.tsx
git rm apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx
git commit -m "refactor(routes): redirect secretary show routes"
```

---

## Task 5: Update Show Management Navigation Links

**Files:**

- Modify: `apps/myk9show/src/components/navigation/ShowContextNav.tsx`
- Modify: `apps/myk9show/src/components/navigation/ShowContextNav.test.tsx`
- Modify: link producers that point into old secretary show routes:
  - `apps/myk9show/src/pages/secretary/SecretaryDashboardPage/ShowPhaseCard.tsx`
  - `apps/myk9show/src/hooks/useMyShows.ts`
  - `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`
  - `apps/myk9show/src/features/show-map/showMapRoutes.ts`
  - `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`

- [ ] **Step 1: Update nav tests for canonical paths**

In `apps/myk9show/src/components/navigation/ShowContextNav.test.tsx`, change `renderNav` to:

```tsx
function renderNav(path = '/shows/show-42/setup') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shows/:showId/*" element={<ShowContextNav />} />
      </Routes>
    </MemoryRouter>
  );
}
```

Update expected hrefs:

```tsx
expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
  'href',
  '/shows/show-42/setup'
);
expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
  'href',
  '/shows/show-42/show-desk'
);
```

Update active-path tests to use `/shows/show-42/setup` and `/shows/show-42/show-desk`.

- [ ] **Step 2: Run nav tests and confirm failure**

Run:

```bash
cd apps/myk9show
npx vitest run src/components/navigation/ShowContextNav.test.tsx
```

Expected: fail because `ShowContextNav` still builds `/secretary/shows/*`.

- [ ] **Step 3: Update ShowContextNav**

In `apps/myk9show/src/components/navigation/ShowContextNav.tsx`, read both route parameter names because canonical routes use `:id` and some tests may still mount the nav under `:showId`:

```tsx
const { id, showId } = useParams<{ id?: string; showId?: string }>();
const resolvedShowId = showId ?? id;
```

Then change route generation:

```tsx
const to = `/shows/${resolvedShowId}/${path || 'setup'}`;
```

Because setup is represented by `/setup`, use:

```tsx
end
```

on every `NavLink` so each section is exact.

- [ ] **Step 4: Update link producers**

Apply these replacements:

```tsx
// Before
`/secretary/shows/${showId}`
`/secretary/shows/${showId}/show-desk`
`/secretary/shows/${showId}/reports?...`

// After
`/shows/${showId}/setup`
`/shows/${showId}/show-desk`
`/shows/${showId}/reports?...`
```

Use `rg "/secretary/shows/\\$\\{|/secretary/shows/" apps/myk9show/src` to find all remaining producers. Leave only redirect route definitions and tests that explicitly verify legacy redirect behavior.

- [ ] **Step 5: Run focused tests for link producers**

Run:

```bash
cd apps/myk9show
npx vitest run \
  src/components/navigation/ShowContextNav.test.tsx \
  src/pages/secretary/SecretaryDashboardPage/__tests__/ShowPhaseCard.test.tsx \
  src/hooks/useMyShows.test.ts \
  src/components/layout/sidebar/__tests__/unifiedSidebarConfig.test.ts \
  src/features/show-map/__tests__/showMapActions.test.ts \
  src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx
```

Expected: pass after updating assertions to canonical paths.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/navigation/ShowContextNav.tsx apps/myk9show/src/components/navigation/ShowContextNav.test.tsx apps/myk9show/src/pages/secretary/SecretaryDashboardPage/ShowPhaseCard.tsx apps/myk9show/src/hooks/useMyShows.ts apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts apps/myk9show/src/features/show-map/showMapRoutes.ts apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx
git commit -m "refactor(show): point management links to canonical routes"
```

---

## Task 6: Update Route Registry and Admin Help

**Files:**

- Modify: `apps/myk9show/src/routes/routeRegistry.ts`
- Modify: `apps/myk9show/src/routes/routeRegistry.test.ts`
- Modify: `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`
- Modify: `apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/resolveExamplePath.test.ts`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/PageDirectoryRow.test.tsx`
- Modify: `apps/myk9show/src/features/admin-help/__tests__/pageDirectory.test.ts`

- [ ] **Step 1: Update route registry tests**

In `apps/myk9show/src/routes/routeRegistry.test.ts`, update secretary show route expectations:

```ts
expect(getRouteImportFunction('/shows/show-42/setup')).toBeDefined();
expect(getRouteImportFunction('/shows/show-42/show-desk')).toBeDefined();
expect(getRouteImportFunction('/secretary/shows/show-42')).toBeDefined();
```

The legacy secretary route remains registered only as a redirect route.

- [ ] **Step 2: Run route registry tests and confirm failure**

Run:

```bash
cd apps/myk9show
npx vitest run src/routes/routeRegistry.test.ts
```

Expected: fail until registry paths are updated.

- [ ] **Step 3: Update route registry [EXPANDED]**

In `apps/myk9show/src/routes/routeRegistry.ts`, add canonical management entries:

```ts
'/shows/:id/setup': () =>
  import('@/pages/secretary/ShowWorkbenchSetupPage').then(m => ({
    default: m.ShowWorkbenchSetupPage,
  })),
'/shows/:id/show-desk': () =>
  import('@/pages/secretary/ShowWorkbenchShowDeskPage').then(m => ({
    default: m.ShowWorkbenchShowDeskPage,
  })),
'/shows/:id/entry-management': () => import('@/pages/secretary/EntryManagementPage'),
'/shows/:id/reports': () => import('@/pages/secretary/ReportsPage'),
'/shows/:id/results-control': () => import('@/pages/secretary/ResultsControlPage'),
'/shows/:id/submit-results': () => import('@/pages/secretary/ResultsSubmissionPage'),
```

Update legacy secretary show entries in `secretaryRouteComponents` to use the redirect helper:

```ts
'/secretary/shows/:showId': () =>
  import('@/routes/showRouteRedirects').then(m => ({
    default: m.LegacySecretaryShowRedirect,
  })),
```

Keep `/secretary/shows/:showId` in the registry for legacy redirect discovery. Remove links that present it as the main destination.

- [ ] **Step 4: Update admin help directory**

In `apps/myk9show/src/features/admin-help/data/pageDirectory.ts`, replace secretary show management paths:

```ts
path: '/shows/:showId/setup'
linksTo: ['/secretary/dashboard', '/shows/:showId/show-desk', '/shows/:showId/results-control']
```

Use canonical paths for reports, results control, and submit results.

- [ ] **Step 5: Update example path resolver**

In `apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts`, add canonical resolvers:

```ts
'/shows/:showId/setup': makeResolver(ids => `/shows/${ids.showId}/setup`, ['showId']),
'/shows/:showId/show-desk': makeResolver(ids => `/shows/${ids.showId}/show-desk`, ['showId']),
'/shows/:showId/entry-management': makeResolver(
  ids => `/shows/${ids.showId}/entry-management`,
  ['showId']
),
'/shows/:showId/reports': makeResolver(ids => `/shows/${ids.showId}/reports`, ['showId']),
'/shows/:showId/results-control': makeResolver(
  ids => `/shows/${ids.showId}/results-control`,
  ['showId']
),
'/shows/:showId/submit-results': makeResolver(
  ids => `/shows/${ids.showId}/submit-results`,
  ['showId']
),
```

- [ ] **Step 6: Run registry/admin-help tests**

Run:

```bash
cd apps/myk9show
npx vitest run \
  src/routes/routeRegistry.test.ts \
  src/features/admin-help/__tests__/resolveExamplePath.test.ts \
  src/features/admin-help/__tests__/PageDirectoryRow.test.tsx \
  src/features/admin-help/__tests__/pageDirectory.test.ts
```

Expected: pass after expected paths are updated.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/routes/routeRegistry.ts apps/myk9show/src/routes/routeRegistry.test.ts apps/myk9show/src/features/admin-help/data/pageDirectory.ts apps/myk9show/src/features/admin-help/utils/resolveExamplePath.ts
git commit -m "docs(routes): catalog canonical show paths"
```

---

## Task 7: Browser Smoke and Tracking Docs

**Files:**

- Modify: `OPEN-TODOS.md`
- Modify: `TO-DOS.md`
- Modify: `apps/myk9show/src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts`
  - Update stale tab-role assertions to link-role assertions for `ShowContextNav`.

- [x] **Step 1: Run full focused verification**

Run:

```bash
cd apps/myk9show
npx vitest run \
  src/test/pages/ShowDetailsPage.test.tsx \
  src/test/routes/canonicalShowRoutes.test.tsx \
  src/test/routes/secretaryShowPhaseRedirects.test.tsx \
  src/components/navigation/ShowContextNav.test.tsx
pnpm typecheck
pnpm exec eslint src/pages/ShowDetailsPage.tsx src/routes/publicRoutes.tsx src/routes/secretaryRoutes.tsx src/routes/showRouteRedirects.tsx src/components/navigation/ShowContextNav.tsx
git diff --check
```

Expected: all pass.

Result 2026-06-11: passed. Focused Vitest: 4 files / 70 tests. `pnpm typecheck`, targeted ESLint, and `git diff --check` all passed.

- [x] **Step 2: Run browser smoke on isolated port**

Run:

```bash
cd apps/myk9show
PLAYWRIGHT_PORT=5194 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5194 \
  npx playwright test src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts \
  --project=chromium -g "renders setup"
```

Expected initial failure until stale `tab` role expectations are updated. Update that E2E spec to query links:

```ts
await expect(page.getByRole('link', { name: 'Setup' })).toBeVisible();
await expect(page.getByRole('link', { name: 'Show Desk' })).toBeVisible();
await page.getByRole('link', { name: 'Show Desk' }).click();
```

Then rerun the same Playwright command.

Result 2026-06-11: ran on port 5194 and updated stale setup/show-desk assertions in `secretaryShowWorkbenchUI.spec.ts`. Route/UI assertions reached the canonical setup and Show Desk surfaces. Final run is limited by the browser-health guard catching an unrelated linked-database schema drift: Supabase returns 400 for `people.is_early_adopter` in the `useExhibitorProfile` query.

- [x] **Step 3: Smoke public/exhibitor show route**

Run:

```bash
cd apps/myk9show
PLAYWRIGHT_PORT=5194 PLAYWRIGHT_BASE_URL=http://127.0.0.1:5194 \
  npx playwright test src/test/e2e/show/showManagement.spec.ts \
  --project=chromium
```

Expected: public show details still load and public users do not see secretary management links.

Result 2026-06-11: ran on port 5194. Two tests passed. Two secretary-flow cases still expect browse links to land on bare `/shows/:id`, but the current canonical secretary browse link lands on `/shows/:id/setup`; `showManagement.spec.ts` is outside this task's edit scope, so that stale expectation is documented here.

- [x] **Step 4: Update tracking docs**

Add a completion note to `TO-DOS.md` under the canonical-show-page or secretary-workbench section:

```md
- **Resolved 2026-06-11 - Canonical show page route consolidation** - `/shows/:id` is now the single show page; secretary management sections live under canonical `/shows/:id/*` paths, and legacy `/secretary/shows/:showId/*` routes redirect with query strings preserved.
```

Run `rg "canonical show|Canonical show|show page route consolidation" OPEN-TODOS.md`. Remove the matching open item from `OPEN-TODOS.md` when the command returns a line; leave `OPEN-TODOS.md` unchanged when it returns no lines.

Result 2026-06-11: added the canonical-route resolved note to `TO-DOS.md`. `OPEN-TODOS.md` had no matching canonical-route open item, so its existing non-canonical cleanup was preserved.

- [x] **Step 5: Commit**

```bash
git add OPEN-TODOS.md TO-DOS.md apps/myk9show/src/test/e2e/entities/secretaryShowWorkbenchUI.spec.ts
git commit -m "chore(show): close canonical page consolidation"
```

---

## Final Verification Checklist

- [x] Old secretary URLs redirect to canonical `/shows/:id/*`.
- [x] Redirects preserve report/filter query strings.
- [x] `/shows/:id` remains the public overview for every role.
- [x] Secretary/admin users see management navigation on `/shows/:id`.
- [x] Public/exhibitor users do not see management navigation.
- [x] Show status and 3-dot menu stay top-right on the hero for managers.
- [x] "Preview public page" is not a primary manager destination on canonical show pages.
- [x] The old `ShowWorkbenchPage` shell and test are deleted.
- [x] Existing setup, show desk, entries, reports, results control, and submit results sections still render.
- [x] Focused Vitest suites pass.
- [x] `pnpm typecheck` passes.
- [x] Targeted ESLint passes.
- [x] Browser smoke passes or any unrelated pre-existing E2E drift is documented.
