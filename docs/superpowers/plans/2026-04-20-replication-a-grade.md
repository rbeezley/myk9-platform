# Replication Code Quality: B+ → A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise replication-layer quality from "upload-queue-audited" (B+) to "full-system-audited-with-profiled-perf-and-no-known-data-loss-bugs" (A) by systematically auditing every subsystem we skipped, resolving the open scoring sync bug, and adding the test + perf evidence the earlier work lacked.

**Architecture:** Seven sequential audit-plus-remediation phases, each producing (a) a written findings document in `docs/replication-audit/`, (b) fixes for any bug-class findings, and (c) new unit/integration tests that encode the invariants we just verified. No new features — this is remediation + evidence.

**Tech Stack:** TypeScript, Vitest, IndexedDB (via `idb`), Supabase real-time (postgres_changes channels), pnpm workspaces.

---

## Context Summary

The earlier work (commits `120007f5`, `b1472c99`) audited the upload queue — `MutationManager`, backups, parallel download fan-out — and added 9 tests. Those fixes are production-quality. The remaining surface area is:

| File                                                         | Lines  | Status                                                                                                                                               |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/replication/src/core/ReplicatedTable.ts`           | 614    | Unaudited — read path, subscriptions, merge                                                                                                          |
| `packages/replication/src/core/ReplicatedTableCache.ts`      | 381    | Unaudited — cache invalidation, staleness                                                                                                            |
| `packages/replication/src/core/ReplicatedTableBatch.ts`      | 157    | Unaudited                                                                                                                                            |
| `packages/replication/src/core/DatabaseManager.ts`           | 509    | Unaudited — IDB version upgrades, recovery                                                                                                           |
| `packages/replication/src/conflict/ConflictManager.ts`       | 201    | Unaudited                                                                                                                                            |
| `packages/replication/src/conflict/ConflictResolver.ts`      | 221    | Unaudited — LWW, field-level merge                                                                                                                   |
| `packages/replication/src/mutation-utils.ts`                 | 274    | **[ADDED]** Unaudited — helpers used by MutationManager                                                                                              |
| `packages/replication/src/index.ts`                          | 144    | **[ADDED]** Unaudited — public API surface                                                                                                           |
| `apps/myk9q/src/services/replication/tables/*.ts` (16 files) | ~3,923 | Unaudited                                                                                                                                            |
| Open data-loss bug                                           | —      | **Scoring sync bug** (memory: `project_scoring_sync_bug.md`) — mutations not flushing. Reproduced 2026-03-29 on `/scoring/classes/:classId/entries`. |

Phase ordering is bottom-up: base class → cache → conflict → lifecycle → wrappers → perf → scoring bug. The scoring bug sits last because earlier phases may expose its root cause.

**Finished-definition for Phase N:** (1) `docs/replication-audit/phase-N-<name>.md` committed, (2) every "severity: high" finding fixed + regression-tested, (3) `pnpm test` green in `packages/replication` and `apps/myk9q`.

---

## File Structure

**Created (docs):**

- `docs/replication-audit/README.md` — index of audit findings
- `docs/replication-audit/phase-1-read-path.md`
- `docs/replication-audit/phase-2-cache.md`
- `docs/replication-audit/phase-3-conflict-resolution.md`
- `docs/replication-audit/phase-4-database-manager.md`
- `docs/replication-audit/phase-5-per-app-wrappers.md`
- `docs/replication-audit/phase-6-perf-profile.md`
- `docs/replication-audit/phase-6.5-api-and-security.md` **[ADDED]**
- `docs/replication-audit/phase-7-scoring-sync-bug.md`

**Modified (source — only if audit finds bugs):**

- `packages/replication/src/core/ReplicatedTable.ts`
- `packages/replication/src/core/ReplicatedTableCache.ts`
- `packages/replication/src/core/ReplicatedTableBatch.ts`
- `packages/replication/src/core/DatabaseManager.ts`
- `packages/replication/src/conflict/ConflictManager.ts`
- `packages/replication/src/conflict/ConflictResolver.ts`
- Any wrapper in `apps/myk9q/src/services/replication/tables/`

**Created (tests — always):**

- `packages/replication/src/core/ReplicatedTable.subscription.test.ts`
- `packages/replication/src/core/ReplicatedTableCache.invariants.test.ts`
- `packages/replication/src/conflict/ConflictResolver.merge.test.ts`
- `packages/replication/src/core/DatabaseManager.lifecycle.test.ts`
- `packages/replication/src/mutation-utils.test.ts` **[ADDED]** (only if audit finds bugs)
- `packages/replication/src/MutationManager.stress.test.ts` **[ADDED]**
- `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts` (exemplar; repeat pattern for any wrapper with non-trivial logic found in audit)

---

## Audit Rubric

Every audit task applies the **same rubric** so findings are comparable across phases. For each file, answer in the findings doc:

1. **Correctness** — any bug, race, or silent failure?
2. **Error surfacing** — do failures propagate to the caller, or get swallowed?
3. **Invariants** — what must always hold? Are they tested?
4. **Resource cleanup** — subscriptions, timers, listeners all removed on teardown?
5. **Concurrency** — what happens if this method is called twice in parallel? Mid-sync?
6. **Offline semantics** — behavior online vs. offline vs. flaky-network?
7. **Test coverage** — which of the above are already tested? Which gaps are worth closing?

Each finding gets: severity (high / medium / low), one-paragraph description, file:line citation, proposed fix (or "no fix, document-only").

---

## Phase 1: Read Path Audit (`ReplicatedTable.ts`)

**Files:**

- Read: `packages/replication/src/core/ReplicatedTable.ts`
- Create: `docs/replication-audit/phase-1-read-path.md`
- Create: `packages/replication/src/core/ReplicatedTable.subscription.test.ts`

### Task 1.1: Scaffold the audit doc

- [ ] **Step 1: Create the findings file with the rubric sections**

```markdown
# Phase 1: Read Path Audit — ReplicatedTable.ts

**Audited:** packages/replication/src/core/ReplicatedTable.ts (614 lines)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Scope

Read path: `fetchAll`, `fetchOne`, `subscribe`, real-time merge into IDB, initial hydration.
Out of scope: mutations (covered by MutationManager audit), conflict resolution (Phase 3).

## Method map

| Method    | Lines | Responsibility |
| --------- | ----- | -------------- |
| (fill in) |       |                |

## Findings

### Correctness

### Error surfacing

### Invariants

### Resource cleanup

### Concurrency

### Offline semantics

### Test coverage gaps

## Remediation plan
```

- [ ] **Step 2: Commit the skeleton**

```bash
git add docs/replication-audit/phase-1-read-path.md
git commit -m "docs(replication): scaffold phase 1 read path audit"
```

### Task 1.2: Build the method map

- [ ] **Step 1: Read `ReplicatedTable.ts` in full and fill the method-map table.** For each exported or public method, record: name, start line, end line, one-sentence responsibility.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/phase-1-read-path.md
git commit -m "docs(replication): method map for ReplicatedTable"
```

### Task 1.3: Apply the rubric

- [ ] **Step 1: Walk each method against all 7 rubric questions.** For each question, either write "no issue" with a one-line justification or open a numbered finding with severity + file:line + proposed fix. **Specific bug-classes to scan for** (these are cheap to grep and historically present in this repo):
  - `postgres_changes` subscribe calls without a matching `removeChannel` on teardown (leak).
  - `try { ... } catch { /* noop */ }` or `catch (e) { console.warn(...) }` in the read path (silent failure).
  - `await` inside a `.forEach` loop (actually runs in parallel, but with no joined error surface).
  - Any call to `supabase.from(...)` that bypasses the IDB cache on an offline network — should return cached data, not throw.
  - Subscription callbacks that update IDB without first checking the mutation queue (real-time push overwriting a pending local write — this is the scoring-bug hypothesis).
  - `this.db` / `this.channel` accessed before init — any path that can fire before `ready()`.

- [ ] **Step 2: Commit the completed rubric.**

```bash
git add docs/replication-audit/phase-1-read-path.md
git commit -m "docs(replication): phase 1 findings"
```

### Task 1.4: Write regression tests for invariants (even if no bugs found)

- [ ] **Step 1: Write `ReplicatedTable.subscription.test.ts` with these four tests:**

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedTable } from './ReplicatedTable';
// plus whatever test harness / fake supabase client already exists — reuse ReplicatedTable.test.ts's helpers.

describe('ReplicatedTable subscription lifecycle', () => {
  it('removes the postgres_changes channel when unsubscribe is called', async () => {
    // Arrange: create table, subscribe, capture channel
    // Act: unsubscribe
    // Assert: supabase.removeChannel called with the exact channel
  });

  it('does not overwrite a row in IDB if a pending mutation exists for that row', async () => {
    // Arrange: enqueue a local mutation for row id=1, then fire a real-time event for row id=1
    // Act: let the subscription handler run
    // Assert: IDB still holds the locally-mutated value, not the server value
  });

  it('surfaces fetchAll errors to the caller instead of swallowing them', async () => {
    // Arrange: make supabase return an error
    // Act / Assert: await expect(table.fetchAll()).rejects.toThrow(...)
  });

  it('returns cached data from IDB when the network is offline', async () => {
    // Arrange: prime IDB with 3 rows, stub navigator.onLine=false
    // Act: await table.fetchAll()
    // Assert: returns the 3 cached rows, no supabase call made
  });
});
```

- [ ] **Step 2: Run the tests. Expected: some FAIL if the audit found bugs, otherwise all PASS.**

```bash
cd packages/replication && pnpm vitest run src/core/ReplicatedTable.subscription.test.ts
```

- [ ] **Step 3: If any fail, fix the source file and rerun until green. Document each fix in the phase-1 audit doc under "Remediation plan" with a commit hash.**

- [ ] **Step 4: Commit.**

```bash
git add packages/replication/src/core/ReplicatedTable.subscription.test.ts packages/replication/src/core/ReplicatedTable.ts
git commit -m "test(replication): invariant tests for ReplicatedTable subscriptions

Closes findings from phase-1-read-path.md"
```

---

## Phase 2: Cache Audit (`ReplicatedTableCache.ts`, `ReplicatedTableBatch.ts`)

**Files:**

- Read: `packages/replication/src/core/ReplicatedTableCache.ts`, `packages/replication/src/core/ReplicatedTableBatch.ts`
- Create: `docs/replication-audit/phase-2-cache.md`
- Create: `packages/replication/src/core/ReplicatedTableCache.invariants.test.ts`

### Task 2.1: Scaffold + method map

- [ ] **Step 1:** Create `docs/replication-audit/phase-2-cache.md` using the same template as Phase 1. Populate the method map for both files.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/phase-2-cache.md
git commit -m "docs(replication): scaffold phase 2 cache audit"
```

### Task 2.2: Apply the rubric

- [ ] **Step 1:** Walk each method against the 7 rubric questions. **Specific bug-classes to scan:**
  - Cache entries with no TTL or eviction policy — unbounded growth.
  - Stale reads: cache hit returned while a newer IDB row exists.
  - Batch commit partial-failure: some writes land, some don't, but caller sees "ok".
  - Non-atomic cache writes during IDB transactions (interleave with version upgrade).
  - Reference-sharing bugs: cache returns the same object reference to two callers who both mutate it.

- [ ] **Step 2: Commit findings.**

```bash
git add docs/replication-audit/phase-2-cache.md
git commit -m "docs(replication): phase 2 findings"
```

### Task 2.3: Invariant tests

- [ ] **Step 1:** Write `ReplicatedTableCache.invariants.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { ReplicatedTableCache } from './ReplicatedTableCache';

describe('ReplicatedTableCache invariants', () => {
  it('returns a defensive copy so mutations by callers do not corrupt cached data', () => {
    // Arrange: populate cache with {id: 1, name: 'a'}
    // Act: const a = cache.get(1); a.name = 'MUTATED'; const b = cache.get(1);
    // Assert: b.name === 'a'
  });

  it('invalidates an entry when its IDB row is updated out-of-band', async () => {
    // Arrange: prime cache, then write directly to IDB
    // Act: cache.get(id)
    // Assert: returns the new value, not the stale one
  });

  it('evicts or bounds memory when N rows exceed the cache size limit', () => {
    // Arrange: insert more rows than the configured limit
    // Assert: memory footprint stays bounded (either by eviction OR by an explicit "no limit" doc comment — record which in findings)
  });
});
```

- [ ] **Step 2: Run, fix, commit as in Phase 1.**

```bash
cd packages/replication && pnpm vitest run src/core/ReplicatedTableCache.invariants.test.ts
git add packages/replication/src/core/ReplicatedTableCache.invariants.test.ts packages/replication/src/core/ReplicatedTableCache.ts
git commit -m "test(replication): cache invariants + fixes from phase 2"
```

---

## Phase 3: Conflict Resolution Audit

**Files:**

- Read: `packages/replication/src/conflict/ConflictManager.ts`, `packages/replication/src/conflict/ConflictResolver.ts`
- Create: `docs/replication-audit/phase-3-conflict-resolution.md`
- Create: `packages/replication/src/conflict/ConflictResolver.merge.test.ts`

### Task 3.1: Scaffold + method map

- [ ] **Step 1:** Create the phase-3 doc with the template, populate the method map.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/phase-3-conflict-resolution.md
git commit -m "docs(replication): scaffold phase 3 conflict audit"
```

### Task 3.2: Apply the rubric + conflict-specific checks

- [ ] **Step 1:** Walk the 7 rubric questions. **Conflict-specific bug-classes:**
  - Last-write-wins using `updated_at` when two clients write within the same millisecond — deterministic tiebreaker?
  - Field-level merge losing a field when server and client both changed it (the "scored dog reverts" symptom in `project_scoring_sync_bug.md` may live here).
  - Pending mutations not considered as "local wins" when resolving inbound real-time events.
  - Clock-skew: `updated_at` comes from client vs. server — which?
  - Resolver throwing on unknown fields vs. silently dropping them.

- [ ] **Step 2: Commit findings.**

```bash
git add docs/replication-audit/phase-3-conflict-resolution.md
git commit -m "docs(replication): phase 3 findings"
```

### Task 3.3: Merge-semantics tests

- [ ] **Step 1:** Write `ConflictResolver.merge.test.ts`. This is where we encode the behavior that _protects scored data_.

```typescript
import { describe, expect, it } from 'vitest';
import { ConflictResolver } from './ConflictResolver';

describe('ConflictResolver: local-wins semantics', () => {
  it('keeps a locally-mutated field when a concurrent server update lacks that field change', () => {
    const base = { id: 1, score: null, status: 'pending', updated_at: '2026-04-20T10:00:00Z' };
    const local = { id: 1, score: 95, status: 'pending', updated_at: '2026-04-20T10:00:05Z' };
    const server = { id: 1, score: null, status: 'completed', updated_at: '2026-04-20T10:00:03Z' };
    const merged = ConflictResolver.merge({ base, local, server });
    expect(merged.score).toBe(95); // local scoring survives
    expect(merged.status).toBe('completed'); // server status applies
  });

  it('gives local the tiebreak when updated_at is identical', () => {
    const base = { id: 1, score: null, updated_at: '2026-04-20T10:00:00Z' };
    const local = { id: 1, score: 95, updated_at: '2026-04-20T10:00:05Z' };
    const server = { id: 1, score: 80, updated_at: '2026-04-20T10:00:05Z' };
    const merged = ConflictResolver.merge({ base, local, server });
    expect(merged.score).toBe(95);
  });

  it('does not overwrite a local row that has a pending mutation in the queue', () => {
    // Arrange: enqueue a pending mutation for row 1, receive a server event for row 1
    // Assert: merged result equals local, not server
  });
});
```

- [ ] **Step 2: Run, fix, commit.** **Note:** if the first test fails, that is almost certainly the scoring sync bug root cause. Flag prominently in the findings doc.

```bash
cd packages/replication && pnpm vitest run src/conflict/ConflictResolver.merge.test.ts
git add packages/replication/src/conflict/ConflictResolver.merge.test.ts packages/replication/src/conflict/*.ts
git commit -m "test(replication): conflict merge semantics + fixes from phase 3"
```

### Task 3.4: [ADDED] Audit `mutation-utils.ts`

`mutation-utils.ts` (274 lines) is adjacent to the conflict/merge path — helpers invoked by `MutationManager` during enqueue and flush. Skipping it would leave ~4% of the replication package unaudited.

**Files:**

- Read: `packages/replication/src/mutation-utils.ts`
- Modify (append section): `docs/replication-audit/phase-3-conflict-resolution.md`
- Create (if gaps found): `packages/replication/src/mutation-utils.test.ts`

- [ ] **Step 1:** Under a new `## mutation-utils.ts` heading in the phase-3 doc, build the method map (exported helper, line range, one-sentence purpose).

- [ ] **Step 2:** Apply the 7-question rubric. **Helper-specific bug-classes:**
  - Serializer helpers that strip `undefined` vs. `null` incorrectly (silent field drops).
  - Payload-diffing helpers that return an empty diff when the caller expected `{}` (no-op update swallowed).
  - Retry/backoff calculators with unclamped upper bounds.
  - Equality helpers that false-positive on `{a: 1}` vs. `{a: 1, b: undefined}`.

- [ ] **Step 3:** If any finding is severity: high, write a regression test in `mutation-utils.test.ts` first, then fix. If only low-severity: document-only, no new test file.

- [ ] **Step 4: Commit.**

```bash
git add docs/replication-audit/phase-3-conflict-resolution.md packages/replication/src/mutation-utils.ts packages/replication/src/mutation-utils.test.ts
git commit -m "docs+test(replication): audit mutation-utils helpers"
```

---

## Phase 4: DatabaseManager Lifecycle Audit

**Files:**

- Read: `packages/replication/src/core/DatabaseManager.ts`
- Create: `docs/replication-audit/phase-4-database-manager.md`
- Create: `packages/replication/src/core/DatabaseManager.lifecycle.test.ts`

### Task 4.1: Scaffold + method map

- [ ] **Step 1:** Create the phase-4 doc. Populate the method map, focusing on: `open`, `upgrade`, `close`, `recover`, version-change handlers.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/phase-4-database-manager.md
git commit -m "docs(replication): scaffold phase 4 database-manager audit"
```

### Task 4.2: Apply rubric + lifecycle checks

- [ ] **Step 1:** **Lifecycle-specific bug-classes:**
  - `onupgradeneeded` migrations that lose data when two tabs race an upgrade.
  - Database open that silently succeeds with an older schema version (missing object store).
  - Recovery path that wipes IDB without surfacing to the user.
  - `versionchange` event from another tab not handled — the open DB stays locked.
  - `blocked` event with no user-visible remediation.
  - Quota-exceeded write swallowed.

- [ ] **Step 2: Commit findings.**

```bash
git add docs/replication-audit/phase-4-database-manager.md
git commit -m "docs(replication): phase 4 findings"
```

### Task 4.3: Lifecycle tests

- [ ] **Step 1:** Write `DatabaseManager.lifecycle.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { DatabaseManager } from './DatabaseManager';

describe('DatabaseManager lifecycle', () => {
  it('opens at the expected schema version and creates all required object stores', async () => {
    const mgr = new DatabaseManager();
    const db = await mgr.open();
    expect(db.version).toBe(/* current expected version from constants.ts */);
    for (const store of /* expected stores */ []) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
  });

  it('surfaces quota-exceeded errors as a typed error, not silently', async () => {
    // Arrange: mock IDB to throw QuotaExceededError on write
    // Act / Assert: expect a specific error class propagates
  });

  it('handles a versionchange event from a second tab by closing cleanly', async () => {
    // Simulate: open DB, fire versionchange, assert the DB is closed + a user-surface event emitted
  });

  it('recovers from a corrupt DB by deleting and reopening, not by hanging', async () => {
    // Simulate: corrupt DB, call recover, assert open returns a fresh empty DB
  });
});
```

- [ ] **Step 2: Run, fix, commit.**

```bash
cd packages/replication && pnpm vitest run src/core/DatabaseManager.lifecycle.test.ts
git add packages/replication/src/core/DatabaseManager.lifecycle.test.ts packages/replication/src/core/DatabaseManager.ts
git commit -m "test(replication): DB lifecycle tests + fixes from phase 4"
```

### Task 4.4: [ADDED] Multi-tab concurrent-write test

Secretaries commonly have the app open in two windows (e.g., one for scoring, one for a run order view). A mutation written in tab A must not be lost by tab B's cache, and vice versa.

- [ ] **Step 1:** Add a test to `DatabaseManager.lifecycle.test.ts` (or a sibling file) that simulates two `DatabaseManager` instances sharing the same IDB:

```typescript
describe('DatabaseManager multi-tab writes', () => {
  it('does not drop a mutation written in tab A when tab B flushes concurrently', async () => {
    // Arrange: two DatabaseManager instances, both opened against same fake-indexeddb
    // Act: mgrA enqueues mutation m1; mgrB enqueues mutation m2; both flush simultaneously
    // Assert: Supabase sees both m1 and m2 exactly once each (no duplicates, no drops)
  });

  it('does not double-apply the same mutation if both tabs see it in the queue', async () => {
    // Arrange: prime shared IDB with one queued mutation m1
    // Act: both tabs call flush()
    // Assert: Supabase update called exactly once for m1
  });
});
```

- [ ] **Step 2: Run, fix, commit.** If the flush lacks a cross-tab lock (e.g., via `navigator.locks` or an IDB-based semaphore), this is a real bug — record and fix.

```bash
cd packages/replication && pnpm vitest run src/core/DatabaseManager.lifecycle.test.ts
git add packages/replication/src/core/DatabaseManager.lifecycle.test.ts packages/replication/src/core/DatabaseManager.ts packages/replication/src/MutationManager.ts
git commit -m "test(replication): multi-tab concurrent-write safety"
```

---

## Phase 5: Per-App Wrapper Audit

16 wrappers in `apps/myk9q/src/services/replication/tables/` total ~3,923 lines. Full per-file audit would be overkill; instead **audit by class of wrapper**.

**Files:**

- Read: all 16 wrappers (listed below)
- Create: `docs/replication-audit/phase-5-per-app-wrappers.md`
- Create: `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts` (exemplar)

### Task 5.1: Classify the wrappers

- [ ] **Step 1:** Create the phase-5 doc. Group the 16 wrappers into three buckets:
  - **A (scoring-critical):** `ReplicatedEntriesTable`, `ReplicatedClassesTable`, `ReplicatedShowsTable`, `ReplicatedTrialsTable`. Full audit — these gate offline scoring.
  - **B (config / visibility):** `ReplicatedClassVisibilityOverridesTable`, `ReplicatedShowVisibilityDefaultsTable`, `ReplicatedTrialVisibilityOverridesTable`, `ReplicatedClassRequirementsTable`. Skim for the wrapper-specific bug-classes below.
  - **C (views + notifications):** `ReplicatedAnnouncementReadsTable`, `ReplicatedAnnouncementsTable`, `ReplicatedAuditLogViewTable`, `ReplicatedNationalsRankingsTable`, `ReplicatedPushNotificationConfigTable`, `ReplicatedPushSubscriptionsTable`, `ReplicatedStatsViewTable`, `ReplicatedEventStatisticsTable`. Spot-check only; document that they're read-mostly.

- [ ] **Step 2: Commit the classification.**

```bash
git add docs/replication-audit/phase-5-per-app-wrappers.md
git commit -m "docs(replication): classify wrappers for phase 5 audit"
```

### Task 5.2: Full audit of bucket A

- [ ] **Step 1:** For each of the 4 A-bucket files, apply the rubric. **Wrapper-specific bug-classes:**
  - Business logic inside the wrapper that bypasses the mutation queue with a direct `supabase.from(...)` call (breaks offline).
  - Methods that read from the cache + write to Supabase without enqueueing (silent "write" that disappears on refresh).
  - Helper methods that call `.updateXStatus()` but forget to include required columns, triggering server-side defaults.
  - Property-name drift between the wrapper and the DB schema (Supabase column renamed; wrapper still writes the old name).

- [ ] **Step 2: Commit findings.**

```bash
git add docs/replication-audit/phase-5-per-app-wrappers.md
git commit -m "docs(replication): phase 5 bucket A findings"
```

### Task 5.3: Bucket B + C spot-checks

- [ ] **Step 1:** For each file in B, read top-to-bottom once and record: "no issues" OR specific finding. No rubric ceremony — these are thinner wrappers.

- [ ] **Step 2:** For each file in C, verify it is read-only (no `insert` / `update` / `delete` calls from app code). Record the answer.

- [ ] **Step 3: Commit.**

```bash
git add docs/replication-audit/phase-5-per-app-wrappers.md
git commit -m "docs(replication): phase 5 buckets B+C findings"
```

### Task 5.4: Exemplar wrapper test

`ReplicatedEntriesTable` already has tests (`apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.test.ts`). Write a test for `ReplicatedShowsTable` as the exemplar for the pattern, so the remaining A-bucket wrappers have a template to follow.

- [ ] **Step 1:** Create `apps/myk9q/src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts` with tests mirroring the structure of the existing Entries test — at minimum: (a) wrapper method delegates to the underlying `ReplicatedTable`, (b) wrapper method enqueues a mutation for an offline write, (c) wrapper does not bypass the queue.

- [ ] **Step 2: Run, fix, commit.**

```bash
cd apps/myk9q && pnpm vitest run src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts
git add apps/myk9q/src/services/replication/tables/__tests__/ReplicatedShowsTable.test.ts
git commit -m "test(myk9q): wrapper contract test for ReplicatedShowsTable"
```

### Task 5.5: Fix any high-severity wrapper findings

- [ ] **Step 1:** For each high-severity finding in Task 5.2–5.3, write a regression test that fails, then fix the wrapper, then watch it pass. One task per fix, one commit per fix. If zero high-severity findings: skip.

---

## Phase 6: Performance Profile

Up to this point, every claim about performance has been a hand-wave. This phase produces numbers.

**Files:**

- Create: `docs/replication-audit/phase-6-perf-profile.md`
- Create: `packages/replication/src/core/ReplicatedTable.perf.bench.ts` (vitest bench, if the codebase doesn't already have a bench harness — else add to an existing one)

### Task 6.1: Instrument hydration

- [ ] **Step 1:** Add `performance.mark` / `performance.measure` calls at hydration start + end in `ReplicatedTable` or wherever the initial fan-out happens. If wrapping `MutationManager.flush`, also mark there.

- [ ] **Step 2:** Temporarily add a `console.log` of the measure summary in dev only (gated on `import.meta.env.DEV`).

- [ ] **Step 3:** Start `pnpm dev:q`, log in, force a full resync (clear IDB via devtools → reload), capture the measures for at least: initial hydration total, per-table download time, subscribe setup time, mutation-flush time.

- [ ] **Step 4:** Record the numbers in `phase-6-perf-profile.md` with the hardware + network conditions.

- [ ] **Step 5: Commit the instrumentation + the findings doc.**

```bash
git add packages/replication/src/core/ReplicatedTable.ts docs/replication-audit/phase-6-perf-profile.md
git commit -m "perf(replication): capture hydration timings"
```

### Task 6.2: Subscription-leak scan

- [ ] **Step 1:** Run the app for 10 minutes of typical secretary flow (open show → switch trials → open class → switch to another show). Between each step, capture `window.supabase.getChannels().length` via the devtools console.

- [ ] **Step 2:** Record the counts over time. An upward monotonic trend is a leak.

- [ ] **Step 3:** If a leak exists, trace it to the owning component's `useEffect` cleanup — likely missing `removeChannel`. Fix + add a regression test.

- [ ] **Step 4:** Commit.

```bash
git add docs/replication-audit/phase-6-perf-profile.md
git commit -m "perf(replication): subscription leak measurement + fix"
```

### Task 6.3: Set SLOs

- [ ] **Step 1:** Based on the numbers, propose SLOs in `phase-6-perf-profile.md`:
  - Initial hydration (empty IDB, typical show size): ≤ X seconds.
  - Incremental sync round-trip: ≤ Y ms.
  - Steady-state subscription count: constant (no growth across route changes).
  - **[ADDED]** Cache memory footprint at t+30min: ≤ initial + 20%.
  - **[ADDED]** Large-queue flush throughput: ≥ N mutations/second.

- [ ] **Step 2:** Commit.

```bash
git add docs/replication-audit/phase-6-perf-profile.md
git commit -m "perf(replication): establish SLOs"
```

### Task 6.4: [ADDED] Large-queue stress test

"Offline for a day, then reconnect" is a core offline-first promise for ringside. We have no evidence it survives at scale.

- [ ] **Step 1:** Write `packages/replication/src/MutationManager.stress.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { MutationManager } from './MutationManager';

describe('MutationManager: large-queue stress', () => {
  it('flushes 500 queued mutations without dropping any', async () => {
    // Arrange: enqueue 500 mutations spanning 5 tables
    // Act: flush with a stubbed supabase client that succeeds after a 1ms delay
    // Assert: server observed all 500, in enqueue order per table; queue is empty
  });

  it('survives a mid-flush failure at mutation 250 — retries on next flush without duplicating the first 249', async () => {
    // Arrange: enqueue 500; stub supabase to fail the 250th call once
    // Act: flush, then flush again
    // Assert: each mutation applied exactly once; no duplicates in server observed list
  });
});
```

- [ ] **Step 2: Run, fix, commit.**

```bash
cd packages/replication && pnpm vitest run src/MutationManager.stress.test.ts
git add packages/replication/src/MutationManager.stress.test.ts packages/replication/src/MutationManager.ts
git commit -m "test(replication): large-queue flush stress"
```

### Task 6.5: [ADDED] Flaky-network test

Real networks drop mid-request. A read that times out should not leave the cache in an inconsistent state.

- [ ] **Step 1:** Add to `ReplicatedTable.subscription.test.ts` (from Task 1.4):

```typescript
it('recovers from a mid-fetch network drop without corrupting the cache', async () => {
  // Arrange: prime cache with 3 rows
  // Act: call fetchAll() with a stub that aborts mid-response
  // Assert: cache still has the original 3 rows, and the next fetchAll() succeeds
});

it('retries a failed real-time event replay without double-applying', async () => {
  // Arrange: subscribe; deliver a real-time UPDATE; simulate a retry delivering the same event id
  // Assert: IDB row updated exactly once
});
```

- [ ] **Step 2: Run, fix, commit.**

```bash
cd packages/replication && pnpm vitest run src/core/ReplicatedTable.subscription.test.ts
git add packages/replication/src/core/ReplicatedTable.subscription.test.ts packages/replication/src/core/ReplicatedTable.ts
git commit -m "test(replication): flaky-network and replay idempotency"
```

---

## Phase 6.5: [ADDED] Public API + Security Pass-Through

Short phase. Two targeted checks before we close out.

**Files:**

- Read: `packages/replication/src/index.ts`
- Create: `docs/replication-audit/phase-6.5-api-and-security.md`

### Task 6.5.1: Public API surface audit

- [ ] **Step 1:** Open `packages/replication/src/index.ts`. List every export. For each, record: intended consumer (app code vs. internal-only), current callers via `rg` across the monorepo, and whether the export is the narrowest possible shape (e.g., a method vs. the whole class).

- [ ] **Step 2:** Under `## Public API` in the phase-6.5 doc, record one of: "export is correct", "export should be narrowed to X", "export is unused and should be removed", "consumer is bypassing the mutation queue via this export — bug".

- [ ] **Step 3:** Fix any "bypassing the mutation queue" findings immediately (these are offline-correctness bugs). Defer "unused" / "narrow" findings to follow-up unless trivial.

- [ ] **Step 4: Commit.**

```bash
git add docs/replication-audit/phase-6.5-api-and-security.md packages/replication/src/index.ts
git commit -m "docs(replication): public API audit"
```

### Task 6.5.2: RLS error surfacing

RLS denials on reads can silently return empty arrays, which looks identical to "no data" to the UI. Verify the read path distinguishes the two.

- [ ] **Step 1:** Under `## RLS pass-through` in the phase-6.5 doc, answer: when Supabase returns a PostgREST error with code starting `42` (insufficient privilege / RLS), does `ReplicatedTable.fetchAll()` throw, log, or return `[]`?

- [ ] **Step 2:** If it silently returns `[]`, add a test that asserts it throws a typed `RlsDeniedError` (or equivalent). Fix.

```typescript
// add to ReplicatedTable.subscription.test.ts
it('throws a typed error when Supabase returns an RLS denial, not an empty array', async () => {
  // Arrange: stub supabase to return { data: null, error: { code: '42501' } }
  // Act / Assert: await expect(table.fetchAll()).rejects.toThrow(/permission|RLS/i);
});
```

- [ ] **Step 3: Run, fix, commit.**

```bash
cd packages/replication && pnpm vitest run src/core/ReplicatedTable.subscription.test.ts
git add packages/replication/src/core/ReplicatedTable.subscription.test.ts packages/replication/src/core/ReplicatedTable.ts docs/replication-audit/phase-6.5-api-and-security.md
git commit -m "test(replication): surface RLS denials as typed errors"
```

---

## Phase 7: Scoring Sync Bug Resolution

By now, Phases 1–5 have likely exposed the root cause (most likely in Phase 3 or Phase 5 bucket A). This phase writes the failing test and the fix.

**Files:**

- Create: `docs/replication-audit/phase-7-scoring-sync-bug.md`
- Modify: whichever file(s) Phase 3 / Phase 5 identified as the bug site
- Create / modify: tests that reproduce the bug

### Task 7.1: Reproduce the bug in a test

- [ ] **Step 1:** Write a failing test that reproduces the symptom from `project_scoring_sync_bug.md`: enqueue a score mutation, fire a real-time event for the same entry, observe that the score is preserved.

```typescript
// apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts
import { describe, expect, it } from 'vitest';

describe('ReplicatedEntriesTable: scoring sync (regression)', () => {
  it('preserves a locally-scored entry when a real-time update arrives without the score', async () => {
    // Arrange: mount a fake entries table, score dog 1 locally (enqueue mutation)
    // Act: fire a real-time row update for dog 1 with score=null, status=pending
    // Assert: after merge, local score is still present, and the mutation is still in the queue
  });

  it('flushes the queued scoring mutation to supabase on next sync', async () => {
    // Arrange: queue a score mutation while offline
    // Act: go online, flush
    // Assert: supabase.from('entries').update called with { score: 95 }
  });
});
```

- [ ] **Step 2: Run, confirm RED.**

```bash
cd apps/myk9q && pnpm vitest run src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts
# Expected: both FAIL
```

- [ ] **Step 3: Commit RED test.**

```bash
git add apps/myk9q/src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts
git commit -m "test(myk9q): failing regression test for scoring sync data loss"
```

### Task 7.2: Write the findings doc

- [ ] **Step 1:** In `phase-7-scoring-sync-bug.md`, write:
  - Symptom (copy from memory file, with dates).
  - Hypothesis before the audit (from the 2026-03-29 investigation).
  - Actual root cause (from Phase 3 / Phase 5 findings).
  - Fix approach.
  - Guardrail — which test will catch regressions.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/phase-7-scoring-sync-bug.md
git commit -m "docs(replication): scoring sync bug root cause + fix plan"
```

### Task 7.3: Implement the fix

- [ ] **Step 1:** Apply the minimal fix identified above. Resist the urge to refactor nearby code — that belongs in a follow-up, not this commit.

- [ ] **Step 2: Run the failing tests — confirm GREEN.**

```bash
cd apps/myk9q && pnpm vitest run src/services/replication/tables/__tests__/ReplicatedEntriesTable.scoring-sync.test.ts
# Expected: both PASS
```

- [ ] **Step 3:** Run the full replication test suite to confirm no regressions.

```bash
cd packages/replication && pnpm test
cd apps/myk9q && pnpm test
# Expected: all green
```

- [ ] **Step 4:** Manually reproduce via `pnpm dev:q`: score a dog, refresh, score another dog, confirm first dog's score persists. Capture result in the findings doc.

- [ ] **Step 5: Commit.**

```bash
git add -- packages/replication/src/ apps/myk9q/src/services/replication/
git commit -m "fix(replication): preserve locally-scored entries from real-time overwrites

Closes data-loss bug reproduced 2026-03-29 — see
docs/replication-audit/phase-7-scoring-sync-bug.md"
```

### Task 7.4: Update memory

- [ ] **Step 1:** Remove or update `project_scoring_sync_bug.md` in `~/.claude/projects/-Users-richardbeezley-AI-Projects-myk9-platform/memory/` to reflect the fix (date, commit, location). Keep as reference if a variant ever recurs.

- [ ] **Step 2:** Update `MEMORY.md` index entry.

---

## Final Wrap-Up

### Task 8.1: Audit index

- [ ] **Step 1:** Write `docs/replication-audit/README.md` — one-paragraph summary per phase, link to each findings doc, record final overall grade.

- [ ] **Step 2: Commit.**

```bash
git add docs/replication-audit/README.md
git commit -m "docs(replication): audit summary + final grading"
```

### Task 8.2: TO-DOS sync

- [ ] **Step 1:** In `TO-DOS.md`, either (a) add a new line under a "Completed" section summarizing the audit, or (b) tick off any existing item that this work closed (e.g., `Scoring Sync Bug` from harden backlog if present).

- [ ] **Step 2: Commit.**

```bash
git add TO-DOS.md
git commit -m "chore(todos): record replication audit completion"
```

### Task 8.3: PR

- [ ] **Step 1:** Push the branch and open a PR titled `chore(replication): full system audit + scoring sync fix`. Body:

```
## Summary
- Seven-phase audit of @myk9/replication, documented in docs/replication-audit/
- Fixes scoring sync data-loss bug (root cause: <X>)
- Adds ~<N> invariant tests for read path, cache, conflict merge, DB lifecycle, wrappers
- Establishes hydration-time SLOs

## Test plan
- [ ] pnpm test in packages/replication — all green
- [ ] pnpm test in apps/myk9q — all green
- [ ] Manual: score a dog, observe score persists through a real-time event
- [ ] Manual: measure hydration on empty IDB; matches phase-6 SLO
```

---

## Exit Criteria (what makes this plan "A")

Every one of these must be true before claiming the A grade:

1. **[EXPANDED]** Eight findings docs exist under `docs/replication-audit/` (phases 1–7 plus 6.5) and are linked from `README.md`.
2. Every high-severity finding has a corresponding regression test and fix commit.
3. `pnpm test` is green in `packages/replication` and `apps/myk9q`.
4. The scoring sync bug test in Task 7.1 is green.
5. **[ADDED]** The multi-tab test (Task 4.4), large-queue stress (Task 6.4), flaky-network tests (Task 6.5), and RLS-denial test (Task 6.5.2) are all green.
6. Hydration perf numbers are recorded and SLOs are set.
7. Subscription count is flat across a 10-minute session.
8. Memory files are updated to reflect current truth.

If any of 1–8 is missing, the grade is still A− at best. Don't self-promote.
