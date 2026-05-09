# Show Data Access Deepening Plan

## Goal

Make `apps/myk9show/src/services/database/shows/` the authoritative Show data-access module so callers have one interface for Show reads and writes.

## Phase 1: Concentrate The Interface

- Status: Complete.
- Split Show write operations out of `shows/reads.ts` into `shows/writes.ts`.
- Moved PostgREST read fallbacks into `shows/reads.postgrest.ts`.
- Export reads and writes from `shows/index.ts`.
- Turned legacy `services/database/queries/showQueries.ts` into a compatibility adapter that re-exports from `services/database/shows`.

## Phase 2: Migrate High-Value Callers

- Status: Started.
- Added `getPublicShows` to the Show module.
- Migrated the guest browse query in `useBrowseShowsData` from direct Supabase access to `getPublicShows`.
- Continue moving direct `supabase.from('shows')` callers one at a time when the behavior is reusable.

## Phase 3: Testing

- Status: Complete for this slice.
- Added focused tests for `getPublicShows`.
- Ran focused Show database tests.
- Ran myK9Show TypeScript checks.
- Ran focused ESLint on touched TypeScript files.
