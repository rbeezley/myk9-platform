# Plan: Migrate myK9Q to @myk9/replication Package

**Objective:** Eliminate 11,653 lines of duplicate replication infrastructure by migrating myK9Q to use the shared `@myk9/replication` package.

**Effort:** 2-3 days
**Risk:** Medium (core data sync functionality)
**Value:** High - single source of truth for offline-first replication

---

> **CRITICAL WARNING**
>
> **DO NOT TOUCH production myK9Q at `D:\AI-Projects\myK9Qv3`**
>
> This plan applies ONLY to the myK9Q in the monorepo (`d:\AI-Projects\myk9-platform\apps\myk9q`).
> The production app is a separate codebase and must remain untouched.

---

## Architectural Decision Record

### Why Package Approach is Best Long-Term

Based on analysis comparing myK9Q's local implementation vs @myk9/replication package:

| Factor | myK9Q Local | Package | Winner |
|--------|-------------|---------|--------|
| Coupling | Tightly coupled to app | Decoupled via DI | Package |
| Testability | Hard (real deps) | Easy (mock injection) | Package |
| Bug Fixes | Apply twice | Fix once | Package |
| Type Safety | App-specific types | Generic types | Package |
| Feature Parity | Production-proven | Enhanced (corruption handling) | Package |

**Decision:** The package approach provides better long-term maintainability. Both implementations share the same core patterns (extracted from myK9Q originally), but the package has cleaner architecture and dependency injection.

---

## Pre-Migration: Behavior Validation

**Before any migration, validate package behavior matches myK9Q:**

### Step 0.1: Compare Core APIs
```bash
# Compare ReplicatedTable method signatures
diff <(grep -E "^\s+(async\s+)?\w+\(" apps/myk9q/src/services/replication/ReplicatedTable.ts) \
     <(grep -E "^\s+(async\s+)?\w+\(" packages/replication/src/core/ReplicatedTable.ts)
```

### Step 0.2: Compare Type Definitions
```bash
# Compare key types
diff apps/myk9q/src/services/replication/types.ts packages/replication/src/types.ts
```

### Step 0.3: Identify myK9Q-Specific Behavior

Check for behavior in myK9Q that may not exist in package:

| Feature | myK9Q | Package | Action Needed |
|---------|-------|---------|---------------|
| Row locks (livelock prevention) | ✅ | ✅ | None |
| Batch operations | ✅ | ✅ | None |
| Cache TTL | ✅ | ✅ | Inject via deps |
| Diagnostics logging | ✅ | ✅ | Inject via deps |
| Feature flag TTL | ✅ | Via DI | Create wrapper |
| `ReplicatedTableName` type | ✅ | Uses `string` | Type alias |

### Step 0.4: Validate with Single Table First
Migrate ONE low-risk table, deploy to staging, verify:
- [ ] Sync behavior identical
- [ ] Offline storage identical
- [ ] Conflict resolution identical
- [ ] Performance comparable

---

## Type Compatibility Resolution

### Issue: `ReplicatedTableName` vs `string`

**myK9Q uses:**
```typescript
// apps/myk9q/src/config/featureFlags.ts
export type ReplicatedTableName = 'classes' | 'entries' | 'trials' | ...;
export function getTableTTL(tableName: ReplicatedTableName): number;
```

**Package uses:**
```typescript
// packages/replication/src/dependencies.ts
export type GetTableTTL = (tableName: string) => number;
```

**Solution:** Create type-safe wrapper in `myk9qDependencies.ts`:

```typescript
import type { ReplicatedTableName } from '@/config/featureFlags';
import { getTableTTL as getTableTTLImpl } from '@/config/featureFlags';
import type { GetTableTTL } from '@myk9/replication';

// Type-safe wrapper that satisfies package interface
export const getTableTTL: GetTableTTL = (tableName: string) => {
  return getTableTTLImpl(tableName as ReplicatedTableName);
};
```

### Issue: SyncOptions Location

**myK9Q imports from:**
```typescript
import type { SyncOptions } from './SyncEngine';
```

**Package exports from:**
```typescript
import type { SyncOptions } from '@myk9/replication';
```

**Solution:** Verify `SyncOptions` is exported from package index. If not, add export.

---

## Overview

### Current State
- myK9Q has full replication infrastructure in `apps/myk9q/src/services/replication/` (11,653 lines)
- @myk9/replication package exists with enhanced, decoupled implementation
- myK9Show already uses @myk9/replication successfully

### Target State
- myK9Q imports core infrastructure from `@myk9/replication`
- Table implementations remain in myK9Q (app-specific schemas)
- Both apps share identical replication engine

---

## Files to Modify

### Phase 1: Core Infrastructure (DELETE)
Delete these files that duplicate @myk9/replication:

```
apps/myk9q/src/services/replication/
├── ReplicatedTable.ts           # DELETE - use @myk9/replication
├── ReplicatedTableBatch.ts      # DELETE - use @myk9/replication
├── ReplicatedTableCache.ts      # DELETE - use @myk9/replication
├── DatabaseManager.ts           # DELETE - use @myk9/replication
├── SyncEngine.ts                # DELETE - use @myk9/replication
├── dependencies.ts              # DELETE - use @myk9/replication
├── replicationConstants.ts      # DELETE - use @myk9/replication
├── types.ts                     # DELETE - use @myk9/replication
└── index.ts                     # MODIFY - re-export from package
```

### Phase 2: Table Implementations (MODIFY)
Update imports in all table files:

```
apps/myk9q/src/services/replication/tables/
├── ReplicatedAnnouncementReadsTable.ts
├── ReplicatedAnnouncementsTable.ts
├── ReplicatedAuditLogViewTable.ts
├── ReplicatedClassesTable.ts
├── ReplicatedClassRequirementsTable.ts
├── ReplicatedClassVisibilityOverridesTable.ts
├── ReplicatedEntriesTable.ts
├── ReplicatedResultsTable.ts
├── ReplicatedShowsTable.ts
├── ReplicatedTrialsTable.ts
└── ... (all table files)
```

**Change pattern:**
```typescript
// BEFORE
import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';

// AFTER
import { ReplicatedTable, type SyncResult } from '@myk9/replication';
```

### Phase 3: Dependency Injection (ADD)
Create dependency provider for myK9Q-specific implementations:

```
apps/myk9q/src/services/replication/
└── myk9qDependencies.ts         # NEW - provide app-specific deps
```

---

## Step-by-Step Implementation

### Step 1: Add @myk9/replication as dependency
```bash
# In apps/myk9q/package.json
pnpm add @myk9/replication --filter @myk9/q
```

### Step 2: Create myK9Q dependency provider
Create `apps/myk9q/src/services/replication/myk9qDependencies.ts`:

```typescript
import { logger } from '@/utils/logger';
import { getTableTTL as getTableTTLImpl } from '@/config/featureFlags';
import { logDiagnosticReport } from '@/utils/indexedDBDiagnostics';
import type { ReplicatedTableDependencies, GetTableTTL } from '@myk9/replication';
import type { ReplicatedTableName } from '@/config/featureFlags';

// Type-safe wrapper for feature flag TTL
const getTableTTL: GetTableTTL = (tableName: string) => {
  return getTableTTLImpl(tableName as ReplicatedTableName);
};

export const myk9qReplicationDependencies: ReplicatedTableDependencies = {
  logger,
  getTableTTL,
  logDiagnostics: logDiagnosticReport,
};
```

### Step 3: Update table implementations (one at a time)
For each table in `tables/`:

1. Change imports from local to package
2. Inject myK9Q dependencies in constructor
3. Test table works correctly
4. Commit changes

**Example transformation:**
```typescript
// BEFORE
import { ReplicatedTable } from '../ReplicatedTable';
import type { SyncResult } from '../types';
import { logger as defaultLogger } from '@/utils/logger';

export class ReplicatedClassesTable extends ReplicatedTable<Class> {
  constructor() {
    super('classes');
  }
}

// AFTER
import { ReplicatedTable, type SyncResult } from '@myk9/replication';
import { myk9qReplicationDependencies } from '../myk9qDependencies';

export class ReplicatedClassesTable extends ReplicatedTable<Class> {
  constructor() {
    super('classes', undefined, myk9qReplicationDependencies);
  }
}
```

### Step 4: Update main index.ts exports
```typescript
// apps/myk9q/src/services/replication/index.ts

// Re-export core from package
export {
  ReplicatedTable,
  databaseManager,
  REPLICATION_STORES,
  type SyncResult,
  type SyncMetadata,
  type SyncOptions,
  type PendingMutation,
  type CacheStats,
  // ... other needed exports
} from '@myk9/replication';

// Export myK9Q-specific tables
export * from './tables/ReplicatedClassesTable';
export * from './tables/ReplicatedEntriesTable';
// ... all tables
```

### Step 5: Delete duplicate core files
After all tables migrated and tested:

```bash
# Delete infrastructure files
rm apps/myk9q/src/services/replication/ReplicatedTable.ts
rm apps/myk9q/src/services/replication/ReplicatedTableBatch.ts
rm apps/myk9q/src/services/replication/ReplicatedTableCache.ts
rm apps/myk9q/src/services/replication/DatabaseManager.ts
rm apps/myk9q/src/services/replication/SyncEngine.ts
rm apps/myk9q/src/services/replication/dependencies.ts
rm apps/myk9q/src/services/replication/replicationConstants.ts
rm apps/myk9q/src/services/replication/types.ts
```

### Step 6: Update any remaining imports across myK9Q
Search and replace any imports that referenced deleted files:

```bash
# Find files importing from old paths
grep -r "from ['\"].*services/replication/ReplicatedTable" apps/myk9q/src
grep -r "from ['\"].*services/replication/types" apps/myk9q/src
grep -r "from ['\"].*services/replication/SyncEngine" apps/myk9q/src
```

---

## Migration Order (Recommended)

Migrate tables in this order (least to most critical):

1. **Low Risk (test migration process):**
   - ReplicatedAnnouncementReadsTable
   - ReplicatedAnnouncementsTable
   - ReplicatedAuditLogViewTable

2. **Medium Risk:**
   - ReplicatedClassRequirementsTable
   - ReplicatedClassVisibilityOverridesTable
   - ReplicatedShowsTable
   - ReplicatedTrialsTable

3. **High Risk (most used):**
   - ReplicatedClassesTable
   - ReplicatedEntriesTable
   - ReplicatedResultsTable

---

## Verification Strategy

### After Each Table Migration:
1. Run TypeScript compilation: `pnpm typecheck --filter @myk9/q`
2. Run unit tests: `cd apps/myk9q && pnpm test`
3. Verify no import errors

### After Complete Migration:
1. Full build: `pnpm build`
2. Full test suite: `pnpm test --filter @myk9/q`
3. E2E tests: `cd apps/myk9q && pnpm test:e2e`

### Detailed Offline Testing Protocol

**Test Environment Setup:**
1. Start app: `pnpm dev:q`
2. Open DevTools > Network tab
3. Open DevTools > Application > IndexedDB

**Online → Offline Transition:**
- [ ] Load app with network enabled
- [ ] Verify data syncs (check Network tab for Supabase calls)
- [ ] Set Network to "Offline" in DevTools
- [ ] Verify "offline" indicator appears (if app has one)
- [ ] Navigate between pages - data should load from IndexedDB
- [ ] Create a new entry - should save locally
- [ ] Edit an existing entry - should save locally
- [ ] Check IndexedDB for pending mutations

**Offline → Online Transition:**
- [ ] Set Network back to "Online"
- [ ] Verify sync starts automatically
- [ ] Check Network tab for Supabase POST/PATCH calls
- [ ] Verify local changes appear in Supabase dashboard
- [ ] Verify no data loss

**Conflict Resolution:**
- [ ] Create entry offline
- [ ] Create conflicting entry in Supabase directly
- [ ] Go online
- [ ] Verify conflict resolved (check console logs)

### Smoke Tests:
- [ ] App loads without errors
- [ ] Data syncs from Supabase
- [ ] Offline mode works (disable network)
- [ ] Changes sync when back online
- [ ] No console errors related to replication
- [ ] IndexedDB structure unchanged (same store names)
- [ ] Cache TTL behavior unchanged

---

## Rollback Plan

If issues discovered after migration:

1. **Immediate:** Revert commit(s) with `git revert`
2. **Restore files:** Git checkout deleted files from previous commit
3. **Dependencies:** The package being added is additive, won't break anything

**Rollback command:**
```bash
git revert HEAD~N  # where N is number of commits to revert
```

---

## Potential Issues & Mitigations

### Issue 1: Type mismatches (ReplicatedTableName)
**Risk:** myK9Q uses strict `ReplicatedTableName` type, package uses `string`
**Mitigation:** Create type-safe wrapper function (see Type Compatibility section above)

### Issue 2: Missing exports from package
**Risk:** Package may not export everything myK9Q needs (e.g., SyncOptions)
**Mitigation:** Audit imports before migration, add missing exports to package

### Issue 3: Logger interface differences
**Risk:** myK9Q logger may not match package Logger interface
**Mitigation:** Verify interface compatibility; create adapter if needed

### Issue 4: Feature flag integration
**Risk:** Package doesn't know about myK9Q feature flags
**Mitigation:** Inject getTableTTL via dependencies (already supported)

### Issue 5: Different default behaviors
**Risk:** Package defaults (noopLogger) vs myK9Q defaults (real logger)
**Mitigation:** Always inject myK9Q dependencies, never rely on package defaults

---

## Success Criteria

- [ ] Pre-migration behavior validation complete
- [ ] All myK9Q table classes import from @myk9/replication
- [ ] No duplicate infrastructure files remain
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass
- [ ] E2E tests pass
- [ ] Detailed offline testing protocol passes
- [ ] ~11,600 lines of code removed
- [ ] No behavioral regressions

---

## Estimated Timeline

| Day | Task |
|-----|------|
| Day 1 (2h) | Pre-migration: Behavior validation, type audit |
| Day 1 (2h) | Setup: Add dependency, create myk9qDependencies |
| Day 1 (4h) | Migrate 3 low-risk tables, verify |
| Day 2 (4h) | Migrate remaining tables (5-7 tables) |
| Day 2 (4h) | Delete duplicate files, fix imports |
| Day 3 (4h) | Full testing: unit, E2E, offline protocol |
| Day 3 (2h) | Documentation, final review, commit |

**Total: ~22 hours over 3 days**

---

## Commits Strategy

1. `chore(q): Add @myk9/replication dependency`
2. `refactor(q): Create myK9Q replication dependencies provider`
3. `refactor(q): Migrate low-risk tables to @myk9/replication`
4. `refactor(q): Migrate remaining tables to @myk9/replication`
5. `chore(q): Remove duplicate replication infrastructure (-11,600 lines)`
6. `docs: Update replication documentation`

---

## Post-Migration Tasks

1. Update CLAUDE.md to document the unified approach
2. Update @myk9/replication README to reflect full usage
3. Consider moving table implementations to shared package (future)
4. Update TECHNICAL_DEBT.md to mark DEBT-003 as resolved
5. Update DEBT_ACTION_PLAN.md success metrics

---

## Appendix: Files to Audit Before Migration

Run these commands to understand the full scope:

```bash
# Count all files to delete
find apps/myk9q/src/services/replication -maxdepth 1 -name "*.ts" | wc -l

# Count all table files to modify
find apps/myk9q/src/services/replication/tables -name "*.ts" | wc -l

# Find all imports to update
grep -r "from ['\"].*services/replication" apps/myk9q/src --include="*.ts" | wc -l

# Verify package exports what we need
grep "^export" packages/replication/src/index.ts
```

---

**Created:** 2026-02-03
**Status:** Ready for review
**Author:** Claude Code (with user input)
