# Plan 002: Create the move-up entry BEFORE marking the original moved

> **Executor instructions**: Follow step by step; run every verification and
> confirm the expected result before continuing. Honor "STOP conditions".
> Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 929240192..HEAD -- apps/myk9show/src/features/show-map/showMapActionMutations.ts`
> If changed, compare the "Current state" excerpt to the live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches an offline-first show-day write path)
- **Depends on**: none
- **Category**: bug (data integrity)
- **Planned at**: commit `929240192`, 2026-07-02

## Why this matters

"Move up" promotes a dog to a higher class on show day. Today
`moveUpShowMapEntry` writes in this order (`showMapActionMutations.ts:279-318`):

1. Mark the **original** entry `entry_status: 'moved'` (line 279).
2. **Then** create the new entry in the target class (line 287).
3. If step 2 throws, attempt a rollback that restores the original (line 306);
   if the rollback *also* throws, it is only logged (line 315).

The failure mode: step 1 succeeds, step 2 fails (network blip mid-write on venue
WiFi — exactly when this runs), and the rollback fails too. The dog's entry is
now stranded in `'moved'` status with **no** entry to actually run — the dog
silently drops off every running list, and because this is the offline-first
replication layer, that corrupted state **syncs to the server**. On show day, in
front of the first club, a dog just disappears from its class.

The fix inverts the order: create the new entry **first**, then mark the
original moved. Now if the create fails, the original is untouched (the dog
still runs where it was — safe). If the *second* write fails, roll back by
deleting the just-created entry; and even if that rollback fails, the worst case
is a **visible duplicate** entry the secretary can see and scratch — strictly
better than a silently disabled dog. After this plan, a test pins the write
order so it can't regress.

## Current state

`apps/myk9show/src/features/show-map/showMapActionMutations.ts`,
`moveUpShowMapEntry` (function starts line 208). The write section, verbatim:

```ts
// showMapActionMutations.ts:279-318
await replicatedEntriesTable.updateEntry(entryId, {
  entryStatus: 'moved',
  entry_status: 'moved',
  specialRequests: moveNote,
  special_requests: moveNote,
});

try {
  await replicatedEntriesTable.createEntry({
    id: newEntryId,
    dogId: currentEntry.dogId,
    showId: currentEntry.showId,
    classId: targetClassId,
    trialId: targetClass.trialId ?? targetClass.trial_id,
    trial_id: targetClass.trialId ?? targetClass.trial_id,
    entryStatus: 'confirmed',
    entry_status: 'confirmed',
    paymentStatus: 'waived',
    entryFee: 0,
    jumpHeight: currentEntry.jumpHeight,
    handler: currentEntry.handler,
    armband: currentEntry.armband,
    specialRequests: movedUpFromNote,
    special_requests: movedUpFromNote,
  });
} catch (error) {
  try {
    await replicatedEntriesTable.updateEntry(entryId, { /* restore original */ });
  } catch (rollbackError) {
    logger.error('[show-map] Failed to roll back move-up after create failure', rollbackError);
  }
  throw createDatabaseError(error, 'entries', 'show_map_move_up_create');
}
```

- `replicatedEntriesTable` has `createEntry`, `updateEntry`, and
  `deleteEntry(id)` (all mocked in the existing test — see below).
- The vars `previousEntryStatus`, `previousCheckInStatus`,
  `previousSpecialRequests` are captured at lines 267–271 and returned in the
  result (used by `undoShowMapMoveUp`). Keep computing and returning them.
- **Existing test with full mocks**:
  `apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts`
  already mocks `replicatedEntriesTable` with `mockCreateReplicatedEntry`,
  `mockUpdateReplicatedEntry`, `mockDeleteReplicatedEntry`,
  `mockGetReplicatedEntryById`, etc. Reuse those mocks — do not build new ones.

## Commands you will need

| Purpose   | Command                                                                                                            | Expected |
|-----------|-------------------------------------------------------------------------------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                                                                                                   | exit 0   |
| One test  | `cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts`                | all pass |
| Lint      | `pnpm lint`                                                                                                        | exit 0   |

## Scope

**In scope**:
- `apps/myk9show/src/features/show-map/showMapActionMutations.ts` (reorder writes in `moveUpShowMapEntry` only)
- `apps/myk9show/src/features/show-map/__tests__/showMapActionMutations.test.ts` (add tests)

**Out of scope**:
- `undoShowMapMoveUp` and its restore logic — unchanged. The result shape
  (`originalEntryId`, `newEntryId`, `previousEntryStatus`, …) must stay identical
  so undo keeps working.
- The eligibility / capacity guards (lines 216–265) — leave as-is.
- Any other function in the file.

## Git workflow

- Branch: `advisor/002-move-up-create-before-mark`
- `fix(show-map): create move-up entry before marking original moved`
- Do NOT push/PR unless instructed.

## Steps

### Step 1 (assertion-first): add failing tests pinning order + rollback

In the existing test file, add a `describe('moveUpShowMapEntry write order', …)`
block. Wire the standard mocks (copy the arrange from the existing move-up test
in this file). Add these cases:

1. **Order**: on the happy path, assert `createEntry` is called **before** the
   `updateEntry` that sets `entry_status: 'moved'`. Use vitest invocation order,
   e.g. capture `mockCreateReplicatedEntry.mock.invocationCallOrder[0]` <
   the `'moved'` `mockUpdateReplicatedEntry` call's order. (invocationCallOrder
   is a global monotonic counter — lower = earlier.)

2. **Create fails → original untouched**: make `mockCreateReplicatedEntry`
   reject. Assert the call throws AND that `mockUpdateReplicatedEntry` was
   **never** called with an object containing `entry_status: 'moved'` (the
   original was never disabled).

3. **Mark-moved fails → new entry rolled back**: let `createEntry` resolve, make
   the `'moved'` `updateEntry` reject. Assert `mockDeleteReplicatedEntry` is
   called with `newEntryId` (rollback deletes the orphan) and the call throws.

**Verify** (all should FAIL against current code — order is reversed, no delete
rollback exists):
`cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts`
→ the 3 new cases fail. Good.

### Step 2: reorder the writes and switch rollback to delete

Replace the write section (lines 279–318) with this shape:

```ts
// Create the promoted entry FIRST. If this fails, the original entry is left
// exactly as it was — the dog still runs where it is, nothing is corrupted.
try {
  await replicatedEntriesTable.createEntry({
    id: newEntryId,
    /* ...same fields as before... */
  });
} catch (error) {
  throw createDatabaseError(error, 'entries', 'show_map_move_up_create');
}

// New entry exists; now retire the original. If THIS fails, delete the entry we
// just created so we don't leave a duplicate — and if the delete also fails,
// a visible duplicate the secretary can scratch beats a silently disabled dog.
try {
  await replicatedEntriesTable.updateEntry(entryId, {
    entryStatus: 'moved',
    entry_status: 'moved',
    specialRequests: moveNote,
    special_requests: moveNote,
  });
} catch (error) {
  try {
    await replicatedEntriesTable.deleteEntry(newEntryId);
  } catch (rollbackError) {
    logger.error('[show-map] Failed to delete move-up entry after mark-moved failure', rollbackError);
  }
  throw createDatabaseError(error, 'entries', 'show_map_move_up');
}
```

Keep `logReplicatedEntryStatusChange` (lines 320–327) and the `return { … }`
(lines 329+) unchanged.

**Verify**: the 3 new tests pass AND every pre-existing test in the file still
passes:
`cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapActionMutations.test.ts`
→ all green.

### Step 3: full gates

`pnpm typecheck` → exit 0. `pnpm lint` → exit 0.

## Test plan

- 3 new cases in `showMapActionMutations.test.ts` (order, create-fail,
  mark-fail-rollback), modeled on the existing move-up test's arrange block.
- Regression guard = case 1 (write order) + case 3 (delete rollback).
- Full file green; then `cd apps/myk9show && pnpm test` (whole suite) green.

## Done criteria (ALL)

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] The move-up test file passes, including 3 new cases
- [ ] In `showMapActionMutations.ts`, `createEntry(` appears **before** the
      `entry_status: 'moved'` `updateEntry(` within `moveUpShowMapEntry`
      (`grep -n` to confirm line order)
- [ ] No `updateEntry(entryId, { … 'moved' … })` remains *before* the create
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` row for 002 updated

## STOP conditions

- `replicatedEntriesTable.deleteEntry` does not exist / has a different
  signature than `deleteEntry(id: string)` — STOP (the rollback needs it; the
  existing test mocks `mockDeleteReplicatedEntry`, so it should exist — if not,
  report).
- Reordering breaks a pre-existing test in a way that isn't a stale assertion
  about call order — STOP and report rather than editing other tests.
- The result object shape would have to change to make tests pass — STOP;
  `undoShowMapMoveUp` depends on it.

## Maintenance notes

- Invariant for reviewers: **the new entry must be durable before the original
  is retired.** Any future refactor that reintroduces "mark moved first"
  reintroduces the show-day corruption.
- If move-up ever becomes a single server RPC (atomic create+retire), this
  client-side ordering dance can be deleted — prefer that when touched next.
- The visible-duplicate worst case (create ok, mark-moved + delete both fail) is
  intentional and rare; it is recoverable by the secretary. Document it in the PR.
