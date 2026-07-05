## Why

The exhibitor My Shows page can show a false empty state when the local entries replica has not been hydrated, even while Supabase contains active entries for the signed-in exhibitor. This undermines fall 2026 launch readiness because exhibitors need account data to respect their time and sync behavior must be trustworthy across devices.

## What Changes

- Treat an empty account-level local entries replica as possibly unhydrated when online, and verify against the authenticated Supabase entry-results view.
- Preserve offline-first behavior by keeping the local empty result if the online view is unreachable.
- Clarify myK9Show replication orchestration terminology by using sync scope language instead of legacy license-key wording where the global provider/table sync code is touched.
- Add focused regression coverage for the false-empty entries case.
- Non-goal: add new pages, dialogs, or user-facing affordances. This tightens an existing page rather than duplicating any existing surface.
- Non-goal: redesign all ringside passcode context naming in this change; that can be handled separately if it affects shared contracts.

## Capabilities

### New Capabilities

- `account-entry-sync`: Account-level exhibitor entry reads reconcile empty local replicas with authoritative online data while preserving offline fallback.

### Modified Capabilities

- None.

## Impact

- `apps/myk9show/src/services/database/entries/search.ts`
- `apps/myk9show/src/services/database/entries/search.test.ts`
- `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`
- Focused replication/table naming cleanup in touched myK9Show sync code
- No database migration or external API change
