# Show Details Post-Creation Improvements

**Date:** 2026-02-25
**Status:** Approved

## Problem

After creating a show via the wizard, the secretary's most common action is to review and tweak details. Two gaps make this harder than necessary:

1. `ShowManagementPage` navigates to `/secretary/shows/:showId/edit` which doesn't exist (dead link)
2. Trial cards on ShowDetailsPage don't show class/entry counts or quick-action buttons, forcing multiple navigation hops

## Changes

### 1. Fix broken edit route

Add `/secretary/shows/:showId/edit` to `secretaryRoutes.tsx`. This route redirects to `ShowDetailsPage` with the `ShowEditPanel` auto-opened (via URL search param `?edit=true`).

**Files:**
- `secretaryRoutes.tsx` — add route
- `ShowDetailsPage.tsx` — read `?edit=true` param, auto-open ShowEditPanel on mount

### 2. Enhanced trial cards

Add to each trial card in `ShowDetailsMain.tsx`:

- **Stats line:** "{N} classes · {N} entries" using existing store data
- **"Add Classes" button** — navigates to `/secretary/create-show/wizard?showId=X&mode=add-classes&trialId=Y`
- **"Manage Classes" button** — navigates to `/trials/:trialId/classes` (existing route)

Judge assignment remains at the class level (via class management page). No trial-level judge UI.

### Out of scope (YAGNI)

- Full-page edit form
- Wizard re-edit mode
- Inline class editing from show details
- New secretary routes beyond the edit redirect
