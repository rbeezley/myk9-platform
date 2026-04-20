# Phase 5: Per-App Wrapper Audit

**Audited:** 16 wrappers in apps/myk9q/src/services/replication/tables/ (3,923 lines total)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Classification

### Bucket A (scoring-critical — full audit)

- ReplicatedEntriesTable.ts (337 lines)
- ReplicatedClassesTable.ts (308 lines)
- ReplicatedShowsTable.ts (321 lines)
- ReplicatedTrialsTable.ts (264 lines)

### Bucket B (config/visibility — spot-check)

- ReplicatedClassVisibilityOverridesTable.ts (228 lines)
- ReplicatedShowVisibilityDefaultsTable.ts (182 lines)
- ReplicatedTrialVisibilityOverridesTable.ts (222 lines)
- ReplicatedClassRequirementsTable.ts (279 lines)

### Bucket C (views/notifications — read-only verification)

- ReplicatedAnnouncementReadsTable.ts (168 lines)
- ReplicatedAnnouncementsTable.ts (181 lines)
- ReplicatedAuditLogViewTable.ts (274 lines)
- ReplicatedNationalsRankingsTable.ts (235 lines)
- ReplicatedPushNotificationConfigTable.ts (173 lines)
- ReplicatedPushSubscriptionsTable.ts (217 lines)
- ReplicatedStatsViewTable.ts (271 lines)
- ReplicatedEventStatisticsTable.ts (263 lines)

## Bucket A findings

Seven-question rubric applied to each file:

1. Does any business method call `supabase.from(...)` directly for writes?
2. Does any method read from cache and write to Supabase without enqueueing?
3. Do partial-column update helpers risk missing required fields?
4. Any property-name drift vs DB schema?
5. Are optimistic updates rolled back on sync failure?
6. Is `license_key` isolation maintained in sync and query paths?
7. Does the sync loop use batch operations or per-row transactions?

---

### ReplicatedEntriesTable.ts

**Q1 — Direct Supabase write bypass:** None. `supabase.from()` is only used inside `sync()` for reads (download path). All writes go through `this.set()` / `this.batchSet()`. PASS.

**Q2 — Cache-read + Supabase-write without queue:** None. PASS.

**Q3 — Partial column update helpers:** `updateEntryStatus` (line 278) reads the full entry then spreads it before patching `entry_status` — no missing columns. `markAsScored` (line 303) does the same. PASS.

**Q4 — Property-name drift:** The sync fetches from `view_myk9q_entries` whose columns are flattened and match the `Entry` interface (including `is_in_ring`, `result_status`, etc.). No drift detected. PASS.

**Q5 — Optimistic update rollback:** `updateEntryStatus` and `markAsScored` both call `this.set(..., true)` (dirty flag) for optimistic local writes. There is no rollback path if the mutation later fails to sync. This is consistent with the project's accepted pattern (dirty rows are retried indefinitely). LOW — no fix needed, consistent with architecture.

**Q6 — licenseKey isolation:** `getAll(licenseKey)` is passed in `sync()` (line 87) ensuring the "is cache empty?" check is scoped to the current show. PASS.

**Q7 — Batch operations in sync:** Sync collects all remote entries into `entriesToCache[]` then calls a single `batchSet()` (line 165). PASS.

**Finding count: 0 high, 0 medium, 1 low (no-rollback, accepted pattern)**

---

### ReplicatedClassesTable.ts

**Q1 — Direct Supabase write bypass:** None. PASS.

**Q2 — Cache-read + Supabase-write without queue:** None. PASS.

**Q3 — Partial column update helpers:** `updateClassStatus` (line 282) spreads the full `currentClass` before patching `status` and `additionalFields`. PASS.

**Q4 — Property-name drift:** The sync query joins `classes → trials → shows` and strips the nested `trials` object before caching. The `Class` interface matches the `classes` table columns. PASS.

**Q5 — Optimistic update rollback:** Same no-rollback pattern as Entries. LOW — accepted.

**Q6 — licenseKey isolation:** `getAll(licenseKey)` passed in sync (line 72). Query-only helpers (`getByElement`, `getByLevel`, `getSelfCheckinEnabled`) call `getAll()` without a licenseKey — these are internal helpers that read all cached classes, which is appropriate since they are not sync paths. PASS.

**Q7 — Batch operations in sync:** Collects into `classesToCache[]` then calls `batchSet()` (line 165). PASS.

**Finding count: 0 high, 0 medium, 1 low (no-rollback, accepted pattern)**

---

### ReplicatedShowsTable.ts

**Q1 — Direct Supabase write bypass:** None. PASS.

**Q2 — Cache-read + Supabase-write without queue:** None. PASS.

**Q3 — Partial column update helpers:** `updateShowStatus` (line 295) spreads the full `currentShow` before patching. PASS.

**Q4 — Property-name drift:** The sync joins `shows, clubs(name)` and flattens `clubs` into `club_name` (line 109). The `Show` interface includes `club_name`. PASS.

**Q5 — Optimistic update rollback:** Same no-rollback pattern. LOW — accepted.

**Q6 — licenseKey isolation in "is cache empty?" check:** `sync()` calls `this.getAll()` at line 83 **without passing `licenseKey`**. This means if the IndexedDB store contains shows from a previously-connected show, the check `isCacheEmpty = false` evaluates to false, and the sync uses `lastIncrementalSyncAt` rather than forcing a full-sync. The new show's data may be missed on first load. MEDIUM — `ReplicatedClassesTable` and `ReplicatedTrialsTable` correctly pass `licenseKey` to `getAll()`; Shows does not.

**Q7 — Batch operations in sync:** The sync loop (lines 134–149) iterates remote shows and calls `this.set(showId, ...)` **per row** — no batching. This is unlike the fixed Entries and Classes wrappers which use `batchSet()`. For a typical show with only a handful of shows, the impact is low, but the pattern is inconsistent. MEDIUM.

**Finding count: 0 high, 2 medium, 1 low**

- **MEDIUM-1** `ReplicatedShowsTable.ts:83` — `getAll()` without licenseKey breaks "is cache empty?" isolation. Fix: pass `licenseKey`.
- **MEDIUM-2** `ReplicatedShowsTable.ts:134-149` — per-row `this.set()` in sync loop; should use `batchSet()`.

---

### ReplicatedTrialsTable.ts

**Q1 — Direct Supabase write bypass:** None. PASS.

**Q2 — Cache-read + Supabase-write without queue:** None. PASS.

**Q3 — Partial column update helpers:** `updateTrialStatus` (line 238) spreads the full `currentTrial` before patching. PASS.

**Q4 — Property-name drift:** The sync query joins `trials → shows` and strips the nested `shows` object. The `Trial` interface matches the `trials` table columns. PASS.

**Q5 — Optimistic update rollback:** Same no-rollback pattern. LOW — accepted.

**Q6 — licenseKey isolation:** `getAll(licenseKey)` is passed in sync (line 58). PASS. Query helpers (`getByShowId`, `getByDateRange`, `getByStatus`) call `getAll()` without licenseKey — internal helpers, acceptable.

**Q7 — Batch operations in sync:** The sync loop (lines 117–133) calls `this.set(trialId, ...)` **per row** — no batching. Same issue as Shows. MEDIUM.

**Finding count: 0 high, 1 medium, 1 low**

- **MEDIUM-1** `ReplicatedTrialsTable.ts:117-133` — per-row `this.set()` in sync loop; should use `batchSet()`.

---

### Bucket A Summary

| File                      | HIGH  | MEDIUM | LOW   |
| ------------------------- | ----- | ------ | ----- |
| ReplicatedEntriesTable.ts | 0     | 0      | 1     |
| ReplicatedClassesTable.ts | 0     | 0      | 1     |
| ReplicatedShowsTable.ts   | 0     | 2      | 1     |
| ReplicatedTrialsTable.ts  | 0     | 1      | 1     |
| **Total**                 | **0** | **3**  | **4** |

## Bucket B + C findings

### Bucket B — Config / Visibility (spot-check)

**ReplicatedClassVisibilityOverridesTable.ts**
No direct Supabase writes from app code. The `sync()` method uses per-row `this.set()` (same un-batched pattern as Shows/Trials). The `getByClassId()` helper calls `getAll()` without a licenseKey, but the object stores licenseKey on each row so callers can further filter — acceptable for a query helper. The "is cache empty?" guard is absent here (no `isCacheEmpty` check at all — always uses `lastSync`), which means a cleared cache produces an incremental sync from `lastIncrementalSyncAt` rather than forcing a full-sync. LOW — mild risk only on first-load after cache clear. Otherwise clean.

**ReplicatedShowVisibilityDefaultsTable.ts**
No direct Supabase writes from app code. The `show_visibility_settings` table has a native `license_key` column, so the sync filters correctly with `.eq('license_key', licenseKey)`. No `isCacheEmpty` check. Per-row `this.set()` sync loop (same pattern as above). No issues beyond the low-severity no-`isCacheEmpty`-guard.

**ReplicatedTrialVisibilityOverridesTable.ts**
Identical structure to ClassVisibilityOverrides — joins `trial_visibility_overrides → trials → shows` to get `license_key`. No direct writes. Per-row sync loop (same unbatched pattern). No `isCacheEmpty` guard. LOW — same mild risk.

**ReplicatedClassRequirementsTable.ts**
`sport_class_rules` is organization-level config (AKC, UKC, ASCA) — **intentionally has no `license_key`** column. The `sync(_licenseKey)` parameter is unused by design, and all rules are fetched globally. This is correctly documented in the file. No direct Supabase writes. Per-row `this.set()` loop (same unbatched pattern). No issues.

### Bucket B Summary

| File                                       | Issues                                        |
| ------------------------------------------ | --------------------------------------------- |
| ReplicatedClassVisibilityOverridesTable.ts | LOW: no isCacheEmpty guard; per-row sync loop |
| ReplicatedShowVisibilityDefaultsTable.ts   | LOW: no isCacheEmpty guard; per-row sync loop |
| ReplicatedTrialVisibilityOverridesTable.ts | LOW: no isCacheEmpty guard; per-row sync loop |
| ReplicatedClassRequirementsTable.ts        | None — intentionally global, no licenseKey    |

---

### Bucket C — Views + Notifications (read-only verification)

**ReplicatedAnnouncementReadsTable.ts**
No app-code writes to Supabase. `handleRealtimeEvent()` and `sync()` write only to the local IDB cache via `this.set()` / `this.batchSet()`. **Verified read-only** (from Supabase perspective).

**ReplicatedAnnouncementsTable.ts**
No app-code writes to Supabase. Announcements are created server-side by admins. `handleRealtimeEvent()` caches incoming changes into IDB only. **Verified read-only**.

**ReplicatedAuditLogViewTable.ts**
Wraps the `view_audit_log` PostgreSQL view. `sync()` clears and repopulates IDB via `clearTable()` + `batchSet()` — both are IDB-only operations. `handleRealtimeEvent()` writes only to `syncMetadata` (IDB). No Supabase writes. **Verified read-only**.

**ReplicatedNationalsRankingsTable.ts**
Marked DORMANT in the file. `sync()` is a stub that returns immediately with zero rows. `handleRealtimeEvent()` writes to IDB cache only. `fetchFromSupabase()` is defined but only called by tests or when activated. **Verified read-only** (and effectively inert while dormant).

**ReplicatedPushNotificationConfigTable.ts**
Stores push config (API keys, secrets) as a singleton row. `sync()` reads from Supabase and stores in IDB only. `handleRealtimeEvent()` writes to IDB cache only. No Supabase writes from app code. **Verified read-only**.

**ReplicatedPushSubscriptionsTable.ts**
Subscriptions are created when users subscribe via the browser Push API (separate flow, not in this file). This wrapper only reads subscriptions and caches them locally. `handleRealtimeEvent()` writes to IDB only. **Verified read-only**.

**ReplicatedStatsViewTable.ts**
Wraps `view_stats_summary` PostgreSQL view. `sync()` clears and repopulates IDB via private `clearTable()` + `batchSet()`. `handleRealtimeEvent()` writes to `syncMetadata` only. No Supabase writes. **Verified read-only**.

**ReplicatedEventStatisticsTable.ts**
Statistics are computed server-side by triggers. `sync()` clears and repopulates IDB via private `clearTable()` + `batchSet()`. `handleRealtimeEvent()` writes to IDB cache only. No Supabase writes. **Verified read-only**.

### Bucket C Summary

All 8 Bucket C wrappers verified read-only — no `insert`/`update`/`delete` calls to Supabase from app code in any of them.

## Remediation plan

### MEDIUM findings from Bucket A

- **M-1** `ReplicatedShowsTable.ts:83` — Pass `licenseKey` to `getAll()` in `isCacheEmpty` check (prevents multi-show cache contamination)
- **M-2** `ReplicatedShowsTable.ts:134-149` — Replace per-row `this.set()` sync loop with `batchSet()` (consistency + fewer IDB transactions)
- **M-3** `ReplicatedTrialsTable.ts:117-133` — Replace per-row `this.set()` sync loop with `batchSet()` (consistency + fewer IDB transactions)
