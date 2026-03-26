# Trial Details Page: Fix Entries Not Showing

**Date:** 2026-03-25
**Status:** Approved

## Problem

Entries exist in classes (visible on class details page with correct counts), but the trial details page shows 0 entries in both the classes table and the Entries tab.

**Root cause:** `entries.trial_id` is never populated during registration wizard entry creation. The column exists in the schema (nullable) but only `createDayOfEntry` sets it — the primary entry path (replication layer) leaves it NULL. `getEntriesByTrial()` filters `.eq('trial_id', trialId)` and always returns 0.

A secondary problem: `TrialDetailsPage` fetches every entry in the database via `getAllEntries()` from `useClassStoreCompat()`, then filters client-side by classId. This is wasteful and fragile.

## Approach: Eliminate the Denormalization

Rather than fixing every write path to populate `entries.trial_id`, eliminate reliance on it entirely. Every entry has a `class_id`, and every class has a `trial_id`. Query entries through the class relationship — correct by construction, no discipline required on write paths.

## Changes

### 1. Rewrite `getEntriesByTrial()` — Join Through `trial_classes`

**File:** `apps/myk9show/src/services/database/queries/entry-query-lookups.ts`

Replace `.eq('trial_id', trialId)` with a PostgREST `!inner` join filter:

```typescript
const { data, error } = await supabase
  .from('entries')
  .select(
    `
    *,
    dog:dog_id ( id, name, call_name, breed, owner:owner_id ( id, first_name, last_name, email ) ),
    class:class_id!inner ( id, name, class_number, entry_fee, trial_id ),
    promo_code:promo_code_id ( id, code, discount_type, discount_value )
  `
  )
  .eq('class.trial_id', trialId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false });
```

The `!inner` modifier on `class:class_id` ensures only entries whose class belongs to the target trial are returned. Single query, no schema changes.

`TrialEntriesTable` is unchanged — it already calls `getEntriesByTrial(trialId)` and maps the result.

### 2. Replace Global Entry Fetch in `TrialDetailsPage`

**File:** `apps/myk9show/src/pages/TrialDetailsPage.tsx`

Stop destructuring `entries: allEntries` from `useClassStoreCompat()`. Extract a shared `useTrialEntries(trialId)` hook (in `src/hooks/queries/`) that wraps the `getEntriesByTrial` query with key `['trials', trialId, 'entries']`. Both `TrialDetailsPage` and `TrialEntriesTable` use this hook — React Query deduplicates automatically, so no extra network call.

The `trialWithClasses` memo computes per-class entry counts from the trial-scoped entries instead of a global list. `useTrialStats` receives the same trial-scoped entries.

### 3. Cleanup

- **`useTrialStats` signature unchanged.** It takes `allEntries: EntryForStats[]` as a parameter. Only the input changes — trial-scoped instead of global. The hook already filters by classId set internally, so it continues to work correctly.
- **`useClassStoreCompat` unchanged.** Other consumers may still use its `entries` property. We just stop using it in `TrialDetailsPage`.
- **No migration needed.** The `entries.trial_id` column stays as-is (nullable). It becomes irrelevant to this feature. A future cleanup could drop the column, but that's out of scope.

## What's NOT Changing

- `TrialEntriesTable` component — already consumes `getEntriesByTrial()` correctly
- `useTrialStats` hook — same interface, just receives pre-scoped data
- `useClassStoreCompat` hook — stays the same, other consumers unaffected
- Database schema — no migrations
- Entry creation paths — no changes to write logic

## Testing

- Update `getEntriesByTrial` tests to verify the `!inner` join query pattern
- Update `TrialDetailsPage` tests if any assert on `allEntries` from the compat hook
- Verify `useTrialStats` tests still pass (hook filters by classId internally; input is now pre-filtered but behavior is identical)
