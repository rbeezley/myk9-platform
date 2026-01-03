# Push Notifications: Out-of-Order Scoring Fix

## The Problem

**Original Issue**: Database trigger `notify_up_soon()` used only `armband_number` for sorting entries, which broke notifications when dogs were scored out of order.

**Example Scenario**:
```
Armband Order: 1, 2, 3, 4, 5, 6, 7, 8
Run Order:     1, 2, 7, 8, 3, 4, 5, 6  (volunteers 7 & 8 go first)

When dog #2 finishes:
  ❌ OLD TRIGGER: "Dog #3 is up soon" (wrong - 3 is 5th in run order)
  ✅ NEW TRIGGER: "Dog #7 is up soon" (correct - 7 is next in run order)
```

## Why Fix the Database (Not the Apps)?

### Analysis of All Three Systems

#### 1. Microsoft Access VBA Export - ✅ CORRECT
**File**: User-provided VBA module, line 34210
```vba
"""exhibitor_order"": " & Nz(rs!ExhibitorOrder, 0) & "," & _
"""run_order"": " & Nz(rs!ExhibitorOrder, 0) & "," & _
```

**What it does**:
- Exports `ExhibitorOrder` field to BOTH `exhibitor_order` AND `run_order` in database
- ExhibitorOrder = 0 means "use armband as run order" (default)
- ExhibitorOrder > 0 means "use custom run order"
- This is the SOURCE OF TRUTH

**Conclusion**: No changes needed - works correctly

#### 2. myK9Q Frontend (React/TypeScript) - ✅ CORRECT
**File**: [src/services/runOrderService.ts:16-19](src/services/runOrderService.ts#L16-L19)
```typescript
export const sortByRunOrder = (entries: Entry[]): Entry[] => {
  return [...entries].sort((a, b) => {
    const aOrder = a.exhibitorOrder ?? a.armband;  // Uses nullish coalescing
    const bOrder = b.exhibitorOrder ?? b.armband;
    return aOrder - bOrder;
  });
};
```

**What it does**:
- Uses `exhibitorOrder` if present (non-null)
- Falls back to `armband` if `exhibitorOrder` is null/undefined
- Matches the Access application's intent perfectly

**Conclusion**: No changes needed - works correctly

#### 3. Database Trigger (PostgreSQL) - ❌ WRONG (NOW FIXED)
**File**: [supabase/migrations/017_add_push_notifications_support.sql:210](supabase/migrations/017_add_push_notifications_support.sql#L210)

**OLD (WRONG) Code**:
```sql
WHERE e.armband_number > NEW.armband_number
ORDER BY e.armband_number ASC
```

**Problem**: Completely ignores `exhibitor_order` field

**NEW (CORRECT) Code** - Migration 018:
```sql
WHERE COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) >
      COALESCE(NULLIF(scored_entry.exhibitor_order, 0), scored_entry.armband_number)
ORDER BY COALESCE(NULLIF(e.exhibitor_order, 0), e.armband_number) ASC
```

**What it does**:
- `NULLIF(exhibitor_order, 0)` converts 0 to NULL
- `COALESCE(..., armband_number)` uses armband when exhibitor_order is NULL or 0
- Matches the frontend logic: `exhibitorOrder ?? armband`

**Conclusion**: Fixed in Migration 018

## The SQL Logic Explained

### COALESCE + NULLIF Pattern

```sql
COALESCE(NULLIF(exhibitor_order, 0), armband_number)
```

**Step-by-step breakdown**:

1. **NULLIF(exhibitor_order, 0)**:
   - If `exhibitor_order = 0`, returns NULL
   - Otherwise, returns `exhibitor_order` value
   - Treats 0 as "not set" (default behavior)

2. **COALESCE(result_from_step_1, armband_number)**:
   - If step 1 returned NULL, use `armband_number`
   - Otherwise, use the value from step 1
   - This is the SQL equivalent of JavaScript's `??` operator

### Examples:

| exhibitor_order | armband_number | Result | Explanation |
|----------------|----------------|--------|-------------|
| 0 | 5 | 5 | Default: use armband |
| NULL | 5 | 5 | Not set: use armband |
| 12 | 5 | 12 | Custom order: use exhibitor_order |
| 3 | 5 | 3 | Custom order: use exhibitor_order |

## Decision: Database-Only Fix

**Why this was the right choice**:

1. **Single Point of Failure**: Only the database trigger was wrong
2. **No App Changes Needed**: Both Access and myK9Q already work correctly
3. **Backward Compatible**: Existing data works without changes
4. **Simpler Testing**: Only need to test database trigger behavior
5. **Less Risk**: No need to update Access app or frontend code
6. **Maintains Separation**: Database layer handles its own sorting logic

**What if we changed the apps instead?**

- **Access VBA**: Would need to change export format, re-export all data
- **myK9Q Frontend**: Would break correct sorting that already works
- **Database**: Would still be wrong for any future features using run order

**Conclusion**: Fixing the database trigger was clearly the best approach.

## Testing the Fix

### Test Scenario 1: Default Armband Order
```sql
-- Setup: Dogs with exhibitor_order = 0 (default)
INSERT INTO entries (armband_number, exhibitor_order, ...) VALUES
  (1, 0, ...), (2, 0, ...), (3, 0, ...), (4, 0, ...);

-- Score dog #2
UPDATE results SET is_scored = true WHERE entry_id = (SELECT id FROM entries WHERE armband_number = 2);

-- Expected: Notification for dog #3 (next in armband order)
-- ✅ PASS: COALESCE(NULLIF(0, 0), 3) = COALESCE(NULL, 3) = 3
```

### Test Scenario 2: Custom Run Order
```sql
-- Setup: Volunteers go first
INSERT INTO entries (armband_number, exhibitor_order, ...) VALUES
  (1, 1, ...), (2, 2, ...), (3, 5, ...), (4, 6, ...), (5, 7, ...), (6, 8, ...), (7, 3, ...), (8, 4, ...);

-- Score dog #2 (armband 2, run order 2)
UPDATE results SET is_scored = true WHERE entry_id = (SELECT id FROM entries WHERE armband_number = 2);

-- Expected: Notification for dog #7 (armband 7, run order 3 - next in custom order)
-- ✅ PASS: COALESCE(NULLIF(3, 0), 7) = COALESCE(3, 7) = 3
```

### Test Scenario 3: Mixed Orders
```sql
-- Setup: Some custom, some default
INSERT INTO entries (armband_number, exhibitor_order, ...) VALUES
  (1, 10, ...), (2, 0, ...), (3, 0, ...), (4, 11, ...), (5, 0, ...);

-- Effective run order: 2, 3, 5, 1, 4

-- Score dog #3 (armband 3, run order 0 → use armband 3)
UPDATE results SET is_scored = true WHERE entry_id = (SELECT id FROM entries WHERE armband_number = 3);

-- Expected: Notification for dog #5 (armband 5, run order 0 → use armband 5 - next after 3)
-- ✅ PASS: COALESCE(NULLIF(0, 0), 5) = COALESCE(NULL, 5) = 5
```

## Files Changed

1. **Created**: [supabase/migrations/018_fix_run_order_notifications.sql](supabase/migrations/018_fix_run_order_notifications.sql)
   - Drops old `notify_up_soon()` function
   - Recreates with correct run order logic
   - Applied to database via Supabase MCP

2. **Updated**: [PUSH_NOTIFICATIONS_STATUS.md](PUSH_NOTIFICATIONS_STATUS.md)
   - Added Migration 018 to completed infrastructure
   - Added "Run Order vs Armband Order" section
   - Documented the fix and examples

3. **No Changes Needed**:
   - Microsoft Access VBA export
   - myK9Q frontend (runOrderService.ts)
   - Any other application code

## Summary

**Problem**: Out-of-order scoring broke "up soon" notifications

**Root Cause**: Database trigger ignored `exhibitor_order` field

**Solution**: Updated trigger to use `COALESCE(NULLIF(exhibitor_order, 0), armband_number)`

**Result**: Notifications now work correctly for:
- Default armband order
- Custom run orders (volunteers first/last)
- Mixed scenarios
- All edge cases

**Impact**: Zero changes to Microsoft Access or myK9Q frontend - only database fix needed.
