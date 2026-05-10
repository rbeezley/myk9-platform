# Entry Lifecycle Module Plan

## Goal

Create a deeper Entry lifecycle module under the authoritative Entry data-access module so callers use named Entry transitions instead of writing `entry_status` values directly.

## Phase 1: Establish the Seam — Complete

- Add `apps/myk9show/src/services/database/entries/lifecycle.ts`.
- Move Secretary-facing named transitions behind the lifecycle interface:
  - accept Entry
  - reject Entry
  - scratch Entry
  - wait-list Entry
- Keep existing exports from `services/database/entries` working.
- Keep `updateEntryStatus` available for legacy callers during migration.

## Phase 2: Migrate Existing Secretary Workflow — Complete

- Move `changeSecretaryEntryStatus` into `services/database/entries/lifecycle.ts` so the Entry lifecycle module owns Secretary audit logging and Armband patch lookup.
- Keep `services/secretary/entry-workflow/status.ts` as a compatibility export for existing callers.
- Preserve current UI behavior, optimistic rollback behavior, audit metadata, and Armband patch behavior.

## Phase 3: Future Deepening

- Move scratch request approval/denial and move-up request approval/denial into lifecycle.
- Move Wait List promotion into lifecycle once the Wait List replication seam is resolved.
- Retire direct transition exports from legacy query modules after callers migrate.

## Testing

- Add focused unit tests for the lifecycle interface.
- Update Secretary workflow tests to assert lifecycle transition calls rather than raw status writes.
- Run the focused Vitest files for lifecycle and Secretary workflow.

## Phase 2 Verification

- `apps/myk9show/src/services/database/entries/lifecycle.test.ts`
- `apps/myk9show/src/services/secretary/entry-workflow/status.test.ts`
