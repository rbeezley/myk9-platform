# Entry Lifecycle Module Plan

## Goal

Create a deeper Entry lifecycle module under the authoritative Entry data-access module so callers use named Entry transitions instead of writing `entry_status` values directly.

## Phase 1: Establish the Seam

- Add `apps/myk9show/src/services/database/entries/lifecycle.ts`.
- Move Secretary-facing named transitions behind the lifecycle interface:
  - accept Entry
  - reject Entry
  - scratch Entry
  - wait-list Entry
- Keep existing exports from `services/database/entries` working.
- Keep `updateEntryStatus` available for legacy callers during migration.

## Phase 2: Migrate Existing Secretary Workflow

- Update `services/secretary/entry-workflow/status.ts` to depend on lifecycle transitions.
- Preserve current audit and Armband patch behavior.
- Avoid changing UI behavior or query invalidation behavior in this slice.

## Phase 3: Future Deepening

- Move scratch request approval/denial and move-up request approval/denial into lifecycle.
- Move Wait List promotion into lifecycle once the Wait List replication seam is resolved.
- Retire direct transition exports from legacy query modules after callers migrate.

## Testing

- Add focused unit tests for the lifecycle interface.
- Update Secretary workflow tests to assert lifecycle transition calls rather than raw status writes.
- Run the focused Vitest files for lifecycle and Secretary workflow.
