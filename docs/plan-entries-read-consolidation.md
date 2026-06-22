# Plan: Entry-Read Module Consolidation

> **Status:** Active

Findings document produced by executing Plan 004 (`docs/improve-audit-2026-06/004-entries-read-module-consolidation-spike.md`).
This is an investigation/design artefact — no production code was changed.

---

## Drift check

`git diff --stat deb820e35..HEAD -- apps/myk9show/src/services/database/entries`

One file changed since the plan was written:

```
 apps/myk9show/src/services/database/entries/search.ts | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-) (PR #928, run-order preset apply)
```

The change is in `search.ts`, which is **not** one of the 7 modules under investigation. All findings below reflect HEAD.

---

## Step 1 — Export inventory

All 7 modules are listed below. `secretaryReadReplication.ts` and `secretaryPostgrest.ts` are **not re-exported** from the barrel (`index.ts`) — they are internal-only helpers consumed exclusively inside `secretary.ts`. This is noted in the seam-violation section.

### `reads.ts` (24,161 b)

| Export | Kind |
|--------|------|
| `getAllEntries` | read function |
| `getEntryById` | read function |
| `getEntriesByShow` | read function |
| `getEntriesByShowForFinancials` | read function |
| `getEntriesByTrial` | read function |
| `getEntriesByClass` | read function |
| `getEntriesByClassId` | read function (compat alias → `getEntriesByClass`) |
| `getEntriesByDog` | read function |
| `countActiveEntriesByDog` | read function |
| `getEntriesByStatus` | read function |

### `secretary.ts` (15,700 b)

| Export | Kind |
|--------|------|
| `PendingEntry` (type re-export) | type |
| `SecretaryEntry` (type re-export) | type |
| `SecretaryStatusEntrySeed` (type re-export) | type |
| `getPendingEntries` | read function |
| `getEntriesForShow` | read function |
| `getEntryCountsByStatus` | read function |
| `updateEntryStatus` | write function |
| `bulkUpdateEntryStatus` | write function |
| `updateCheckInStatus` | write function |
| `bulkCheckIn` | write function |
| `checkArmbandConflicts` | read function |
| `getEntriesForExport` | read function (RPC) |
| `updateRunOrder` | write function |

### `secretaryReadReplication.ts` (9,607 b) — internal helper, not in barrel

| Export | Kind |
|--------|------|
| `getReplicatedSecretaryEntriesForShow` | read function (internal) |

### `secretaryPostgrest.ts` (1,907 b) — internal helper, not in barrel

| Export | Kind |
|--------|------|
| `postgrestGetSecretaryEntriesForShow` | read function (internal) |

### `publicReads.ts` (3,620 b)

| Export | Kind |
|--------|------|
| `PublicEntryRow` (interface) | type |
| `getPublicEntriesByClass` | read function |
| `getPublicEntriesByShow` | read function |
| `getPublicEntriesByTrial` | read function |

### `userEntriesReplication.ts` (4,585 b) — not in barrel

| Export | Kind |
|--------|------|
| `findMissingReplicatedUserEntryRelations` | utility function |
| `buildReplicatedUserEntryRows` | utility function |

### `index.ts` (1,240 b) — public barrel

Re-exports from: `reads`, `publicReads`, `lifecycle`, `moveUpNote`, `search`, `secretary`, `admin`, `invalidation`, `management-actions`. Notable exclusions:
- `updateEntryStatus` from `writes.ts` is aliased to `updateEntryStatusWithAudit` to avoid colliding with `secretary.ts`'s `updateEntryStatus`.
- `secretaryReadReplication`, `secretaryPostgrest`, and `userEntriesReplication` are **not re-exported** — they are internal-only modules used as helpers within sibling files.

---

## Step 2 — Per-read classification

Tags: `replication` = offline-safe (backed by replication layer), `postgrest-public` = direct PostgREST for anon/cold public routes (acceptable), `postgrest-core` = direct PostgREST on a core authed flow (anti-pattern if offline-relevant).

### `reads.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `getAllEntries` | `replication` | `readWithReplicationFallback(...)` (line 479); tries `replicatedEntriesTable.getAll()` first |
| `getEntryById` | `replication` | `readWithReplicationFallback(...)` (line 503); tries `replicatedEntriesTable.getEntryById(id)` first |
| `getEntriesByShow` | `replication` | `readWithReplicationFallback(...)` (line 524); tries `replicatedEntriesTable.getEntriesByShow(showId)` first |
| `getEntriesByShowForFinancials` | `replication` | `readWithReplicationFallback(...)` (line 552); replication branch fetches trials, promo codes via PostgREST side-call (non-replicated entity) — core data path is replication-backed |
| `getEntriesByTrial` | `replication` | `readWithReplicationFallback(...)` (line 613); replication branch resolves via `replicatedClassesTable.getClassesByTrial` + `replicatedEntriesTable.getAll()` |
| `getEntriesByClass` | `replication` | `readWithReplicationFallback(...)` (line 645); tries `replicatedEntriesTable.getEntriesByClass(classId)` first |
| `getEntriesByClassId` | `replication` | Compat wrapper — delegates to `getEntriesByClass` (line 688), inherits tag |
| `getEntriesByDog` | `replication` | `readWithReplicationFallback(...)` (line 699); tries `replicatedEntriesTable.getAll()` filtered by dogId first |
| `countActiveEntriesByDog` | `postgrest-core` (intentional) | Direct `supabase.from('entries').select('id', {count:'exact',...})` (line 732); code comment (lines 724–731) documents the deliberate choice: entries replicate per-show, so a cold store would return 0 (false count). Drives the delete-dog confirmation warning which must be accurate regardless of sync state. |
| `getEntriesByStatus` | `replication` | `readWithReplicationFallback(...)` (line 743) |

### `secretary.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `getPendingEntries` | `postgrest-core` | Direct `supabase.from('entries')` (line 46); no replication path, no fallback wrapper. Reads `entry_status = 'submitted'` across all shows (cross-show scope). Cross-show offline reading is a known replication scope constraint (sync is per-show). |
| `getEntriesForShow` | `replication` (branching) | Calls `getReplicatedSecretaryEntriesForShow(showId)` first (line 74). If `isColdStore` (zero rows → never synced in /at-show context), falls through to `postgrestGetSecretaryEntriesForShow` (line 96). Branch behavior: warm-store → replication, cold-store → PostgREST. |
| `getEntryCountsByStatus` | `postgrest-core` | Direct `supabase.from('entries')` (line 117); no replication path. Count/summary query for the secretary dashboard. |
| `checkArmbandConflicts` | `postgrest-core` | Direct `supabase.from('entries')` (line 333); no replication path. Pre-show setup operation, not realtime show-day. |
| `getEntriesForExport` | `postgrest-core` (RPC) | `supabase.rpc('get_entries_for_export', ...)` (line 391); SECURITY DEFINER RPC. Export is intentionally a live-data, secretary-gated operation — not a candidate for replication. |

### `secretaryReadReplication.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `getReplicatedSecretaryEntriesForShow` | `replication` | Direct replication reads: `replicatedEntriesTable.getEntriesByShow(showId)` (line 246), `replicatedDogsTable.getAllDogs()` (line 252), `replicatedClassesTable.getAll()` (line 253), `replicatedArmbandsTable.getByShow(showId)` (line 254). Side-calls to PostgREST for `people` (line 105) and `enrollments` (line 126) — not replicated entities; best-effort enrichment, not the core entry data path. |

### `secretaryPostgrest.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `postgrestGetSecretaryEntriesForShow` | `postgrest-core` | Direct `supabase.from('entries')` (line 70); the cold-store fallback for `getEntriesForShow`. Appropriate as a fallback when the replication store has never been seeded for this show (before an /at-show session starts). The offline risk is mitigated only by `getEntriesForShow`'s cold-store guard. |

### `publicReads.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `getPublicEntriesByClass` | `postgrest-public` | Reads from `view_public_entry_results` (line 59); anon-accessible DB view with scored columns NULLed by DB-level cascade. Only for public/anon routes. |
| `getPublicEntriesByShow` | `postgrest-public` | Same view (line 69). |
| `getPublicEntriesByTrial` | `postgrest-public` | Same view (line 80). |

### `userEntriesReplication.ts`

| Function | Tag | Evidence |
|----------|-----|----------|
| `findMissingReplicatedUserEntryRelations` | n/a (utility) | Pure function — detects missing relations in provided maps (line 23). No DB calls. |
| `buildReplicatedUserEntryRows` | `replication` | Takes already-fetched `ReplicatedEntry[]`; only PostgREST call is for `enrollments` (line 61), which is not replicated — best-effort enrichment. Calls `withholdScoredResultColumns` for result-visibility safety (line 109). |

---

## Step 3 — Caller map

### `reads.ts` exports

| Function | Production callers |
|----------|-------------------|
| `getAllEntries` | `hooks/queries/useEntriesDatabase.ts:33`, `hooks/queries/useClassesDatabase.ts:149` |
| `getEntryById` | `hooks/queries/useEntriesDatabase.ts:46` |
| `getEntriesByShow` | `hooks/queries/useEntriesDatabase.ts:71`, `components/shows/ShowDetails/EntriesTab.tsx:101`, `hooks/queries/useReportData.ts:56` |
| `getEntriesByShowForFinancials` | `components/secretary/ShowFinancialSummary.tsx:68` |
| `getEntriesByTrial` | `hooks/queries/useTrialEntries.ts:101` |
| `getEntriesByClass` | `hooks/queries/useEntriesDatabase.ts:96`, `hooks/queries/useClassEntriesRaw.ts:111`, `features/pipeline/print/usePipelinePrint.ts:108`, `hooks/queries/useReportData.ts:52` |
| `getEntriesByClassId` | `hooks/queries/useClassesDatabase.ts:165` |
| `getEntriesByDog` | `hooks/queries/useEntriesDatabase.ts:110` |
| `countActiveEntriesByDog` | **Zero production callers found** — test-only (see STOP condition below) |
| `getEntriesByStatus` | `hooks/queries/useEntriesDatabase.ts:136` |

### `secretary.ts` read exports

| Function | Production callers |
|----------|-------------------|
| `getPendingEntries` | `hooks/queries/usePendingEntries.ts:10` |
| `getEntriesForShow` | `hooks/useEntryManagementData.ts:140` |
| `getEntryCountsByStatus` | **Zero production callers** — one seam-violating test import only (see Flag a below) |
| `checkArmbandConflicts` | **Zero production callers** — test-only |
| `getEntriesForExport` | `hooks/useEntryManagementActions.ts:434` |

### `publicReads.ts` exports

| Function | Production callers |
|----------|-------------------|
| `getPublicEntriesByClass` | `hooks/queries/useClassEntriesRaw.ts:108`, `hooks/queries/useEntriesDatabase.ts:93` |
| `getPublicEntriesByShow` | `components/shows/ShowDetails/EntriesTab.tsx:98`, `hooks/queries/useEntriesDatabase.ts:68` |
| `getPublicEntriesByTrial` | `hooks/queries/useTrialEntries.ts:98` |

### `userEntriesReplication.ts` exports

| Function | Production callers |
|----------|-------------------|
| `findMissingReplicatedUserEntryRelations` | `services/database/entries/search.ts:349` (internal sibling) |
| `buildReplicatedUserEntryRows` | `services/database/entries/search.ts:377,388` (internal sibling) |

### `secretaryReadReplication.ts` and `secretaryPostgrest.ts` exports

| Function | Production callers |
|----------|-------------------|
| `getReplicatedSecretaryEntriesForShow` | `secretary.ts:74` (internal sibling) |
| `postgrestGetSecretaryEntriesForShow` | `secretary.ts:96` (internal sibling) |

---

### Flag (a): Seam violations — callers importing directly from a sibling module, not the barrel

**One violation found:**

`apps/myk9show/src/services/database/queries/__tests__/entryStatusEnumValues.test.ts:22`:
```typescript
import { getEntryCountsByStatus } from '../../entries/secretary';
```
This bypasses the barrel (`@/services/database/entries`). Since `secretary.ts` is re-exported via `export * from './secretary'` in `index.ts`, this import should target the barrel. Fix: change to `import { getEntryCountsByStatus } from '@/services/database/entries'`. (Or delete the import if the export is removed per proposal 4b.)

**None found** in production code outside the entries directory.

### Flag (b): Same surface using two different read exports for the same data

One pattern found — **intentional, keep-separate:**

- `components/shows/ShowDetails/EntriesTab.tsx` imports both `getEntriesByShow` (replication-backed) and `getPublicEntriesByShow` (anon PostgREST view), branching on auth state (lines 98 and 101).
- Similarly: `hooks/queries/useEntriesDatabase.ts`, `hooks/queries/useClassEntriesRaw.ts`, and `hooks/queries/useTrialEntries.ts` each import both the authed replication-backed variant and the anon public variant for the same entity, branching on auth state.

This is correct dual-path design. The authed path uses the full `entries` table (replication-backed); the anon path uses `view_public_entry_results` (PII/scored columns stripped). No consolidation warranted.

**No cases where a single surface uses two authed reads for the same data were found.**

### Flag (c): `postgrest-core`-tagged reads called from authed, offline-relevant surfaces

| Function | Caller | Offline relevance | Assessment |
|----------|--------|-------------------|------------|
| `getPendingEntries` | `hooks/queries/usePendingEntries.ts` → secretary attention strip | Secretary dashboard / pre-show; cross-show aggregate. Replication scope is per-show — a replication path is architecturally blocked. **Acceptable; annotate.** |
| `getEntryCountsByStatus` | No production caller — dead export | n/a |
| `checkArmbandConflicts` | No production caller — dead export | n/a |
| `countActiveEntriesByDog` | No production caller — test-only | n/a |
| `postgrestGetSecretaryEntriesForShow` | `secretary.ts` cold-store branch only | Only reached before /at-show syncs. Appropriate as cold-store fallback. |

---

## Step 4 — Consolidation opportunities

### 4a. MERGE: `secretaryReadReplication.ts` + `secretaryPostgrest.ts` → inline into `secretary.ts`

**Evidence:** Both modules have exactly one export each. Both are imported only by `secretary.ts` (lines 13 and 18 of `secretary.ts`). Neither appears in the barrel. They are private implementation details of `getEntriesForShow`.

- `secretaryReadReplication.ts:245` — sole export, consumed at `secretary.ts:74`
- `secretaryPostgrest.ts:65` — sole export, consumed at `secretary.ts:96`

**Offline-safety implication:** The replication path (`secretaryReadReplication`) is the warm-store branch of `getEntriesForShow`. Moving both functions into `secretary.ts` as unexported module-private functions changes nothing at runtime — the `isColdStore` guard in `secretary.ts:75` remains unchanged. Risk: LOW.

**Proposal:** Promote both functions to unexported functions within `secretary.ts`. Delete the two sibling files. Update barrel header comment if needed.

### 4b. DELETE: `getEntryCountsByStatus` — zero production callers

**Evidence:** No production import found outside the entries directory. One test-only import via sibling path (`entryStatusEnumValues.test.ts:22`).

**Offline-safety implication:** None (deleting a dead export).

**Proposal:** Verify via a fresh grep. If confirmed, delete from `secretary.ts` and fix or delete the test import (which also resolves the seam violation in Flag a).

### 4c. DELETE: `checkArmbandConflicts` (DB version) — zero production callers

**Evidence:** No production caller found. The `showRegistrationStore.ts:588` `checkArmbandConflicts` is a distinct in-memory store method, not an import of this function.

**Offline-safety implication:** None.

**Proposal:** Verify no dynamic `import()` references. If confirmed dead, delete.

### 4d. INVESTIGATE: `countActiveEntriesByDog` — zero production callers

**Evidence:** No production caller found via grep. The function has a detailed code comment (lines 724–731) explaining it is the delete-dog confirmation guard — deliberate `postgrest-core` for cross-show accuracy.

**Offline-safety implication:** The design is correct (the comment justifies `postgrest-core`). The question is whether the delete-dog UI actually calls this function.

**Proposal:** Trace the dog-delete confirmation flow (`DogDeleteDialog` or equivalent) to determine if `countActiveEntriesByDog` is missing from that flow (a wiring bug), or whether the check was removed. Do not delete without confirming the dog-delete guard is covered elsewhere.

### 4e. KEEP-SEPARATE: `getEntriesForShow` replication/cold-store dual path

Intentional design. Do not merge into a single PostgREST call.

### 4f. KEEP-SEPARATE: `publicReads.ts` vs `reads.ts`

Different auth tiers, different DB objects (`view_public_entry_results` vs `entries`). Must remain separate.

### 4g. KEEP-SEPARATE: `userEntriesReplication.ts`

Legitimate cohesion split from `search.ts`. `search.ts` is already 15,739 b; extracting the row-builder keeps it below the 500-line ceiling. No change warranted unless `search.ts` is restructured.

### 4h. ANNOTATE: `getPendingEntries` as intentional `postgrest-core`

The cross-show aggregate scope makes a replication path architecturally blocked. Add a comment documenting the constraint to prevent future "fix" attempts that would silently return wrong results.

---

## Step 5 — Refactor outline (follow-up plan scope)

This outlines the follow-up execution plan. **Do not execute in this plan.**

### Ordered steps

1. **Verify dead exports** — fresh grep to confirm `getEntryCountsByStatus` and `checkArmbandConflicts` have zero callers beyond tests. Also confirm `countActiveEntriesByDog` is genuinely unwired before acting.

2. **Delete the two dead exports** (`getEntryCountsByStatus`, `checkArmbandConflicts`) — lowest risk, no offline safety implications. Fix the seam violation in `entryStatusEnumValues.test.ts` at the same time (either update the import to the barrel, or delete the test assertion for a deleted export).

3. **Inline `secretaryReadReplication.ts` and `secretaryPostgrest.ts` into `secretary.ts`**:
   - Move `getReplicatedSecretaryEntriesForShow` before `getEntriesForShow` in `secretary.ts` as an unexported function.
   - Move `postgrestGetSecretaryEntriesForShow` into `secretary.ts` as an unexported function.
   - Delete both sibling files.

4. **Annotate `getPendingEntries`** with a comment explaining the intentional `postgrest-core` choice.

5. **Resolve `countActiveEntriesByDog`** based on investigation — either delete (if guard is covered elsewhere) or wire up to the dog-delete confirmation flow.

### Verification checklist

- `pnpm typecheck` → exit 0
- `cd apps/myk9show && npx vitest run src/services/database/entries/` → all pass
- Specific critical tests:
  - `secretary.replication.test.ts` — exercises the `getEntriesForShow` replication + cold-store fallback path
  - `reads.countActiveEntriesByDog.test.ts`
  - `reads.tombstoneFilter.test.ts`
  - `resultVisibility.test.ts`
  - `search.test.ts`
- `git status` — only files under `apps/myk9show/src/services/database/entries/` and `apps/myk9show/src/services/database/queries/__tests__/entryStatusEnumValues.test.ts` changed
- **Offline smoke** — after refactor, open `/at-show/:showId`, let replication sync, disable network, navigate to Entry Management: entries must load without the "Secretary entries replication cold" log warning.

### Explicit risk

The inline of `secretaryReadReplication.ts` is the only step with offline risk. If the `isColdStore` branch in `getEntriesForShow` is accidentally inverted during the move, the secretary Entry Management page will silently fall back to PostgREST on every load, breaking offline reads. The `secretary.replication.test.ts` suite covers this path, but the offline smoke must be run to confirm.
