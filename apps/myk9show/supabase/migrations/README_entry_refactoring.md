# Entry Table Refactoring Migration Guide

This document explains the entry table refactoring migration that implements the e-commerce pattern for dog show entries in the myK9Show application.

## Overview

The migration splits the monolithic `entry` table into two tables following e-commerce best practices:
- **`entry`** table: Order-level data (payment, customer, submission info)
- **`class_entry`** table: OrderItem-level data (specific class details, pricing)

## Migration Files

### 1. `20250731120000_entry_table_refactoring.sql`
**Primary migration that creates the new structure:**
- Creates the new `class_entry` table
- Adds `entry_status` and `total_fees` columns to existing `entry` table
- Sets up automatic fee calculation triggers
- Implements RLS policies for security
- Creates helper functions and views for backward compatibility
- Provides data migration and validation functions

### 2. `20250731120001_entry_table_cleanup.sql`
**Cleanup migration to remove legacy columns:**
- Removes legacy columns from `entry` table after application updates
- Creates backup of legacy data
- Updates constraints and indexes
- Provides safety checks and validation

## Migration Process

### Phase 1: Apply the Primary Migration

1. **Apply the migration:**
   ```sql
   -- This is done automatically when the migration runs
   ```

2. **Run the data migration:**
   ```sql
   SELECT migrate_entry_data_to_class_entry();
   ```

3. **Validate the migration:**
   ```sql
   SELECT * FROM validate_entry_migration();
   ```

4. **Test the new structure:**
   ```sql
   -- View combined data
   SELECT * FROM entry_with_class_details LIMIT 5;
   
   -- Test automatic fee calculation
   UPDATE class_entry SET entry_fee = 25.00 WHERE id = 'some-uuid';
   -- Check that entry.total_fees was updated automatically
   ```

### Phase 2: Update Application Code

Update your application to use the new table structure:

#### Before (Single Table):
```typescript
// Old structure - single entry table
const entry = {
  id: 'uuid',
  dog_id: 'uuid',
  class_id: 'uuid',
  armband: '123',
  entry_fee: 25.00,
  status: 'confirmed'
}
```

#### After (Split Tables):
```typescript
// New structure - entry + class_entry
const entry = {
  id: 'uuid',
  dog_id: 'uuid',
  entry_status: 'submitted',
  total_fees: 50.00,
  payment_status: 'pending'
}

const classEntries = [
  {
    id: 'uuid',
    entry_id: 'uuid',
    class_id: 'uuid',
    trial_id: 'uuid',
    armband: '123',
    entry_fee: 25.00,
    status: 'accepted'
  },
  {
    id: 'uuid',
    entry_id: 'uuid', 
    class_id: 'uuid-2',
    trial_id: 'uuid',
    armband: '124',
    entry_fee: 25.00,
    status: 'accepted'
  }
]
```

#### Database Queries:
```sql
-- Old way - single table
SELECT * FROM entry WHERE dog_id = $1;

-- New way - join tables
SELECT e.*, ce.* 
FROM entry e
LEFT JOIN class_entry ce ON e.id = ce.entry_id
WHERE e.dog_id = $1;

-- Or use the compatibility view during transition
SELECT * FROM entry_with_class_details WHERE dog_id = $1;
```

### Phase 3: Apply Cleanup Migration (Optional)

After all application code has been updated and thoroughly tested:

1. **Check if cleanup is safe:**
   ```sql
   SELECT * FROM check_cleanup_safety();
   ```

2. **Apply cleanup migration:**
   ```sql
   -- Apply 20250731120001_entry_table_cleanup.sql
   ```

3. **Validate cleanup:**
   ```sql
   SELECT * FROM validate_entry_cleanup();
   ```

## Key Benefits

### 1. **Proper Normalization**
- Eliminates data redundancy
- Clear separation of concerns
- Consistent relationship patterns

### 2. **Multi-Class Support**
- Easy to support multiple classes per entry
- Individual class status tracking
- Flexible fee structures per class

### 3. **Automatic Fee Calculation**
- `total_fees` automatically calculated via triggers
- Handles fee changes, additions, and removals
- Always accurate totals

### 4. **Enhanced Security**
- Comprehensive RLS policies
- Proper access control for both tables
- Audit trail for all changes

### 5. **Performance Improvements**
- Smaller, focused tables
- Better indexing strategies
- Optimized queries for specific use cases

## Database Schema Changes

### New `class_entry` Table
```sql
CREATE TABLE class_entry (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES entry(id),
  class_id UUID NOT NULL REFERENCES class(id), 
  trial_id UUID NOT NULL REFERENCES trial(id),
  armband VARCHAR(10),
  run_order INTEGER,
  jump_height VARCHAR(20),
  entry_fee DECIMAL(10,2),
  preferred_judge TEXT,
  status TEXT DEFAULT 'pending',
  -- Standard audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);
```

### Updated `entry` Table
```sql
-- Added columns:
ALTER TABLE entry ADD COLUMN entry_status TEXT DEFAULT 'draft';
ALTER TABLE entry ADD COLUMN total_fees DECIMAL(10,2) DEFAULT 0.00;

-- Removed columns (in cleanup migration):
-- class_id, armband, run_order, jump_height, entry_fee, preferred_judge
```

## Status Values

### Entry Status (`entry.entry_status`)
- `draft` - Entry being prepared
- `submitted` - Entry submitted to show
- `accepted` - Entry accepted by show
- `rejected` - Entry rejected by show
- `withdrawn` - Entry withdrawn by owner

### Class Entry Status (`class_entry.status`)
- `pending` - Awaiting acceptance
- `accepted` - Accepted into class
- `rejected` - Rejected from class
- `waitlisted` - On waitlist for class
- `withdrawn` - Withdrawn from class
- `competing` - Currently competing

## Backward Compatibility

The migration provides backward compatibility through:

### 1. **View: `entry_with_class_details`**
Combines data from both tables to maintain existing query patterns during transition.

### 2. **Automatic Fee Calculation**
The `total_fees` field is automatically maintained, so existing code expecting a total will continue to work.

### 3. **Legacy Data Preservation**
The cleanup migration creates `entry_legacy_backup` table to preserve original data.

## Rollback Strategy

### Before Cleanup Migration
1. Drop the `class_entry` table
2. Remove added columns from `entry` table
3. Restore from backup if needed

### After Cleanup Migration
1. Restore from `entry_legacy_backup` table
2. Re-add removed columns to `entry` table
3. Migrate data back from `class_entry` table

## Testing Strategy

### 1. **Data Integrity Tests**
```sql
-- Verify all entries have corresponding class entries
SELECT COUNT(*) FROM entry e
WHERE NOT EXISTS (
  SELECT 1 FROM class_entry ce WHERE ce.entry_id = e.id
);

-- Verify fee calculations are correct
SELECT * FROM entry e
WHERE e.total_fees != (
  SELECT COALESCE(SUM(ce.entry_fee), 0)
  FROM class_entry ce
  WHERE ce.entry_id = e.id AND ce.deleted_at IS NULL
);
```

### 2. **Performance Tests**
```sql
-- Test query performance
EXPLAIN ANALYZE SELECT * FROM entry_with_class_details WHERE dog_id = $1;

-- Compare with direct joins
EXPLAIN ANALYZE 
SELECT e.*, ce.*
FROM entry e
JOIN class_entry ce ON e.id = ce.entry_id
WHERE e.dog_id = $1;
```

### 3. **Application Tests**
- Test all entry creation workflows
- Test multi-class entries
- Test fee calculations
- Test status transitions
- Test reporting queries

## Monitoring

After migration, monitor:
- Query performance on new structure
- Fee calculation accuracy
- RLS policy effectiveness
- Application error rates
- User experience impact

## Support

For issues with the migration:
1. Check validation function results
2. Review migration logs
3. Test with sample data
4. Verify RLS policies
5. Check trigger functionality

## References

- [Entry Refactoring Analysis](../../docs/database/entry-refactoring-analysis.md)
- [Optimal Schema Design](../../docs/database/optimal-schema-design.md)
- [Migration Plan](../../docs/database/migration-plan.md)