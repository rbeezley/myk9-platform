## Why

On a cold offline boot, the authenticated exhibitor's network-only person lookup pauses and disables every account-level entry query, making durable replica data unreachable. Persisting the user/person pairing preserves the exhibitor's show-day access and directly supports fall 2026 offline reliability.

## What Changes

- Persist the authenticated user's person ID beside the durable auth/session identity, following the existing durable-role seam.
- Restore that pairing before online profile lookup settles and distinguish unresolved identity from a confirmed missing person.
- Let all account-level entry hooks execute against the replica when durable identity is available offline.
- Add cold-offline tests covering persisted identity, query enablement, and the unresolved state.
- Non-goal: add a new identity screen, bypass the existing online refresh, or display stale money values covered by MYK9-563.

This does not duplicate an existing surface; it repairs the shared identity prerequisite used by existing exhibitor surfaces. A link would not restore offline data access.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `account-entry-sync`: account entry reads can start from a durable user/person pairing during a cold offline boot and must not report unresolved identity as an empty account.

## Impact

Auth context/session persistence, entry identity state, four account-level entry hooks, and focused unit/integration tests. No schema migration or new UI surface is expected.
