# Database Migration: Add license_key to Entries Table

## Overview

This migration adds a denormalized `license_key` column to the `entries` table to enable efficient real-time subscription filtering in Supabase. This solves the performance issue where the app was receiving real-time events for ALL entries across ALL shows, instead of just entries from the current show.

## Problem Being Solved

**Before:**
- Supabase real-time subscriptions couldn't filter by `license_key` because `entries` table didn't have this column
- The app received notifications for EVERY entry change across ALL shows
- Each irrelevant notification triggered a sync query (wasted network/processing)
- At scale (100+ concurrent shows), this would generate thousands of irrelevant events

**After:**
- Direct `license_key` column allows efficient subscription filtering
- Only receive events for entries in your show
- Scalable to thousands of concurrent shows
- Clean, maintainable solution

## Files Changed

### 1. Database Migration (NEW)
- **File:** `supabase/migrations/20250123_add_license_key_to_entries.sql`
- **Changes:**
  - Adds `license_key` column to `entries` table
  - Backfills existing data
  - Creates trigger to auto-populate on INSERT/UPDATE
  - Adds index for query performance

### 2. ReplicationManager.ts (UPDATED)
- **File:** `src/services/replication/ReplicationManager.ts`
- **Lines:** 867-880
- **Changes:**
  - Removed conditional filter logic for tables without `license_key`
  - Now applies direct filter to all tables: `filter: 'license_key=eq.${licenseKey}'`

### 3. ReplicatedEntriesTable.ts (UPDATED)
- **File:** `src/services/replication/tables/ReplicatedEntriesTable.ts`
- **Line:** 48
- **Changes:**
  - Made `license_key` non-optional (was `license_key?: string`)
  - Updated comment to reflect auto-population by database trigger

## How to Run the Migration

### Step 1: Open Supabase SQL Editor

1. Go to https://supabase.com/dashboard
2. Select your project: `ylvcsxxggwodpqvjdqvb`
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run the Migration

1. Copy the entire contents of `supabase/migrations/20250123_add_license_key_to_entries.sql`
2. Paste into the SQL editor
3. Click **Run** (or press Ctrl+Enter)
4. Wait for confirmation: "Success. No rows returned"

### Step 3: Verify the Migration

Run this verification query in the SQL editor:

```sql
-- Check that all entries have license_key populated
SELECT
  COUNT(*) as total_entries,
  COUNT(license_key) as entries_with_key,
  COUNT(*) - COUNT(license_key) as missing_keys
FROM entries;
```

**Expected result:** `missing_keys` should be `0` (all entries have license_key)

### Step 4: Test a Sample Entry

```sql
-- Check a few entries to see the license_key value
SELECT id, armband_number, handler_name, license_key
FROM entries
LIMIT 5;
```

**Expected result:** Each entry should have a `license_key` value like `'aa260'`

### Step 5: Test the Trigger

Create a test entry to verify the trigger auto-populates license_key:

```sql
-- Get a valid class_id to test with
SELECT id, element, level FROM classes LIMIT 1;

-- Insert test entry (replace 123 with actual class_id from above)
INSERT INTO entries (class_id, armband_number, handler_name, dog_call_name, entry_status, is_scored, is_in_ring)
VALUES (123, 9999, 'Test Handler', 'Test Dog', 'no-status', false, false)
RETURNING id, license_key;

-- Clean up test entry (replace 456 with the id returned above)
DELETE FROM entries WHERE id = 456;
```

**Expected result:** The INSERT should return the entry with `license_key` auto-populated

## Rollback (If Needed)

If you need to roll back this migration:

```sql
-- Remove trigger
DROP TRIGGER IF EXISTS entry_license_key_trigger ON entries;

-- Remove function
DROP FUNCTION IF EXISTS set_entry_license_key();

-- Remove index
DROP INDEX IF EXISTS idx_entries_license_key;

-- Remove column
ALTER TABLE entries DROP COLUMN IF EXISTS license_key;
```

Then revert the code changes:
- Restore `ReplicationManager.ts` to use conditional filtering
- Restore `ReplicatedEntriesTable.ts` to make `license_key` optional

## Testing Real-Time Updates

After running the migration:

1. **Admin Window (incognito):** Open scoresheet for any dog
2. **Exhibitor Window (regular browser):** Watch entry list
3. **Expected:** Dog immediately shows blue "In Ring" border
4. **Admin Window:** Close scoresheet
5. **Expected:** Dog immediately returns to normal status

## Performance Benefits

### Before Migration
- Subscription: `SELECT * FROM entries` (all entries, all shows)
- Events per hour (100 shows, 10 entries/show, 1 update/min): ~60,000 events
- Relevant events: ~600 (1% useful, 99% noise)

### After Migration
- Subscription: `SELECT * FROM entries WHERE license_key='aa260'`
- Events per hour: ~600 (only your show)
- Relevant events: ~600 (100% useful)

**Result:** 100x reduction in irrelevant events

## Architecture Notes

This is **denormalization** - we're duplicating data from `shows.license_key` into `entries.license_key` for performance. The trade-off:

**Pros:**
- ✅ Efficient real-time filtering
- ✅ Scales to thousands of shows
- ✅ Standard pattern for Postgres real-time
- ✅ Automatic maintenance via trigger

**Cons:**
- ❌ Data redundancy (acceptable for performance)
- ❌ Slight overhead on INSERT/UPDATE (negligible)

## Questions?

If you encounter any issues:
1. Check the Supabase logs for trigger errors
2. Verify the trigger function exists: `\df set_entry_license_key` in psql
3. Check if existing entries were backfilled correctly (see verification query above)
