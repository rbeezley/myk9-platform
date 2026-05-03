# Design: ClassCheckIn Page — Real Data + ShowDay Entry Points

**Date:** 2026-05-03  
**Status:** Approved

## Problem

`/exhibitor/check-in/:entryId` is a registered route that renders `ClassCheckIn`. The component receives no props when navigated to directly, so it falls back to `createMockClassInfo()` — fake names, fake armband, fake class. The route exists but is non-functional.

Additionally, `ShowDayPage` has no way to reach this route — there is no "Manage →" link on any entry row.

## Scope

- Wire `/exhibitor/check-in/:entryId` to real Supabase data.
- Add a "Manage check-in →" secondary link to `NextUpCard` and `ClassTimelineCard`.
- Do not change the existing inline one-tap "Check In" button in those cards.
- Do not implement handler-change backend; the `availableHandlers` prop stays `[]`.

## Architecture

Two deliverables: a data layer (new hook + new page) and navigation entry points (prop additions to two cards).

```
ShowDayPage
  └─ ShowDayHero  (new: onManage prop)
       ├─ NextUpCard      (new: onManage prop + "Manage →" button)
       └─ ClassTimelineCard  (new: onManage prop + "Manage →" button)
             │  navigate(`/exhibitor/check-in/${entryId}`)
             ▼
       ClassCheckInPage  (NEW — reads entryId from URL)
         ├─ useClassCheckInData(entryId)  (NEW hook)
         └─ <ClassCheckIn classInfo={…} onCheckIn={handleCheckIn} />
                                │  on success
                                ▼
                          useCheckInMutation  (existing)
                          navigate('/exhibitor/show-day')
```

## New Files

### `apps/myk9show/src/hooks/queries/useClassCheckInData.ts`

Single React Query hook. Takes `entryId: string` as a parameter. Reads `userId` from `useAuthContext()` internally (same pattern as `useShowDayData`). Query key: `['entries', entryId, 'checkin-data']`. Disabled when `!userId || !entryId`.

**Schema verification required at implementation time:** `classes.start_time` and `classes.judge_name` are not selected by any existing hook. Verify these columns exist in the schema before writing the query. If they don't exist, map those fields to sensible defaults (`startTime: new Date().toISOString()`, `judgeName: 'TBD'`) and note the gap.

Supabase query:

```sql
entries
  id, entry_status, armband, run_order,
  handler_id,
  dog: dogs!inner(id, call_name, breed, sex, date_of_birth),
  class: classes!inner(
    id, name, element, level, max_entries, ring_number, start_time,
    judge_name,
    trial: trials!inner(
      id, name, date, start_time, end_time, location, organization,
      show: shows!inner(id, name)
    )
  )
.eq('id', entryId)
.eq('handler_id', userId)   -- userId from useAuthContext(); belt-and-suspenders over RLS
.single()
```

Maps raw row → `ExhibitorClassInfo`:

- `class` → `ShowClass` (id, showId from trial.show.id, trialId, name, element, level, maxEntries, judgeName, startTime, ringNumber)
- `trial` → `Trial` (id, showId, name, date, startTime, endTime, location, organization)
- entry row → `ExhibitorEntry` (id, classId, dogId, handlerId, armband, runningOrder, checkInStatus mapped from entry_status, dogCallName, dogRegistrationNumber as '', breed, handlerName as '', className from class.name, ringNumber, judgeName)
- `ringStatus` → minimal stub: `{ classId, className, ringNumber, judgeName, judgeStatus: 'active', totalEntries: 0, completedEntries: 0, onDeck: [], lastUpdated: new Date() }`

Returns `{ data: ExhibitorClassInfo | null, isLoading, error }`.

### `apps/myk9show/src/pages/ClassCheckInPage.tsx`

Reads `entryId` from `useParams<{ entryId: string }>()`. Reads `userId` from `useAuthContext()`.

States:

| State | UI |
|---|---|
| `isLoading` | Full-page spinner (same pattern as ShowDayPage) |
| `error` | Error card + Retry button |
| `data === null` | 404 card ("Entry not found") + Back button |
| `data` present | `<ClassCheckIn classInfo={data} onCheckIn={handleCheckIn} availableHandlers={[]} />` |

`handleCheckIn`:

```ts
const toCheckInStatus = (s: 'present' | 'scratch'): CheckInStatus =>
  s === 'present' ? 'checked-in' : 'pulled';

const handleCheckIn = async (req: CheckInRequest) => {
  await checkInMutation.mutateAsync({
    entryId: req.entryId,
    newStatus: toCheckInStatus(req.status),
  });
  navigate('/exhibitor/show-day');
};
```

Uses `useMutation`'s `mutateAsync` so the `ClassCheckIn` component's `isSubmitting` state reflects real async progress.

## Modified Files

### `routes/publicRoutes.tsx`

```diff
- const ClassCheckIn = lazy(() => import('@/components/exhibitor/ClassCheckIn'));
+ const ClassCheckInPage = lazy(() => import('@/pages/ClassCheckInPage'));

  <Route
    path="/exhibitor/check-in/:entryId"
    element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition>
-           <ClassCheckIn />
+           <ClassCheckInPage />
          </PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    }
  />
```

`routeRegistry.ts` already has the correct path — no change needed there.

### `components/exhibitor/NextUpCard.tsx`

Add `onManage?: ((entryId: string) => void) | undefined` to `NextUpCardProps`.

Add below the existing green Check In button (and below the `CheckInStatusMenu` when already checked in):

```tsx
{onManage && (
  <button
    type="button"
    onClick={e => { e.stopPropagation(); onManage(classData.entryId); }}
    className="mt-2 w-full text-center text-sm text-muted-foreground hover:underline underline-offset-2 min-h-[44px]"
  >
    Manage check-in →
  </button>
)}
```

### `components/exhibitor/ClassTimelineCard.tsx`

Same `onManage` prop pattern and same button, placed below the existing check-in status badge area.

### `components/exhibitor/ShowDayHero.tsx`

Add `onManage?: ((entryId: string) => void) | undefined` to `ShowDayHeroProps`. Pass it to `NextUpCard` and all `ClassTimelineCard` instances (not to completed cards — scratch/manage is irrelevant post-completion).

### `pages/ShowDayPage.tsx`

Pass `onManage={entryId => navigate(\`/exhibitor/check-in/${entryId}\`)}` into `<ShowDayHero />`.

## Type Mapping

`ClassCheckIn` uses `CheckInRequest.status: 'present' | 'scratch'` (local `exhibitor-types.ts`).  
The RPC `self_checkin_entry` and `useCheckInMutation` expect `CheckInStatus` from `@myk9/core`.

Translation (lives only in `ClassCheckInPage`):

| `CheckInRequest.status` | `CheckInStatus` (DB) |
|---|---|
| `'present'` | `'checked-in'` |
| `'scratch'` | `'pulled'` |

## Testing

### `hooks/queries/__tests__/useClassCheckInData.test.ts`

- Returns mapped `ExhibitorClassInfo` on success
- Returns `null` when Supabase returns no row (entry not found or wrong owner)
- Throws on Supabase error

### `pages/__tests__/ClassCheckInPage.test.tsx`

Uses custom `testUtils` render wrapper.

- Shows spinner while loading
- Shows error card on fetch failure
- Shows 404 card when data is null
- Renders `ClassCheckIn` with real data when loaded
- Calls mutation with `{ entryId, newStatus: 'checked-in' }` when `onCheckIn` called with `'present'`
- Calls mutation with `{ entryId, newStatus: 'pulled' }` when `onCheckIn` called with `'scratch'`
- Navigates to `/exhibitor/show-day` after successful mutation

### `components/exhibitor/__tests__/NextUpCard.test.tsx` (extend existing)

- `onManage` button renders when prop provided
- `onManage` button absent when prop omitted
- Clicking "Manage check-in →" calls `onManage(entryId)`

### `components/exhibitor/__tests__/ClassTimelineCard.test.tsx` (extend existing)

Same three cases as NextUpCard.

## Out of Scope

- Handler-change backend (`availableHandlers` stays `[]`)
- `ShowDayHero` completed-class rows (no Manage button — scratch/manage irrelevant post-run)
- E2E Playwright tests (pre-existing timeout issues per CLAUDE.md)
- `routeRegistry.ts` priority changes (route already listed as `publicRouteComponents`)
