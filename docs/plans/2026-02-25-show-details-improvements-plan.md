# Show Details Post-Creation Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken show edit route and enhance trial cards with class/entry counts and quick-action buttons.

**Architecture:** Two focused changes — (1) add a redirect route that auto-opens the existing ShowEditPanel, (2) enrich trial card rendering in ShowDetailsMain with per-trial stats and action buttons using data already available from `useClassStoreCompat`.

**Tech Stack:** React Router, Zustand stores, existing shadcn/ui components

---

### Task 1: Add edit route to secretaryRoutes.tsx

**Files:**
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx:59` (after wizard route)

**Step 1: Add imports and redirect component**

[EXPANDED] Change the react-router-dom import on line 8 from:
```tsx
import { Route } from 'react-router-dom';
```
to:
```tsx
import { Route, useParams, useNavigate } from 'react-router-dom';
```

Add `useEffect` import on line 1 — change:
```tsx
import { lazy } from 'react';
```
to:
```tsx
import { lazy, useEffect } from 'react';
```

Add the redirect component above the `SecretaryRoutes` export (before line 32):
```tsx
const ShowEditRedirect: React.FC = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/shows/${showId}?edit=true`, { replace: true });
  }, [showId, navigate]);
  return null;
};
```

**Step 2: Add the route**

Add route after the wizard route (after line 59):
```tsx
{/* Show Edit Redirect - opens ShowDetailsPage with edit panel */}
<Route path="/secretary/shows/:showId/edit" element={
  <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
    <SuspenseWrapper>
      <ShowEditRedirect />
    </SuspenseWrapper>
  </ProtectedRoute>
} />
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat(routes): add /secretary/shows/:showId/edit redirect route"
```

---

### Task 2: Auto-open ShowEditPanel from URL param

**Files:**
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx:29-30,73`

**Step 1: Read `?edit=true` and auto-open panel**

[EXPANDED] Change the react-router-dom import on line 2 of ShowDetailsPage.tsx from:
```tsx
import { useParams, useNavigate } from 'react-router-dom';
```
to:
```tsx
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
```

After line 73 (`const [showEditPanel, setShowEditPanel] = useState(false);`), add a `useEffect`:

```tsx
// Auto-open edit panel when redirected from /secretary/shows/:id/edit
const [searchParams, setSearchParams] = useSearchParams();
useEffect(() => {
  if (searchParams.get('edit') === 'true') {
    setShowEditPanel(true);
    // Clean up the URL param
    searchParams.delete('edit');
    setSearchParams(searchParams, { replace: true });
  }
}, [searchParams, setSearchParams]);
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(show-details): auto-open edit panel from ?edit=true URL param"
```

---

### Task 3: Add per-trial class and entry counts to trial cards

**Files:**
- Modify: `apps/myk9show/src/components/shows/ShowDetailsMain.tsx:66-113,425-443`

**Step 1: Create per-trial stats lookup**

The data is already available: `allClasses` and `allEntries` from `useClassStoreCompat()` (line 63). Add a per-trial stats memo after the `stats` memo (after line 113):

```tsx
// Per-trial class and entry counts for trial cards
const trialStats = useMemo(() => {
  const statsMap: Record<string, { classCount: number; entryCount: number }> = {};
  associatedTrials.forEach(trial => {
    const trialClasses = allClasses.filter(c => c.trialId === trial.id);
    const classIds = new Set(trialClasses.map(c => c.id));
    const trialEntries = allEntries.filter(e => classIds.has(e.classId));
    statsMap[trial.id] = {
      classCount: trialClasses.length,
      entryCount: trialEntries.length,
    };
  });
  return statsMap;
}, [associatedTrials, allClasses, allEntries]);
```

**Step 2: Add stats and buttons to trial card JSX**

In the trial card (lines 425-443), after the details grid closing `</div>` (line 443) and before the closing `</div>` of `flex-1` (line 444), add:

```tsx
{/* Class & Entry Counts */}
<div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
  <span>{trialStats[trial.id]?.classCount || 0} classes</span>
  <span className="text-muted-foreground/40">·</span>
  <span>{trialStats[trial.id]?.entryCount || 0} entries</span>
</div>

{/* Quick Actions */}
<PermissionGuard permission={PERMISSIONS.SHOW_MANAGE}>
  <div className="flex items-center gap-2 mt-3">
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/secretary/create-show/wizard?showId=${showData.id}&mode=add-classes`);
      }}
    >
      <Plus className="w-3 h-3 mr-1" />
      Add Classes
    </Button>
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/trials/${trial.id}/classes`);
      }}
    >
      Manage Classes
    </Button>
  </div>
</PermissionGuard>
```

Note: `Plus` icon is already imported (line 5). `PERMISSIONS` and `PermissionGuard` already imported (lines 13-14). `navigate` already available (line 41). `showData` is a prop (line 22).

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowDetailsMain.tsx
git commit -m "feat(show-details): add class/entry counts and action buttons to trial cards"
```

---

### Task 4: Visual verification

**Step 1: Start dev server and verify**

Run: `pnpm dev:show`

Verify:
1. Navigate to a show details page — trial cards show class/entry counts and action buttons
2. Navigate to `/secretary/shows/<any-show-id>/edit` — redirects to show details with edit panel open
3. "Add Classes" button navigates to wizard in add-classes mode
4. "Manage Classes" button navigates to class management page

**Step 2: Run full typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

**Step 3: Final commit if any cleanup needed**
