# Armband-Based Dog Lookup Design

**Date:** 2026-03-19
**Status:** Design complete, ready for implementation

## Summary

Add a quick armband number lookup to the ShowDetailsPage header. Staff and exhibitors type an armband number to instantly see the dog's info and their entries at that show, without navigating away from the page.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Show context | Implicit from ShowDetailsPage URL | Staff are already on the show page; avoids "which show?" question |
| Input placement | Page header, right-aligned | Always visible, zero clicks to start typing, fastest for repeated use |
| Result display | Inline popover card | No navigation disruption; fast for repeated lookups |
| Result content | Dog info + class entries with status | Answers "who is this dog and what are they doing today?" in one glance |
| Visibility | Only when show has armbands assigned | No point showing the input if no armbands exist yet |

## Data Layer

### New file: `armbandQueries.ts`

Two query functions:

**`getArmbandCountForShow(showId: string)`**
- `supabase.from('armbands').select('id', { count: 'exact', head: true }).eq('show_id', showId)`
- Returns count (number). Used to conditionally render the lookup input.

**`lookupDogByArmband(showId: string, armbandNumber: string)`**
- Queries `armbands` table where `show_id` and `armband_number` match
- Joins `dogs` (name, breed, sex, id) via `dog_id` FK
- Joins `people` via `dogs.owner` FK (first_name, last_name) for owner name
- Also fetches that dog's entries at this show: `entries` where `dog_id` and `show_id` match, joined to `classes` (name, level, status)
- Returns a single result object or null

### Return shape

```typescript
interface ArmbandLookupResult {
  armband_number: string;
  dog: {
    id: string;
    name: string;
    breed: string;
    sex: string;
  };
  owner: {
    first_name: string;
    last_name: string;
  };
  entries: Array<{
    id: string;
    entry_status: string | null;
    class_name: string;
    class_level: string | null;
  }>;
}
```

### React Query hooks

**`useArmbandCount(showId: string)`**
- Fires on mount. Returns `{ count: number, isLoading: boolean }`.
- Cache strategy: `moderate` (5min) — armband count rarely changes mid-session.

**`useArmbandLookup(showId: string, armbandNumber: string | null)`**
- `enabled: !!armbandNumber` — only fires when user submits a number.
- Returns `{ data: ArmbandLookupResult | null, isLoading, isError }`.
- No caching needed (staleTime: 0) — always fetch fresh for accuracy.

## UI Components

### `ArmbandLookup` component

**File:** `apps/myk9show/src/components/shows/ArmbandLookup.tsx`

**Props:** `showId: string`

**Behavior:**
- Compact input (~120px) with search icon and placeholder "Armband #"
- User types number, presses Enter → sets `armbandNumber` state triggering the query
- Loading: small spinner in the input
- Success: popover opens below input with result card
- Not found: popover shows "No dog found with armband #X"
- Dismiss: click outside, Escape, or clear input
- Auto-selects input content on focus for rapid re-entry

### Result card (inside popover)

**Dog info section (top):**
- Armband number badge (prominent)
- Dog name (bold)
- Breed and sex
- Owner name
- "View profile" link → `/dogs/:id`

**Class entries section (bottom):**
- "Entries at this show (N)" header
- Each entry: class name + level, entry status badge
- Max height with scroll if > 4-5 entries
- Empty state: "No entries found"

**Popover:** ~320px wide, uses shadcn/ui `Popover` component.

## Integration

### ShowDetailsPage changes

1. Call `useArmbandCount(showId)` on mount
2. If `count > 0`, render `<ArmbandLookup showId={showId} />` in the page header area, right-aligned
3. No other page changes needed

## Files to Create or Modify

### Create
- `apps/myk9show/src/services/database/queries/armbandQueries.ts` — query functions
- `apps/myk9show/src/hooks/queries/useArmbandLookup.ts` — React Query hooks
- `apps/myk9show/src/components/shows/ArmbandLookup.tsx` — input + popover component

### Modify
- `apps/myk9show/src/pages/ShowDetailsPage.tsx` — add `useArmbandCount` check and render `ArmbandLookup`

## Testing

- Unit tests for `ArmbandLookup` component: renders input when count > 0, hides when count = 0, shows popover on submit, shows "not found" state, shows dog info + entries on success, dismisses popover
- Unit tests for query functions (mocked supabase)
- Unit tests for hooks (mocked queries)
