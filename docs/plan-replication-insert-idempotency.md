# Plan: Replication INSERT Retry Idempotency — Investigation Verdict

> **Status:** Active

Spawned from improve-audit plan 006 (`docs/improve-audit-2026-06/006-insert-retry-idempotency-investigate.md`).
Investigated at HEAD of branch `claude/nifty-booth-5c1627` (one trivial drift file from the plan's base commit `deb820e35`; see Drift below).

---

## Drift check

`git diff --stat deb820e35..HEAD -- packages/replication/src apps/myk9show/src/services/replication`

Only one file changed:

```
apps/myk9show/src/services/replication/ReplicatedDogsTable.ts | 3 ++-
```

The change swaps an inline `.filter()` for a shared `selectOwnedDogs()` helper in `getDogsByOwner()` — no INSERT path touched. All citations below are valid at HEAD.

---

## Step 1 — Per-entity PK origin

For every `Replicated*Table` that queues INSERT mutations, the `data` object passed to `queueMutation('INSERT', id, data)` includes the row's PK (`id`) generated **on the client before upload**. Evidence per entity:

| Entity | Table file | PK column | Generated at | Evidence (file:line) |
|--------|-----------|-----------|--------------|----------------------|
| **Dogs** | `ReplicatedDogsTable.ts` | `id` | `crypto.randomUUID()` in `createDog()` | `ReplicatedDogsTable.ts:336` |
| **Entries** (show-map path) | `ReplicatedEntriesTable.ts` | `id` | `generateUUID()` called in `showMapActionMutations.ts:264`, passed as `entry.id` into `createEntry(entry)` | `showMapActionMutations.ts:264`, `ReplicatedEntriesTable.ts:456` |
| **Entries** (offline/legacy path) | `OfflineEntryCreator.ts` | `id` | `generateId()` at `OfflineEntryCreator.ts:474` — produces `timestamp36-random6` format, NOT a proper UUID | `OfflineEntryCreator.ts:474`, `idUtils.ts:6-9` |
| **Classes** | `ReplicatedClassesTable.ts` | `id` | Caller sets `classData.id \|\| crypto.randomUUID()` before passing to `createClass(classData)` | `useShowCreationWizardActions.ts:49`, `ReplicatedClassesTable.ts:463` |
| **Shows** | `ReplicatedShowsTable.ts` | `id` | `crypto.randomUUID()` in `createShow()` | `ReplicatedShowsTable.ts:337` |
| **Trials** | `ReplicatedTrialsTable.ts` | `id` | Caller sets `id = crypto.randomUUID()` in `trialStore.ts:53` before passing to `createTrial(trial)` | `trialStore.ts:53`, `ReplicatedTrialsTable.ts:241` |
| **Clubs** | `ReplicatedClubsTable.ts` | `id` | `crypto.randomUUID()` in `createClub()` | `ReplicatedClubsTable.ts:248` |
| **Armbands** | `ReplicatedArmbandsTable.ts` | `id` | `createLocalId()` = `globalThis.crypto.randomUUID()` (falls back to `armband-${Date.now()}-${Math.random()}`) | `ReplicatedArmbandsTable.ts:100-104`, `ReplicatedArmbandsTable.ts:231` |
| **Judge assignments** | `ReplicatedJudgeAssignmentsTable.ts` | `id` | `crypto.randomUUID()` in `createJudgeAssignment()` | `ReplicatedJudgeAssignmentsTable.ts:229` |

**All offline-INSERT entities generate their PK on the client and embed it in `data` before upload.** A network-timeout retry therefore re-sends the same PK — not a new one. This rules out Verdict C.

### Notable exception: entry legacy path

`OfflineEntryCreator.ts` uses `generateId()` from `apps/myk9show/src/utils/idUtils.ts`, which produces a `timestamp36-random6` string (e.g. `lx7abc-k3m9pq`), not a UUID. This is structurally the same safety property — the same stable client-generated string is resent on retry — but the format may cause Postgres to reject it if the `entries.id` column is typed `uuid`. If it does, the error is not a duplicate-key violation but a type-cast error (different Postgres code). This path is separately risky regardless of retry idempotency and is worth a quick schema check, but it is out of scope for this plan.

---

## Step 2 — Retry behavior on a duplicate-key error

### The INSERT execution path

`packages/replication/src/MutationManager.ts`, `executeMutation()` INSERT case (lines 591–603):

```ts
case 'INSERT': {
  const { data: rows, error } = await withTimeout(
    this.supabase.from(tableName).insert(data).select('id'),
    TIMEOUT_PRESETS.standard,
    `${tableName} insert`
  );
  if (error) throw error;          // ← Postgres 23505 arrives here
  if (!rows || rows.length === 0) {
    throw new Error(`RLS policy blocked INSERT on ${tableName} ...`);
  }
  return {};
}
```

When the server already committed the row (the timeout scenario), the retry's `insert(data)` hits Postgres UNIQUE VIOLATION (`SQLSTATE 23505`). Supabase-js returns this as `{ data: null, error: { code: "23505", message: "duplicate key value...", ... } }`. The line `if (error) throw error` throws this error object.

### The catch / classify path

The thrown error travels to the outer `catch` in `uploadPendingMutations()` (lines 466–509). The `OccRejectionError` guard does not match. Then `classifyMutationFailure()` is called, which delegates to `isRetryableError()`.

**`isRetryableError` for a `23505` Supabase error** (`packages/replication/src/mutation-utils.ts`, lines 196–253):

The error satisfies `isSupabaseError()` (object with string `message` and string `code`). Then:

- `code === '429'` — false
- `code?.startsWith('5')` — false (`"23505"` starts with `"2"`)
- `message.includes('connection' | 'timeout' | 'network' | ...)` — false
- `code?.startsWith('4') && code !== '429'` — false (`"23505"` starts with `"2"`)

None of the `isSupabaseError` branches return `true`. The function falls through to the `error instanceof Error` block. A Supabase `PostgrestError` is a plain object (not an `Error` instance), so that block also does not match. Final line: `return false`.

**`isRetryableError` returns `false` for a 23505 error.**

Back in `classifyMutationFailure()` (`packages/replication/src/mutation-retry.ts`, lines 23–53):

```ts
const canRetry = isRetryableError(error);          // false
const retries = (mutation.retries || 0) + 1;
const permanentlyFailed = retries >= maxRetries || !canRetry;  // true on first hit
```

Because `canRetry = false`, `permanentlyFailed = true` immediately — even on the first retry attempt (retries=1, maxRetries=3). The mutation is written to `FAILED_MUTATIONS` with status `'failed'` and error message `"Non-retryable error: duplicate key value..."`. It is removed from `PENDING_MUTATIONS` (`MutationManager.ts:504`).

---

## Verdict: **B — Wedge**

A network timeout after server commit causes the mutation to land permanently in the `FAILED_MUTATIONS` store on the very next upload attempt, requiring **user intervention** (retry or discard from the UI). It does not loop forever — the mutation is permanently failed immediately, not retried. But the user sees a sync-failure notification and a stuck item in the failed-mutations queue for a row that is already correctly persisted on the server.

No duplicate row is created (client-generated PK means the second INSERT hits a unique violation). But the `23505` is not silently treated as success; it poisons the failed-mutations queue with a false failure.

### Precise failure sequence

1. Client generates UUID, stores row locally, queues INSERT mutation.
2. Server receives INSERT, commits the row, sends 200 response.
3. Network times out before the 200 reaches the client (`withTimeout` throws `TimeoutError`).
4. `TimeoutError` is retryable (`isRetryableError` returns `true`). Mutation is re-queued with `retries=1`, scheduled for backoff retry.
5. On retry, the INSERT reaches the server again. Server returns `23505` (the row already exists).
6. `isRetryableError("23505")` returns `false`. `classifyMutationFailure` marks the mutation permanently failed.
7. User sees a sync-failure toast/badge. The row exists correctly on the server.

---

## Fix outline (follow-up plan, do not execute here)

### What to change

**File:** `packages/replication/src/MutationManager.ts`, `executeMutation()` INSERT case (~line 591).

Catch a `23505` error immediately after `if (error) throw error` and treat it as success:

```ts
case 'INSERT': {
  const { data: rows, error } = await withTimeout(
    this.supabase.from(tableName).insert(data).select('id'),
    TIMEOUT_PRESETS.standard,
    `${tableName} insert`
  );
  if (error) {
    // 23505 = unique_violation: the row already exists (committed on a prior
    // attempt whose response was lost to a network timeout). Treat as success —
    // the desired post-state (row persisted) is already achieved.
    if ((error as { code?: string }).code === '23505') {
      return {};
    }
    throw error;
  }
  if (!rows || rows.length === 0) {
    throw new Error(`RLS policy blocked INSERT on ${tableName} for row ${mutation.rowId}. ...`);
  }
  return {};
}
```

No other file needs changing for the primary fix. The `isRetryableError` function does not need to be changed — 23505 correctly should not be retried as a network error, but it should be caught earlier as a success condition.

### Test approach

**File:** `packages/replication/src/MutationManager.test.ts` (or a new sibling `MutationManager.insert-retry.test.ts`).

Assertion-first per `CLAUDE.md`: write the failing `expect` before touching the implementation.

```ts
it('treats a 23505 duplicate-key error on INSERT retry as success (not a permanent failure)', async () => {
  // Arrange: queue one INSERT mutation
  await mutationManager.queueMutation('INSERT', 'entries', 'row-uuid-123', {
    id: 'row-uuid-123',
    class_id: 'class-uuid-456',
  });

  // First upload: server returns 23505 (row already committed on a prior timed-out attempt)
  mockSupabase.from().insert().select.mockResolvedValueOnce({
    data: null,
    error: { code: '23505', message: 'duplicate key value violates unique constraint "entries_pkey"' },
  });

  await mutationManager.uploadPendingMutations();

  // The mutation must NOT be in FAILED_MUTATIONS (no user action required)
  const failed = await mutationManager.getFailedMutations();
  expect(failed).toHaveLength(0);

  // The mutation must be gone from PENDING_MUTATIONS (treated as done)
  const pending = await mutationManager.getPendingMutations();
  expect(pending).toHaveLength(0);
});
```

Run this test red against the current code first to prove the bug, then apply the fix and confirm green.

---

## Entry legacy-path side note (separate issue, out of scope)

`OfflineEntryCreator.ts:474` calls `generateId()` which returns `timestamp36-random6` format — not a valid Postgres UUID. If `entries.id` is `uuid` typed in the DB, every entry created through this path (registration flow) will fail at the DB level with a type-cast error (not `23505`). This is a separate bug independent of retry idempotency. It is flagged here for awareness but must be investigated and fixed separately.

---

## Files cited

| File | Role |
|------|------|
| `packages/replication/src/MutationManager.ts` | INSERT execution (lines 591–603), catch/classify (lines 466–509) |
| `packages/replication/src/mutation-utils.ts` | `isRetryableError()` (lines 196–253) |
| `packages/replication/src/mutation-retry.ts` | `classifyMutationFailure()` (lines 23–53) |
| `apps/myk9show/src/services/replication/ReplicatedDogsTable.ts` | Dog PK: `crypto.randomUUID()` line 336 |
| `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts` | Entry PK passed in; `toSupabaseRow` includes `id` at line 59 |
| `apps/myk9show/src/services/replication/ReplicatedClassesTable.ts` | Class PK from caller line 463 |
| `apps/myk9show/src/services/replication/ReplicatedShowsTable.ts` | Show PK: `crypto.randomUUID()` line 337 |
| `apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts` | Trial PK: `crypto.randomUUID()` in `trialStore.ts:53` |
| `apps/myk9show/src/services/replication/ReplicatedClubsTable.ts` | Club PK: `crypto.randomUUID()` line 248 |
| `apps/myk9show/src/services/replication/ReplicatedArmbandsTable.ts` | Armband PK: `createLocalId()` line 100 |
| `apps/myk9show/src/services/replication/ReplicatedJudgeAssignmentsTable.ts` | Judge-assignment PK: `crypto.randomUUID()` line 229 |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts` | Class PK: `crypto.randomUUID()` line 49 |
| `apps/myk9show/src/store/trialStore.ts` | Trial PK: `crypto.randomUUID()` line 53 |
| `apps/myk9show/src/services/entries/OfflineEntryCreator.ts` | Entry PK (legacy path): `generateId()` line 474 |
| `apps/myk9show/src/utils/idUtils.ts` | `generateId()` = timestamp36 + random6 (NOT a UUID) |
| `apps/myk9show/src/features/show-map/showMapActionMutations.ts` | Entry PK (show-map path): `generateUUID()` line 264 |
