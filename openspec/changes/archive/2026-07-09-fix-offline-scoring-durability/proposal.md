## Why

The July 2026 replication audit ([docs/audits/2026-07-08-replication-offline-scoring.md](../../../docs/audits/2026-07-08-replication-offline-scoring.md)) confirmed five paths where a judge's offline score can be silently lost or shown as saved when it was never persisted, plus a sync-status UI that renders randomized fake data. Show-day scoring is the one flow where data loss is unrecoverable — a judge cannot re-derive a run they already released — so these defects are launch-blocking for fall 2026. Fixing them now, before real shows run, is far cheaper than reconciling lost scores after the fact.

## What Changes

Three test-gated phases, ordered by severity. The unifying invariant: **a queued score is never silently dropped, and any failure to persist or sync is visible to the judge.**

**Phase 1 — Score-loss closures**
- Stop swallowing queue failures in `useOptimisticScoring`: a throw or `null` mutation id from `updateEntry` must block the optimistic-success transition and surface a blocking error instead of navigating away with a green checkmark.
- Make circuit-breaker recovery mutation-safe: snapshot `pending_mutations` and `failed_mutations` before `deleteDB`, and restore them after re-open so IDB flakiness can't wipe unsynced or dead-lettered scores.
- Fix the read-modify-write race in `getReplicatedRow` (single readwrite transaction, or write access stats without rewriting `data`/`isDirty`) so a concurrent score save can't be clobbered by stale access-tracking.
- Make retry classification fail-open: unknown/unclassified errors get the full retry budget; only affirmatively-permanent errors (RLS, 4xx, constraint) dead-letter immediately.

**Phase 2 — Durability hardening**
- Request `navigator.storage.persist()` at startup and on entering `/at-show`; nudge iOS Safari users to Add-to-Home-Screen when unsynced work exists (installed PWAs are exempt from the 7-day storage purge).
- Assign a persisted monotonic `sequenceNumber` in `queueMutation` and use it as the primary ordering key so same-millisecond edits can't upload out of order (which currently lets a stale re-stamped payload overwrite a correction).
- Add a cross-tab upload lock (`navigator.locks`) and guard the OCC-backoff re-insert so a second tab can't resurrect a deleted mutation.
- Wrap the localStorage backup write in try/catch and the `pending_mutations` put in quota-eviction so a full localStorage/quota can't fail a durably-queued score.
- Startup scan for dirty rows lacking a pending mutation (repair the crash window between `set(dirty)` and `queueMutation`).

**Phase 3 — Transparency**
- Replace the mock `useGlobalSyncStatus` / `useEntitySyncStatus` with real state from `useReplicationSync()` / `mutationManager.getPendingCount()`.
- Wire real `pendingCount` + last-sync time into the ringside `SyncIndicator`, rendered whenever `pendingCount > 0` (not only while actively syncing) — the truthful "safe to close the iPad" signal.
- Add a listener + UI for `replication:queue-overflow`.
- Persist the full `ScoreData` (per-area times, counts, points, NQ reason) through the already-whitelisted RPC columns instead of dropping it into local Zustand only.

## Capabilities

### New Capabilities
- `offline-scoring-durability`: The guarantees a judge's score must satisfy from entry to server sync — durable persistence before success is shown, no silent drop through retry/eviction/recovery, correct ordering of rapid edits, and visible, attributable sync status (pending count, failures, "safe to close" signal).

### Modified Capabilities
<!-- None. account-entry-sync and offline-show-desk-late-entry cover adjacent flows but not the scoring durability/visibility contract; no existing spec-level requirement changes. -->

## Impact

- **Code — replication package:** `packages/replication/src/core/{DatabaseManager,ReplicatedTable,ReplicatedTableCache}.ts`, `MutationManager.ts`, `mutation-retry.ts`, `mutation-utils.ts`, `mutation-backup.ts`, `mutation-ordering.ts`, `quota-eviction.ts`, `types.ts`, `syncReplicatedTable.ts`.
- **Code — app:** `apps/myk9show/src/hooks/{useOptimisticScoring,useGlobalSyncStatus}.ts`, `providers/ReplicationSyncProvider.tsx`, `services/replication/ReplicatedEntriesTable.ts`, `lib/networkUtils.ts`, `features/at-show/**` (score submit + sync indicator slot), `packages/ringside/src/pages/EntryList/components/EntryListHeader.tsx`.
- **Data / API:** no schema migration required — Phase 3 uses columns already whitelisted in `ringside_update_entry` (`area1_time_seconds`, `points_earned`, etc.). No RLS change (the ringside write-authz gap is already fixed).
- **Storage behavior:** requesting persistent storage changes browser eviction posture; must degrade gracefully when denied.
- **Non-goals (avoid added surface area):** no new pages, sheets, or routes — Phase 3 reuses the existing `SyncIndicator` slot and account-menu/sync-panel surfaces; no server-side dead-letter service; no rework of the OCC conflict-surfacing kill switch beyond what ordering correctness requires; the dead TTL/legacy `ConflictResolver` cleanup (audit L3) is deferred as non-blocking.
