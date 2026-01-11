# @myk9/ Package Adoption Status

## Current Usage

**28 imports across 22 files**

### By Package

| Package | Files | Usage |
|---------|-------|-------|
| `@myk9/replication` | 8 | ReplicatedTable, SyncResult, type definitions |
| `@myk9/core` | 6 | logger |
| `@myk9/scoring-ui` | 8 | useStopwatch, useEntryListFilters, useDragAndDropEntries, BaseEntry |
| `@myk9/ui` | 4 | Button, Card, Badge, ClassCard |

### Files Using Packages

- **Replication tables:** All 6 replicated table classes
- **Scoring pages:** Entry list, scoresheet pages (AKC, UKC, ASCA)
- **UI components:** Re-exports in components/ui/

## Migration Opportunities

### High Priority
1. **Local `utils/logger.ts`** → Use `@myk9/core` logger
   - 7 files currently import local logger
   - Package logger has same API

### Medium Priority
2. **Type definitions** - Could move shared types to `@myk9/core/types`
3. **UI components** - More components could come from `@myk9/ui`

### Low Priority
4. **Utility functions** - Some could move to `@myk9/core`

## Package Contents Reference

### @myk9/core
- `logger` - Logging utility with debug mode
- Type definitions

### @myk9/replication
- `ReplicatedTable` - Base class for offline-first tables
- `SyncResult` - Sync operation result type
- `ReplicationManager` - Orchestrates sync
- Type definitions for replicated entities

### @myk9/scoring-ui
- `useStopwatch` - Timer hook with max time and warnings
- `useEntryListFilters` - Filtering/sorting for entry lists
- `useDragAndDropEntries` - Drag-and-drop reordering
- `BaseEntry` - Base entry type

### @myk9/ui
- `Button`, `buttonVariants` - Button component
- `Card`, `CardHeader`, etc. - Card components
- `Badge`, `badgeVariants` - Badge component
- `ClassCard` - Class display card

## Recommendations

1. **Use package logger** - Replace local `utils/logger.ts` imports
2. **Expand UI usage** - Use `@myk9/ui` for more shared components
3. **Keep domain-specific local** - Scoring logic specific to myk9show can stay local
4. **Monitor for duplication** - When adding new utilities, check packages first
