# Code Quality Wave D: Secretary Status Replication

## Goal

Reroute the secretary Entry Management lifecycle status writes away from direct Supabase updates and onto the existing offline-first replicated entries table.

This is the first Wave D slice from `docs/audits/2026-06-code-quality/09-phase-2-verification.md`. It targets the confirmed secretary status write bypasses in `apps/myk9show/src/services/database/entries/secretary.ts`.

## Scope

- Replace `updateEntryStatus` with a replicated-table update.
- Replace `bulkUpdateEntryStatus` with per-entry replicated updates.
- Preserve existing side effects:
  - `entry_status`/`entryStatus` are both updated.
  - `status` remains in sync for legacy replicated consumers.
  - scratched entries set `check_in_status`/`checkInStatus` to `pulled`.
  - withdrawal reasons continue to persist.
  - existing audit logging remains in `changeSecretaryEntryStatus`.
  - accepted-entry armband patch behavior remains in the workflow wrapper.

## Out Of Scope

- `getEntriesForShow` replicated read adapter.
- armband read/write reroutes.
- day-of scratch and move-up list reads.
- secretary check-in report reads.
- exhibitor show-day read adapter.

Those remain Wave D follow-up slices.

## Testing

1. Add assertion-first tests proving `updateEntryStatus` and `bulkUpdateEntryStatus` call `replicatedEntriesTable.updateEntry` with the expected payload.
2. Prove scratched status carries `pulled` check-in status and withdrawal reason.
3. Prove direct Supabase `entries.update()` is not called for these status paths.
4. Run the focused Vitest file.
5. Run typecheck if the focused tests pass.

## Implementation Steps

1. Mock `replicatedEntriesTable` and `supabase` in a secretary service test.
2. Run the test red against the current direct Supabase implementation.
3. Import `replicatedEntriesTable` in `secretary.ts`.
4. Convert the shared status update helper into a replicated-entry payload helper.
5. Return a compatible `{ data, error }` envelope from single and bulk status updates.
6. Update Wave D tracking docs and `OPEN-TODOS.md` for this completed slice.
