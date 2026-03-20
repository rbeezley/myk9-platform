# Trash View for Soft-Deleted Records

**Date:** 2026-03-19
**Status:** Design complete, ready for implementation

## Summary

Extend the existing `DeletedEntitiesTab` at `/admin/data-lifecycle` to cover all 7 soft-delete-enabled entity types. Currently only clubs and dogs are shown. Add shows, trials, classes, entries, and people.

## Current State

### Tables with `deleted_at` + `deleted_by` columns
- clubs, shows, trials, classes, entries (migration 007)
- dogs, people (migration 008)

### Existing query helpers (getDeleted / restore / hardDelete)
- **Dogs** — `dogQueries.ts`: `getDeletedDogs()`, `restoreDog()`, `hardDeleteDog()`
- **Shows** — `showQueries.ts`: `getDeletedShows()`, `restoreShow()`, `hardDeleteShow()`
- **Clubs** — `clubQueries.ts`: `getDeletedClubs()`, `restoreClub()`, `hardDeleteClub()`

### Existing UI
- `DeletedEntitiesTab.tsx` inside `DataLifecycleManagement` at `/admin/data-lifecycle`
- Shows stacked sections for clubs and dogs
- Site admin only (RLS + route protection)

### Existing RPCs
- `soft_delete_dog` — ownership check, sets deleted_at/deleted_by
- `soft_delete_show` — permission check, cascades to entries → classes → trials → show
- `hard_delete_show` — platform admin only, permanently deletes show + all children

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to build | Extend existing `DeletedEntitiesTab` | Page, route, and sidebar already exist |
| Restore behavior | Restore entity only (no cascade) | Gives admins precise control; child records can be restored individually |
| Hard delete method | Direct DELETE from app (no new RPCs) | Follows existing pattern for dogs/clubs; FK constraints enforce integrity |
| Hard delete confirmation | Single confirm dialog | Site-admin-only audience; standard "Are you sure?" is sufficient |
| Section layout | Collapsible sections with badge counts | Scales to 7 entity types without endless scroll or tabs-within-tabs |

## Implementation

### 1. Data Layer — New Query Functions

Add to existing or new query files for **trials, classes, entries, people**:

```typescript
// Pattern for each entity type:
async function getDeletedTrials(): Promise<DeletedTrial[]> {
  // SELECT *, deleted_by_email FROM trials WHERE deleted_at IS NOT NULL
  // Join deleted_by to auth.users or people for email
  // Include contextual info (e.g., show name for trials)
}

async function restoreTrial(id: string): Promise<void> {
  // UPDATE trials SET deleted_at = null, deleted_by = null WHERE id = ?
}

async function hardDeleteTrial(id: string): Promise<void> {
  // DELETE FROM trials WHERE id = ?
}
```

Each `getDeleted*` query returns:
- Entity id and name/title
- `deleted_at` timestamp
- `deleted_by` user email (joined)
- Contextual info: show name for trials, trial name for classes, class name for entries

### 2. UI — Reworked DeletedEntitiesTab

Replace stacked open sections with **collapsible sections**:

- **Section order:** Shows → Trials → Classes → Entries → Dogs → Clubs → People (hierarchy first, standalone last)
- **Each section header:** Entity type name + badge count (e.g., "Shows (3)")
- **All sections collapsed by default**
- **Lazy data loading:** Fetch full records only on first expand
- **"Trash is empty" state:** If all counts are zero, show a single empty message instead of 7 collapsed sections

### 3. Badge Counts — Eager Loading

On page mount, fire one lightweight count query per entity type:

```typescript
const { count } = await supabase
  .from('shows')
  .select('id', { count: 'exact', head: true })
  .not('deleted_at', 'is', null);
```

This gives badge numbers without fetching full rows. Seven parallel count queries on mount.

### 4. Per-Record Actions

Each deleted record displays:
- Entity identifier (name/title)
- Contextual parent info (e.g., "Show: Spring Classic" for a trial)
- Deletion metadata: "Deleted 3 days ago by admin@example.com"
- **Restore** button (green outline) — clears `deleted_at` and `deleted_by`
- **Delete Forever** button (red/destructive) — direct DELETE with confirmation dialog

After any action, refetch that section's data and update its badge count.

### 5. Confirmation Dialog

Standard destructive confirmation dialog for hard delete:
- Title: "Permanently Delete {Entity Type}?"
- Body: "This will permanently delete **{entity name}**. This action cannot be undone."
- Buttons: Cancel / Delete Forever (destructive variant)

## Files to Create or Modify

### Modify
- `apps/myk9show/src/components/admin/DeletedEntitiesTab.tsx` — Rework to collapsible sections
- `apps/myk9show/src/services/database/queries/showQueries.ts` — Verify existing helpers
- `apps/myk9show/src/services/database/queries/clubQueries.ts` — Verify existing helpers
- `apps/myk9show/src/services/database/queries/dogQueries.ts` — Verify existing helpers

### Add query functions to existing or new files
- Trial queries: `getDeletedTrials()`, `restoreTrial()`, `hardDeleteTrial()`
- Class queries: `getDeletedClasses()`, `restoreClass()`, `hardDeleteClass()`
- Entry queries: `getDeletedEntries()`, `restoreEntry()`, `hardDeleteEntry()`
- People queries: `getDeletedPeople()`, `restorePerson()`, `hardDeletePerson()`

### Possibly create
- `apps/myk9show/src/components/admin/DeletedEntitySection.tsx` — Reusable collapsible section component (if extraction keeps DeletedEntitiesTab under 500 lines)

## Testing

- Unit tests for each new query function (getDeleted, restore, hardDelete)
- Unit tests for DeletedEntitiesTab: renders sections, expands/collapses, shows counts
- Unit tests for DeletedEntitySection: restore action, delete action, confirmation dialog
- Verify RLS: non-admin users cannot access deleted records
