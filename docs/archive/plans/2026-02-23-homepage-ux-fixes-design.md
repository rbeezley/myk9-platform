# Homepage UX Fixes Design

**Date:** 2026-02-23
**Status:** Approved

## Problem

Authenticated users see the same marketing landing page as anonymous visitors: hero image, sales CTAs ("Get Started", "View Premium Pricing"), hardcoded placeholder shows from 2025, and FAQ. This wastes their time and feels unpolished.

Additionally, five nav icon buttons lack `aria-label` attributes, making them inaccessible to screen readers.

## Changes

### 1. Redirect authenticated users from `/` to `/shows`

Create a `HomeRedirect` wrapper component that:

- Reads auth state from `AuthContext`
- Authenticated users: `<Navigate to="/shows" replace />`
- Unauthenticated users (or auth loading): render `<Home />`

Wire this at the `/` route in `App.tsx`. No changes to `Home.tsx` layout.

**Files:** `App.tsx` (modify route), new small wrapper component or inline logic.

### 2. Replace hardcoded "Upcoming Shows" with real data

Replace the static `src/data/upcomingShows.ts` import with a Supabase query:

- Query: shows where `start_date >= now()`, ordered by `start_date` ascending, limit 5
- Cache: React Query with `cacheStrategies.moderate` (5 min)
- Empty state: "No upcoming shows — check back soon"
- Delete `src/data/upcomingShows.ts` after migration

**Files:** `Home.tsx` (swap data source), new query hook or inline query, delete `upcomingShows.ts`.

### 3. Add aria-labels to nav icon buttons

In `AppHeader.tsx`, add `aria-label` to:

| Button | Label |
|--------|-------|
| Menu toggle | `"Toggle menu"` |
| Search | `"Search"` |
| Cart | `"Shopping cart"` |
| Theme toggle | `"Toggle theme"` |
| Profile avatar | `"Account menu"` |

**Files:** `AppHeader.tsx`

## Out of Scope

- Building a dedicated dashboard page
- Changing the landing page layout for anonymous visitors
- Modifying the "Get Started" or "View Premium Pricing" CTAs (these remain for anonymous visitors, which is correct)

## Testing

- Verify authenticated visit to `/` redirects to `/shows`
- Verify unauthenticated visit to `/` shows the landing page
- Verify "Upcoming Shows" pulls from database (or shows empty state)
- Verify screen reader announces all nav buttons correctly
