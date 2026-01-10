# Deprecated Utilities

These utilities were moved here during code cleanup. They are development/migration scripts that are no longer actively used but kept for reference.

## Files

| File | Purpose | Status |
|------|---------|--------|
| `dev-cache-bypass.ts` | Development cache bypass for testing | Unused |
| `dev-data-recovery.ts` | Development data recovery tools | Unused |
| `fix-club-arrays.ts` | One-time migration script for club data | Completed |
| `recreate-tulsa-club.ts` | One-time script to recreate test data | Completed |
| `resetMockData.ts` | Reset mock data for development | Unused |
| `storage-reset.ts` | Storage reset utilities | Unused |
| `migrateAuthTodos.ts` | Auth migration script | Completed |
| `storage-benchmarking.ts` | Storage performance benchmarking | Development only |

## When to Delete

These files can be safely deleted after confirming:
1. No active migrations depend on them
2. Development workflows don't need them
3. Test data recreation is not needed

## If You Need These

If you need to use any of these utilities, move them back to `src/utils/` and update any imports.
