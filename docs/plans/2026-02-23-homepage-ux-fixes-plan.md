# Homepage UX Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redirect authenticated users from `/` to `/shows`, replace hardcoded landing page shows with real DB data, and add missing aria-labels to nav buttons.

**Architecture:** Route-level auth redirect in `App.tsx`, swap static import in `Home.tsx` for the existing `useUpcomingShowsQuery` hook, add `aria-label` props to 5 icon buttons in `AppHeader.tsx`.

**Tech Stack:** React Router (`Navigate`), React Query (`useUpcomingShowsQuery`), existing `AuthContext`, shadcn/ui `Button`

---

### Task 1: Redirect authenticated users from `/` to `/shows`

**Files:**
- Modify: `apps/myk9show/src/App.tsx:215`

**Step 1: Create the HomeRedirect wrapper**

In `App.tsx`, add a small component that checks auth state. Import `useAuthContext` and `Navigate`:

```tsx
// Add to imports at top of App.tsx
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';

// Add above the App function (after PageLoadingFallback)
// [EXPANDED] Preserve ?wizard=true redirect for authenticated users
const HomeRedirect = () => {
  const { user, loading } = useAuthContext();
  if (loading) return <PageLoadingFallback />;
  if (user) {
    // Preserve ?wizard=true query param behavior (redirects to show creation wizard)
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === 'true') {
      return <Navigate to="/secretary/create-show/wizard" replace />;
    }
    return <Navigate to="/shows" replace />;
  }
  return <Home />;
};
```

**Step 2: Replace the `/` route element**

Change line 215 from:
```tsx
<Route path="/" element={<PageTransition><Home /></PageTransition>} />
```
To:
```tsx
<Route path="/" element={<PageTransition><HomeRedirect /></PageTransition>} />
```

**Step 3: Verify in preview**

- Sign in → visit `/` → should redirect to `/shows`
- Sign in → visit `/?wizard=true` → should redirect to `/secretary/create-show/wizard` [ADDED]
- Sign out → visit `/` → should show landing page

**Step 4: Commit**

```bash
git add apps/myk9show/src/App.tsx
git commit -m "feat: redirect authenticated users from homepage to /shows"
```

---

### Task 2: Replace hardcoded "Upcoming Shows" with database query

**Files:**
- Modify: `apps/myk9show/src/pages/Home.tsx`
- Delete: `apps/myk9show/src/data/upcomingShows.ts`

**Context:** An existing hook `useUpcomingShowsQuery` (in `hooks/queries/useShowsDatabase.ts`) already queries Supabase for shows where `start_date >= today`. It returns `Show[]` objects with `id`, `name`, `startDate`, `location`, etc. The `UpcomingShows` component expects `{ id, title, date, location, imageUrl }[]`. We need a small mapping.

**Step 1: Update Home.tsx imports and remove dead wizard redirect** [EXPANDED]

Remove:
```tsx
import upcomingShows from '@/data/upcomingShows';
```

Also remove the now-unreachable `?wizard=true` useEffect (lines 21-26 in Home.tsx), since `HomeRedirect` in Task 1 handles this before `Home` renders for authenticated users. The `useNavigate` import can also be removed if no longer used.

Add:
```tsx
import { useUpcomingShowsQuery } from '@/hooks/queries/useShowsDatabase';
```

**Step 2: Replace memoized static data with query hook**

Inside the `Home` component, remove:
```tsx
const memoizedUpcomingShows = useMemo(() => upcomingShows, []);
```

Add:
```tsx
const { data: dbShows, isLoading: showsLoading } = useUpcomingShowsQuery(5);

// Map DB shows to the shape UpcomingShows component expects
const mappedShows = useMemo(() =>
  (dbShows || []).map(show => ({
    id: show.id,
    title: show.name,
    date: show.startDate && show.endDate
      ? `${new Date(show.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(show.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : show.startDate
        ? new Date(show.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'TBD',
    location: show.location || 'Location TBD',
    imageUrl: '', // No images in DB — ShowCard handles missing images
  })),
  [dbShows]
);
```

**Step 3: Pass mapped data and loading state to UpcomingShows**

Change the `UpcomingShows` usage from:
```tsx
<UpcomingShows
  shows={memoizedUpcomingShows}
  variant="carousel"
  className="mt-8"
/>
```
To:
```tsx
<UpcomingShows
  shows={mappedShows}
  variant="carousel"
  className="mt-8"
  isLoading={showsLoading}
  isEmpty={!showsLoading && mappedShows.length === 0}
/>
```

**Step 4: Remove unused imports**

Remove `useMemo` from imports if no longer used (check — `memoizedFeatures` and `memoizedFaqs` still use it, so keep it). Remove only the `upcomingShows` import line.

**Step 5: Delete the hardcoded data file**

```bash
git rm apps/myk9show/src/data/upcomingShows.ts
```

**Step 6: Verify in preview**

- Visit `/` while signed out → "Upcoming Shows" section should show real DB shows or empty state
- Check console for errors

**Step 7: Commit**

```bash
git add apps/myk9show/src/pages/Home.tsx
git commit -m "feat: replace hardcoded upcoming shows with database query"
```

---

### Task 3: Add aria-labels to nav icon buttons

**Files:**
- Modify: `apps/myk9show/src/components/layout/AppHeader.tsx`

**Step 1: Add aria-label to mobile menu toggle (line ~109-116)**

Change:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
  className="md:hidden p-2"
>
```
To:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
  className="md:hidden p-2"
  aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
>
```

**Step 2: Add aria-label to mobile search button (line ~119-126)**

Change:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setCommandPaletteOpen(true)}
  className="lg:hidden p-2"
>
```
To:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setCommandPaletteOpen(true)}
  className="lg:hidden p-2"
  aria-label="Search"
>
```

**Step 3: Add aria-label to cart button (line ~130-141)**

Change:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => navigate('/cart')}
  className="p-2 relative"
>
```
To:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => navigate('/cart')}
  className="p-2 relative"
  aria-label="Shopping cart"
>
```

**Step 4: Add aria-label to theme toggle button (line ~147-172)**

Change:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={toggleTheme}
  className="p-2 rounded-lg"
>
```
To:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={toggleTheme}
  className="p-2 rounded-lg"
  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
```

**Step 5: Add aria-label to profile dropdown trigger (line ~177)**

Change:
```tsx
<Button variant="ghost" className={`${buildClasses.button.ghost} flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50`}>
```
To:
```tsx
<Button variant="ghost" className={`${buildClasses.button.ghost} flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50`} aria-label="Account menu">
```

**Step 6: Verify in preview**

- Use preview snapshot to confirm all buttons now have labels
- Check no visual regressions

**Step 7: Commit**

```bash
git add apps/myk9show/src/components/layout/AppHeader.tsx
git commit -m "fix(a11y): add aria-labels to nav icon buttons"
```

---

### Task 4: Final verification

**Step 1: Run typecheck**

```bash
cd apps/myk9show && pnpm typecheck
```

Expected: 0 errors

**Step 2: Verify all flows in preview**

1. Signed out → `/` shows landing page with real shows (or empty state)
2. Sign in → `/` redirects to `/shows`
3. Nav buttons all have aria-labels (check snapshot)
4. No console errors

**Step 3: Commit any remaining fixes**

If typecheck reveals issues, fix and commit.

---

### [ADDED] Notes: Out-of-scope dead code identified during verification

The following are pre-existing dead code not caused by this change, but noted for future cleanup:
- `LandingShow` type defined in both `types.ts:2` and `types/index.ts:220`
- `components/landing/UpcomingShowsSection.tsx` — not imported by any component (different from `components/shows/UpcomingShows.tsx` which is used)
- These are safe to delete in a future cleanup pass but not part of this plan's scope.
