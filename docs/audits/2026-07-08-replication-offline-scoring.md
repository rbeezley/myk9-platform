# Replication Layer Audit — Offline Scoring Durability (July 2026)

> **Status:** Active

Four parallel read-only audits of `packages/replication` and the `/at-show` scoring path, focused on the invariant **"a judge's score must never be lost, and failures must be visible."** Every finding below was verified against source with file:line evidence.

## Verdict

The core architecture is sound: writes are IndexedDB-first with a synchronous localStorage backup, dirty rows are protected from server pulls at three layers, quota eviction never touches unsynced rows, OCC conflicts preserve the local score, and the PWA update flow can't reload out from under pending work. But there are **five confirmed paths where a score can be lost or shown as saved when it wasn't**, plus a sync-status UI that shows *randomized fake data*.

## Critical findings (fix before launch)

### C1. Scoring submit swallows queue failures — green UI on a lost score
`apps/myk9show/src/hooks/useOptimisticScoring.ts:126-134` wraps the ONLY real persistence call (`replicatedEntriesTable.updateEntry`, line 108) in a try/catch that logs "Non-fatal" and continues. `updateEntry` throws on: entry missing from local cache, IDB/quota write failure, and **queue overflow** (hard cap 1000 — `MutationManager.ts:141-152`). The subsequent `serverUpdate` (lines 152-163) is a no-op that always resolves when online, so `onSuccess` fires, the scoresheet transitions to completed and navigates away. Once a stale offline device hits the 1000-mutation cap, **every subsequent score "saves" successfully and is silently discarded.** Related: `queueMutation` returns `null` when no MutationManager is wired (`ReplicatedTable.ts:176-179`, warn-only) and the return value is discarded.
**Fix:** rethrow from the catch; treat a thrown/`null` queue result as a blocking, visible error.

### C2. Circuit-breaker recovery deletes pending and failed mutations
`DatabaseManager.recover()` runs `deleteDB` after 3 consecutive IDB failures (`core/DatabaseManager.ts:460-508`; same wipe on the corrupted-DB path at 299-309) — destroying `pending_mutations` and `failed_mutations`. It neither snapshots them first nor calls `restoreMutationsFromLocalStorage()` afterward (restore only runs on startup and offline→online — `ReplicationSyncProvider.tsx:431,447`). And `failed_mutations` are **never** in the localStorage backup (`mutation-backup.ts:49-51` filters `status === 'failed'`). Transient IDB flakiness mid-show → unsynced scores deleted; dead-lettered scores gone permanently.
**Fix:** snapshot both stores to localStorage before `deleteDB`; restore after re-open; include failed mutations in the backup.

### C3. Dirty-flag clobber race in `getReplicatedRow`
`core/ReplicatedTable.ts:279-301`: access-tracking does a `get` then a `put` of the whole row in **separate auto-commit transactions**. A concurrent dirty write (score save) landing between them is overwritten by the stale clean row — dirty flag and score silently dropped; next pull replaces it with server data. The identical race was already fixed in `markAsSynced` and `reconcileDirtyRow` (single readwrite tx); this hot read path — also called at the top of every sync loop — was missed.
**Fix:** single readwrite transaction, or persist access stats without rewriting `data`/`isDirty`.

### C4. No `navigator.storage.persist()` — browser can evict everything
Zero calls anywhere. Storage is best-effort; Safari/iOS ITP purges IndexedDB **and** localStorage after 7 days of non-use for non-installed web apps, so the localStorage backup is not a safety net on judge iPads. Chrome can also evict under pressure.
**Fix:** call `navigator.storage.persist()` at startup and on entering `/at-show`; surface the `persisted()` result; prompt "Add to Home Screen" on iOS Safari when unsynced work exists (installed PWAs are exempt from the 7-day purge).

### C5. Sync-status UI shows randomized fake data
`apps/myk9show/src/hooks/useGlobalSyncStatus.ts:43-64` and `useEntitySyncStatus` (101-141) return `Math.random()`-driven statuses (5% phantom errors, fake "last sync just now") — consumed by real UI (`AccountMenuContent.tsx:44`, `SyncStatusPanel.tsx:52`). A judge checking whether scores synced sees fiction. The real state exists on `useReplicationSync()` / `mutationManager.getPendingCount()`.
**Fix:** rewrite both hooks to read real replication state, or delete the surfaces.

## High findings

### H1. Same-millisecond edits can upload out of order and keep the stale value
`sequenceNumber` is defined (`types.ts:121`) but never assigned; ordering falls back to timestamp with ties resolved by effectively-random UUID order (`mutation-ordering.ts:50`). Worse, after the first upload `updateMutationServerVersions` (`MutationManager.ts:586-592`) re-stamps the *older* mutation with the fresh OCC version, so the stale payload then uploads **validly**, overwriting the correction. Scenario: judge enters a fault, immediately corrects it — correction can be silently reverted.
**Fix:** assign a persisted monotonic `sequenceNumber` in `queueMutation` and make it the primary sort key.

### H2. Unknown errors dead-letter on the FIRST attempt
`isRetryableError` defaults to `false` (`mutation-utils.ts`); anything not matching network/timeout/5xx strings (e.g. `AbortError`, PostgREST `57014` statement timeout) skips all retries and dead-letters immediately. Combined with C2, this is the plausible real-world path to permanent score loss.
**Fix:** fail open — unknown errors get the full retry budget; only affirmatively-permanent errors (RLS, 4xx, constraint) dead-letter immediately.

### H3. No truthful "safe to close the iPad" signal in ringside
The `SyncIndicator` slot supports `pendingCount` but no caller passes it; `EntryListHeader.tsx:219-231` renders it only while actively syncing or errored — idle-with-queued-mutations shows **nothing**. Failures do surface eventually via the `replication:sync-failed` persistent toast (good: Retry/Discard, re-surfaced next sign-in), but not attributably ("which dog?") and typically after the judge navigated away.
**Fix:** plumb real `pendingCount` + last-sync time into the ringside header, rendered whenever `pendingCount > 0`; include armband/entry context in failure toasts.

## Medium findings

- **M1. Multi-tab zombie mutation.** No Web Locks / leader election; two tabs uploading can re-insert a deleted mutation via the OCC-backoff `db.put` (`MutationManager.ts:640`), creating a 40001 backoff loop, and a later re-stamp can upload its stale payload. Fix: `navigator.locks.request('replication-upload', ...)` around uploads + existence check before the backoff put.
- **M2. `queueMutation` can reject after durable queue.** `writeMutationBackup` (`mutation-backup.ts:58-66`) is un-caught inside `queueMutation` (`MutationManager.ts:177`); localStorage-full makes a successfully-queued score look failed → judge re-enters. Fix: try/catch the backup, log only. Also wrap the `pending_mutations` put in `withQuotaEviction`.
- **M3. Score detail dropped at the write boundary.** `useOptimisticScoring.ts:108-120` persists only 5 columns; per-area times, correct/incorrect counts, points, NQ reason stay in local Zustand only, despite the RPC whitelisting `area1_time_seconds`, `points_earned`, etc. Lost on device loss; invisible to secretary/reports. Fix: persist full `ScoreData` through the already-whitelisted columns.
- **M4. `replication:queue-overflow` has no listener.** Dispatched (`MutationManager.ts:144,493`), consumed nowhere. Add UI.
- **M5. Online detection is `navigator.onLine` only** (`networkUtils.ts:294-311`); captive portals read as online. Uploads are timeout-protected, but the **download** path (`syncReplicatedTable.ts` `fetchRemoteRows`) has no timeout and a hung fetch blocks all subsequent syncs via `syncInFlightRef`. Fix: `withTimeout` on fetch; cheap reachability probe before declaring "back online".
- **M6. Crash window between local `set(dirty)` and `queueMutation`** (`ReplicatedEntriesTable.ts:288-289`): stranded dirty row shows as saved, never uploads, no repair. Fix: startup scan for dirty rows lacking a pending mutation (or single-tx write).
- **M7. Sync-engine footguns:** `shouldCleanupStaleRows` without `forceFullSync` would delete nearly the whole local table on an incremental sync (add an engine guard); client-clock watermark fallback when an adapter omits `getRemoteUpdatedAt` (all current core tables provide it — make the hook required); watermark-past-unfetched-rows depends on an unenforced "order by updated_at asc" adapter contract.

## Low findings

- L1. Double-submit guard is `useState`-based, not the repo's useRef convention (`useScoresheetScoring.ts:179-192`) — benign (idempotent UPDATEs) but inconsistent.
- L2. Quota/LRU eviction of clean rows leaves local gaps until the 24h full sync — never loses scores, but run orders can silently omit rows; consider zeroing `lastFullSyncAt` after any eviction.
- L3. Dead code: TTL expiry machinery gated on never-set `lastSuccessfulSyncAt` (`ReplicatedTableCache.ts:27-73`); legacy `ConflictResolver`/`ConflictManager` (clock-trusting LWW, in-memory-only) unused by the live path — delete or mark deprecated.
- L4. `conflictCount` metadata increments instead of sets (`syncReplicatedTable.ts:348` vs `Cache.ts:443-445`) — misleading diagnostics only.

## Verified-safe (no action)

- Server pulls cannot overwrite a dirty (unsynced) score — guarded in `set()`, batch paths, and the sync loop's dirty branch; 3-way reconcile touches only clean fields.
- OCC conflicts never dead-letter; local score held dirty with backoff + persistent conflict toast.
- Quota eviction skips dirty rows and fails loudly when nothing is evictable.
- Ringside RLS gap is FIXED — `ringside_update_entry` RPC (migrations 20260621171500 / 20260625190000) authorizes judges/stewards/passcode sessions; all five scored columns route via the RPC.
- Placement recalc is server-authoritative and correct with late-syncing scores.
- PWA `prompt` update mode defers while offline; DB upgrades are additive.

## Suggested remediation order

1. **Phase 1 (score-loss closures):** C1+`null`-check, C3, C2, H2 — small, surgical, each with an assertion-first unit test.
2. **Phase 2 (durability hardening):** C4, H1, M1, M2, M6.
3. **Phase 3 (transparency):** C5, H3, M3, M4.
4. **Phase 4 (engine hygiene):** M5, M7, L2-L4.

Each phase must land with unit tests (vitest, assertion-first for the value-sensitive fixes per project convention).
