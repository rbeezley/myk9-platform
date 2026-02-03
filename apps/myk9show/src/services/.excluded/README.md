# .excluded Directory

**Status:** Archived / Excluded Code
**Last Reviewed:** 2026-02-03

## Purpose

This directory contains code that was excluded during the migration to the @myk9/replication package. The code represents alternative or legacy implementations that may have been replaced by simpler patterns.

## Contents

### Conflict Resolution (conflict/)
- **ConflictResolver.ts** (25K lines) - Complex conflict resolution with business rules
- **ConflictManager.ts** (17K lines) - Conflict detection and management
- **ConflictDetector.ts** (13K lines) - Conflict detection logic

**Status:** The package @myk9/replication now provides simpler conflict resolution (LWW, field-level, authoritative strategies). This implementation adds business rules, priorities, and entity-specific configurations.

**Decision Needed:**
- Option 1: Delete if package version is sufficient
- Option 2: Extract useful patterns (business rules) and contribute to package
- Option 3: Keep as reference for future enhanced conflict resolution needs

### Sync Services
- **FieldLevelSyncService.ts** (24K lines) - Field-level sync implementation
- **SyncConflictResolver.ts** (14K lines) - Alternative sync conflict resolver
- **SyncQueue.ts** (7K lines) - Sync queue management
- **types.ts** (4K lines) - Type definitions

**Status:** Sync functionality now handled by @myk9/replication package with different architecture.

**Decision Needed:**
- Evaluate if any unique functionality needs preservation
- Otherwise, delete to reduce codebase complexity

## Recommendation

**Priority:** Medium (DEBT-030)
**Action:** Audit each file's unique functionality:

1. Compare conflict resolution approaches
   - Package version: Simple, proven patterns
   - Excluded version: Complex business rules

2. If business rules needed in future:
   - Extract patterns to separate document
   - Consider contributing to @myk9/replication as plugins

3. If not needed:
   - **Delete entire .excluded directory**
   - Reduces codebase by ~60K lines

## Decision Log

**2026-02-03:** Initial audit completed
- Identified as old/alternative implementation
- No current imports or references found
- Safe to delete pending final review

**Next Steps:**
1. Review with team for any needed patterns
2. Document any unique approaches worth preserving
3. Delete directory or extract valuable patterns
