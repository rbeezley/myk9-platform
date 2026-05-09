# Entry Data Access Deepening Plan

## Goal

Make `apps/myk9show/src/services/database/entries/` the single Entry data-access
module so callers do not need to know about legacy query barrels, replicated
tables, direct Supabase chains, status payload details, or fallback behavior.

Entry is the unit of ringside work. A deep Entry module should protect secretary,
exhibitor, scoring, reporting, and financial workflows from schema and storage
details.

## Current Shape

- `services/database/queries/entryQueries.ts` is already a redirect barrel to
  `services/database/entries`.
- `services/database/entries/index.ts` is the intended public interface.
- `reads.ts`, `writes.ts`, `search.ts`, and `secretary.ts` contain real
  implementation.
- Some callers still import from the legacy query path.
- Some high-value scoring pages still import replicated Entry tables directly.
- `entries/index.ts` exports two status update interfaces indirectly:
  - `secretary.updateEntryStatus(entryId, status, withdrawalReason?)`
  - `writes.updateEntryStatus({ id, status, userId, reason? })`

## Phase 1: Concentrate The Public Interface

- Status: Started.
- Export all intended Entry read functions from `entries/index.ts`.
- Add missing aliases needed by callers that still depend on class-query naming,
  especially `getEntriesByClassId`.
- Make the two status update interfaces explicit:
  - keep secretary-facing `updateEntryStatus(entryId, status, withdrawalReason?)`
    as the default exported name from `entries`.
  - export the audit/user-aware version with a distinct name such as
    `updateEntryStatusWithAudit`.
- Keep `services/database/queries/entryQueries.ts` as a compatibility adapter
  only.

## Phase 2: Improve Locality Inside The Entry Module

- Status: Not started.
- Move repeated PostgREST select strings into private constants or private
  helper modules under `entries/`.
- Move repeated replicated join logic into private helpers, keeping it behind
  the Entry module interface.
- Keep PostgREST fallback behavior private to Entry reads/search.
- Keep status payload mapping private to Entry writes/secretary operations.

## Phase 3: Migrate High-Value Callers

- Status: Started.
- Complete: migrated `components/entries/EntryEditDialog.tsx` from
  `services/database/queries/entryQueries` to `services/database/entries`.
- Complete: migrated `hooks/queries/useEntriesDatabase.ts` from the legacy query path to
  `services/database/entries`.
- Complete: migrated `hooks/queries/useClassesDatabase.ts` from
  `getEntriesByClassId` in class queries to the Entry module alias.
- Evaluate scoring page direct replicated-table imports one at a time:
  `ScoresheetPage.tsx`, `ScoringEntryListPage.tsx`, and
  `PaperScoresheetPage.tsx`.

## Phase 4: Testing

- Status: Not started.
- Add or update focused Entry module tests for:
  - `getEntriesByClassId` alias behavior.
  - secretary status update payloads.
  - audit/user-aware status update payloads.
  - replicated read sorting and armband backfill behavior.
- Run the focused Entry tests.
- Run myK9Show typecheck.
- Run focused lint on touched TypeScript files.

## Exit Criteria

- New Entry callers import from `@/services/database/entries`.
- Legacy `entryQueries.ts` remains only as a compatibility adapter.
- Callers do not need to know whether reads use replicated tables, PostgREST
  fallback, or direct Supabase joins.
- Entry status updates have names that make their different interfaces obvious.
- Focused tests and typecheck pass.
