# Simple Scoring Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the scoring table hook to use a simple edit-buffer-over-raw-DB-rows pattern, eliminating all the timing bugs, init guards, and dual-source data merging.

**Architecture:** Raw DB rows are the source of truth. A `Map<entryId, edits>` stores only user changes. Display merges raw + edits. Submit writes edits to the replication layer, calculates placements, and adds IDs to a `justScoredIds` set for immediate tab updates. No `BulkEntryData` rebuild, no `useEffect` initialization, no version tracking.

**Tech Stack:** React (useState/useMemo/useCallback), Supabase replication layer, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-simple-scoring-table-design.md`

---

## File Structure

### Rewritten

| File                                                                        | Responsibility                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts` | Complete rewrite — edit buffer + submit + clear           |
| `apps/myk9show/src/components/classes/ClassResultsTable/types.ts`           | Simplified types — remove BulkEntryData, add ScoringEdits |

### Modified

| File                                                                           | Change                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`             | Update column renderers to use new hook API |
| `apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx` | Wire to new `onFieldChange` pattern         |
| `apps/myk9show/src/components/classes/ClassResultsTable/StatusBadge.tsx`       | Simplify to Scored/Pending from raw data    |

---

## Task 1: Rewrite types.ts and useClassResults.ts

This is a single task because the hook and types are tightly coupled — changing one without the other breaks compilation.

**Files:**

- Rewrite: `apps/myk9show/src/components/classes/ClassResultsTable/types.ts`
- Rewrite: `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts`

- [ ] **Step 1: Rewrite types.ts**

Replace the entire file contents:

```typescript
/**
 * Types for ClassResultsTable
 */
import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  QualificationStatus,
} from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

/** Props for the ClassResultsTable component */
export interface ClassResultsTableProps {
  entries: ScentWorkEntry[];
  rawEntries?: RawEntryRow[] | undefined;
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onAddEntry?: (() => void) | undefined;
  className?: string | undefined;
  classId?: string | undefined;
  onOpenRequirements?: (() => void) | undefined;
}

/** Per-entry edits stored in the edit buffer. Only contains fields the user changed. */
export interface ScoringEdit {
  qualification?: QualificationStatus | '';
  qualificationReason?: string;
  searchTime?: string; // MM:SS.HH format
  faults?: string;
  notes?: string;
}

/** A row for display — merges raw DB data with any pending edits. */
export interface ScoringRow {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  qualification: QualificationStatus | '';
  qualificationReason: string;
  searchTime: string;
  faults: string;
  notes: string;
  placement: number | null;
  isScored: boolean; // From DB or justScoredIds
  hasEdits: boolean; // Has unsaved changes
}
```

- [ ] **Step 2: Rewrite useClassResults.ts**

Replace the entire file contents:

```typescript
/**
 * useClassResults — Simple edit-buffer-over-raw-DB-rows hook.
 *
 * Raw DB rows are the source of truth. User edits go into a Map.
 * Display merges raw + edits. Submit writes to the replication layer.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import type {
  ScentWorkEntry,
  ScentWorkClassConfig,
  QualificationStatus,
} from '@/types/scent-work-types';
import type { UserPermissions } from '@/types/user-permissions';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from '@/utils/scoringMappings';
import type { ScoringEdit, ScoringRow } from './types';
import { STATUSES_REQUIRING_REASON, NAVIGABLE_FIELDS } from './constants';

interface UseClassResultsParams {
  entries: ScentWorkEntry[];
  rawEntries: RawEntryRow[];
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  classId: string;
}

export function useClassResults({
  entries,
  rawEntries,
  classConfig: _classConfig,
  userPermissions,
  classId: _classId,
}: UseClassResultsParams) {
  // ---- State ----
  const [edits, setEdits] = useState<Map<string, ScoringEdit>>(new Map());
  const [justScoredIds, setJustScoredIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---- Raw data lookup ----
  const rawMap = useMemo(() => new Map(rawEntries.map(r => [r.id, r])), [rawEntries]);

  // ---- Build display rows by merging raw + edits ----
  const rows: ScoringRow[] = useMemo(() => {
    return entries.map(entry => {
      const raw = rawMap.get(entry.id);
      const edit = edits.get(entry.id);

      const qualification =
        edit?.qualification ?? mapResultStatusToQualification(raw?.result_status);
      const searchTime = edit?.searchTime ?? dbSecondsToInputFormat(raw?.search_time_seconds);
      const faults = edit?.faults ?? String(raw?.total_faults ?? 0);
      const notes = edit?.notes ?? raw?.judge_notes ?? '';
      const qualificationReason = edit?.qualificationReason ?? raw?.disqualification_reason ?? '';

      const isScored =
        justScoredIds.has(entry.id) ||
        raw?.is_scored === true ||
        (!!raw?.result_status && raw.result_status !== 'pending');

      return {
        entryId: entry.id,
        armband: (raw?.armband as string) || entry.displayInfo?.armband || '',
        dogName:
          raw?.dog?.call_name || raw?.dog?.name || entry.displayInfo?.dogName || 'Unknown Dog',
        dogBreed: raw?.dog?.breed || entry.displayInfo?.dogBreed || '',
        handlerName: (raw?.handler as string) || entry.displayInfo?.handlerName || '',
        qualification,
        qualificationReason,
        searchTime,
        faults,
        notes,
        placement: raw?.final_placement ?? null,
        isScored,
        hasEdits: edits.has(entry.id),
      };
    });
  }, [entries, rawMap, edits, justScoredIds]);

  // ---- Edit a field ----
  const onFieldChange = useCallback(
    (entryId: string, field: keyof ScoringEdit, value: string) => {
      if (!userPermissions.canEditEntries) return;

      setEdits(prev => {
        const next = new Map(prev);
        const existing = next.get(entryId) ?? {};
        const updated = { ...existing, [field]: value };

        // Auto-clear reason when switching to a status that doesn't need one
        if (field === 'qualification') {
          const needsReason = STATUSES_REQUIRING_REASON.includes(value);
          if (!needsReason) {
            updated.qualificationReason = '';
          }
        }

        next.set(entryId, updated);
        return next;
      });
    },
    [userPermissions.canEditEntries]
  );

  // ---- Clear a single entry ----
  const clearEntry = useCallback(
    async (entryId: string) => {
      if (!userPermissions.canEditEntries) return;

      try {
        await replicatedEntriesTable.updateEntry(entryId, {
          resultStatus: 'pending',
          isScored: false,
          searchTimeSeconds: 0,
          totalFaults: 0,
          judgeNotes: null,
          finalPlacement: undefined,
          scoringCompletedAt: null,
          disqualification_reason: null,
        });

        // Remove from local state
        setEdits(prev => {
          const next = new Map(prev);
          next.delete(entryId);
          return next;
        });
        setJustScoredIds(prev => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
      } catch (error) {
        logger.error('Failed to clear entry', 'classes', { entryId }, error as Error);
        notifications.error('Failed to clear entry');
      }
    },
    [userPermissions.canEditEntries]
  );

  // ---- Validate before submit ----
  function validate(editedRows: ScoringRow[]): string | null {
    for (const row of editedRows) {
      if (row.qualification === 'Qualified' && !row.searchTime) {
        return `${row.dogName}: Qualified entries require a time`;
      }
      if (STATUSES_REQUIRING_REASON.includes(row.qualification) && !row.qualificationReason) {
        return `${row.dogName}: ${row.qualification} requires a reason`;
      }
      if (row.searchTime && !row.qualification) {
        return `${row.dogName}: Time entered without qualification`;
      }
      // Validate time format if present
      if (row.searchTime && !/^\d{1,2}:[0-5]\d\.\d{2}$/.test(row.searchTime)) {
        return `${row.dogName}: Invalid time format (use M:SS.HH)`;
      }
    }
    return null;
  }

  // ---- Calculate placements for Qualified entries ----
  function calculatePlacements(editedRows: ScoringRow[]): Map<string, number> {
    const qualified = editedRows
      .filter(r => r.qualification === 'Qualified' && r.searchTime)
      .map(r => ({
        entryId: r.entryId,
        faults: parseInt(r.faults) || 0,
        time: inputFormatToDbSeconds(r.searchTime),
      }))
      .sort((a, b) => a.faults - b.faults || a.time - b.time);

    const placements = new Map<string, number>();
    qualified.forEach((q, i) => placements.set(q.entryId, i + 1));
    return placements;
  }

  // ---- Submit ----
  const handleSubmit = useCallback(async () => {
    if (!userPermissions.canEditEntries) return;

    // Collect rows with edits
    const editedRows = rows.filter(r => edits.has(r.entryId));
    if (editedRows.length === 0) {
      setSubmitError('No changes to submit');
      return;
    }

    // Validate
    const error = validate(editedRows);
    if (error) {
      setSubmitError(error);
      notifications.error(error);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Calculate placements across ALL rows (not just edited ones)
      // Include both already-scored rows and newly-edited rows
      const allScoredRows = rows.map(r => {
        const edit = edits.get(r.entryId);
        if (edit) return r; // Already has merged edit data
        return r; // Already has DB data
      });
      const placements = calculatePlacements(allScoredRows);

      // [EXPANDED] Write each edited entry, tracking which succeed
      const succeededIds: string[] = [];
      for (const row of editedRows) {
        if (!row.qualification && !row.searchTime) continue;

        try {
          await replicatedEntriesTable.updateEntry(row.entryId, {
            resultStatus: mapQualificationToResultStatus(row.qualification),
            searchTimeSeconds: inputFormatToDbSeconds(row.searchTime),
            totalFaults: parseInt(row.faults) || 0,
            judgeNotes: row.notes || null,
            finalPlacement: placements.get(row.entryId) ?? null,
            disqualification_reason: row.qualificationReason || null,
            isScored: true,
            scoringCompletedAt: new Date().toISOString(),
          });
          succeededIds.push(row.entryId);
        } catch (entryErr) {
          logger.error(
            'Failed to write entry',
            'classes',
            { entryId: row.entryId },
            entryErr as Error
          );
        }
      }

      if (succeededIds.length === 0) throw new Error('All entries failed to save');

      // Update local state — only clear edits for entries that succeeded
      setJustScoredIds(prev => new Set([...prev, ...succeededIds]));
      setEdits(prev => {
        const next = new Map(prev);
        for (const id of succeededIds) next.delete(id);
        return next;
      });

      notifications.success(
        `${editedRows.length} result${editedRows.length > 1 ? 's' : ''} submitted`
      );
    } catch (err) {
      logger.error('Submit error:', 'classes', {}, err as Error);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit results');
      notifications.error('Failed to submit results');
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, edits, userPermissions]);

  // ---- Keyboard navigation ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, field: string) => {
      if (!userPermissions.canEditEntries) return;
      if (e.key !== 'Enter' && e.key !== 'Tab') return;

      e.preventDefault();
      const fields = NAVIGABLE_FIELDS;
      const currentFieldIndex = fields.indexOf(field as (typeof fields)[number]);

      let nextIndex = index;
      let nextFieldIndex = currentFieldIndex;

      if (e.shiftKey) {
        if (currentFieldIndex > 0) nextFieldIndex = currentFieldIndex - 1;
        else if (index > 0) {
          nextIndex = index - 1;
          nextFieldIndex = fields.length - 1;
        }
      } else {
        if (currentFieldIndex < fields.length - 1) nextFieldIndex = currentFieldIndex + 1;
        else if (index < rows.length - 1) {
          nextIndex = index + 1;
          nextFieldIndex = 0;
        }
      }

      const nextElement = document.querySelector(
        `[data-index="${nextIndex}"][data-field="${fields[nextFieldIndex]}"]`
      ) as HTMLElement;
      nextElement?.focus();
    },
    [userPermissions.canEditEntries, rows.length]
  );

  // ---- Ctrl+S shortcut ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (edits.size > 0 && !isSubmitting) handleSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [edits.size, isSubmitting, handleSubmit]);

  // ---- Summary for submit button ----
  const editCount = edits.size;
  const canSubmit = editCount > 0 && userPermissions.canEditEntries && !isSubmitting;

  return {
    rows,
    isSubmitting,
    submitError,
    editCount,
    canSubmit,
    onFieldChange,
    clearEntry,
    handleKeyDown,
    handleSubmit,
    isEntryScored: (entryId: string) =>
      justScoredIds.has(entryId) ||
      rawMap.get(entryId)?.is_scored === true ||
      (!!rawMap.get(entryId)?.result_status && rawMap.get(entryId)?.result_status !== 'pending'),
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Errors in `index.tsx` (still uses old `BulkEntryData` columns, `summary`, `updateBulkData`). That's expected — Task 2 fixes those.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/types.ts apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts
git commit -m "refactor: rewrite useClassResults as simple edit-buffer-over-raw-DB-rows"
```

---

## Task 2: Update ClassResultsTable index.tsx

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

This task updates the component to use the new hook API. The key changes:

- `bulkData` → `rows` (type `ScoringRow[]`)
- `updateBulkData(id, field, value)` → `onFieldChange(id, field, value)`
- `summary.canSubmit` → `canSubmit`
- `getSubmitLabel(summary, isSubmitting)` → simple label from `editCount`
- Column cells read from `ScoringRow` instead of `BulkEntryData`
- Tab split uses `row.isScored` instead of `scoredEntryIds` set
- Clear button calls `clearEntry(id)` instead of multi-step updateBulkData
- Remove `isEntryScored` function (now returned from hook)
- Remove `SCORED_QUALIFICATIONS`, `entryIdKey`, `rawEntryVersionKey` — all gone
- Remove `MemoizedClassResultsTable` deep comparison — simplify to reference check

- [ ] **Step 1: Read the current index.tsx fully**

Read the file to understand all column definitions, the tab filtering, card view wiring, submit button, and status picker dialog. Understand what references `BulkEntryData` and `updateBulkData`.

- [ ] **Step 2: Update imports and hook call**

Replace:

```typescript
import type { ClassResultsTableProps, BulkEntryData } from './types';
```

With:

```typescript
import type { ClassResultsTableProps, ScoringRow } from './types';
```

Replace the `useClassResults` destructure:

```typescript
const {
  rows,
  isSubmitting,
  submitError,
  editCount,
  canSubmit,
  onFieldChange,
  clearEntry,
  handleKeyDown,
  handleSubmit,
  isEntryScored,
} = useClassResults({
  entries,
  rawEntries: rawEntries ?? [],
  classConfig,
  userPermissions,
  classId: classId ?? '',
});
```

- [ ] **Step 3: Update tab filtering**

Replace the `scoredEntryIds` + `rawEntryMap` memos and tab filtering with:

```typescript
const scoredEntryIds = useMemo(
  () => new Set(rows.filter(r => r.isScored).map(r => r.entryId)),
  [rows]
);

const tabCounts = useMemo(() => {
  const completed = scoredEntryIds.size;
  return { pending: rows.length - completed, completed };
}, [rows.length, scoredEntryIds]);

const filteredRows = useMemo(() => {
  if (scoringTab === 'all') return rows;
  if (scoringTab === 'completed') return rows.filter(r => r.isScored);
  return rows.filter(r => !r.isScored);
}, [rows, scoringTab]);
```

Remove the old `filteredBulkData` and `filteredEntries` memos.

- [ ] **Step 4: Update column definitions**

Change column type from `ColumnDef<BulkEntryData>` to `ColumnDef<ScoringRow>`:

```typescript
const columns: ColumnDef<ScoringRow, unknown>[] = useMemo(() => {
```

Update cell accessors: `row.original.qualification` stays the same (field names match). But update references:

- `item.entryId` stays (same field name)
- `item.dogName` stays
- `item.armband` stays
- `item.searchTime` stays
- `item.qualification` stays
- `item.faults` stays
- `item.notes` stays
- `item.hasChanges` → `item.hasEdits`
- `item.hadExistingData` → `item.isScored`
- `item.isCleared` → removed (clear is immediate now)
- `item.isValid` → removed (validation on submit only)
- `item.modifiedFields` → removed

Update `onUpdate` calls in QualificationCell and other cells:

- `updateBulkData(id, field, value)` → `onFieldChange(id, field as keyof ScoringEdit, value)`

- [ ] **Step 5: Update clear button column**

Replace the multi-step `updateBulkData` clear with:

```typescript
{
  id: 'clearResult',
  header: '',
  cell: ({ row }) => {
    const item = row.original;
    if (!item.isScored && !item.hasEdits) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => clearEntry(item.entryId)}
        title="Clear result"
      >
        <Eraser className="h-3.5 w-3.5" />
      </Button>
    );
  },
},
```

- [ ] **Step 6: Update submit button**

Replace `getSubmitLabel` and `summary.canSubmit`:

```typescript
{userPermissions.canEditEntries && (
  <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
    <div className="text-sm text-muted-foreground">
      Press Enter or Tab to move between fields &bull; Placements calculated on submit
    </div>
    <Button
      onClick={handleSubmit}
      disabled={!canSubmit}
      className="myk9-action-button myk9-action-button-primary"
    >
      <Save className="h-4 w-4" />
      <span>{isSubmitting ? 'Submitting...' : `Submit ${editCount} Result${editCount !== 1 ? 's' : ''}`}</span>
    </Button>
  </div>
)}
```

- [ ] **Step 7: Update DataTable data prop**

Change from `filteredBulkData` to `filteredRows`:

```typescript
<DataTable<ScoringRow>
  tableId="classResults"
  columns={columns}
  data={filteredRows}
  getRowId={row => row.entryId}
  pageSize={9999}
/>
```

- [ ] **Step 8: Update MemoizedClassResultsTable**

Simplify the memo comparison:

```typescript
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.userPermissions !== nextProps.userPermissions) return false;
  return true;
});
```

- [ ] **Step 9: Remove dead code**

Remove: `getSubmitLabel` function, `isEntryScored` function at top of file, `SCORED_QUALIFICATIONS` set, `validationErrors` state, `filteredBulkData` memo.

[ADDED] **Keep `entryMap`** — the DogInfoTooltip column (line ~171) uses `entryMap.get(item.entryId)?.registrations` to show breed/registration data. This comes from `ScentWorkEntry` and has no equivalent in raw DB rows. Keep the memo:

```typescript
const entryMap = useMemo(() => new Map(entries.map(e => [e.id, e])), [entries]);
```

[ADDED] **Keep `filteredEntries`** — the card view (`EntryCardGrid`) renders from `entries` (ScentWorkEntry), not from `rows` (ScoringRow). Filter it using the hook's `isEntryScored`:

```typescript
const filteredEntries = useMemo(() => {
  if (scoringTab === 'all') return entries;
  if (scoringTab === 'completed') return entries.filter(e => isEntryScored(e.id));
  return entries.filter(e => !isEntryScored(e.id));
}, [entries, scoringTab, isEntryScored]);
```

Remove unused imports: old `BulkEntryData`, `ResultsSummary`, any removed utilities.

- [ ] **Step 10: Run typecheck**

Run: `pnpm typecheck`
Expected: May have errors in `QualificationCell` or `StatusBadge` — fixed in Task 3.

- [ ] **Step 11: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/index.tsx
git commit -m "refactor: update ClassResultsTable to use new simple scoring hook"
```

---

## Task 3: Update QualificationCell and StatusBadge

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx`
- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/StatusBadge.tsx`

- [ ] **Step 1: Update QualificationCell**

The QualificationCell currently takes `item: BulkEntryData` and `onUpdate`. Change to accept `ScoringRow` and `onFieldChange`:

Update the interface:

```typescript
interface QualificationCellProps {
  item: ScoringRow;
  onUpdate: (entryId: string, field: string, value: string) => void;
  canEdit: boolean;
}
```

[EXPANDED] Update references: `item.modifiedFields?.has('qualification')` → replace with `item.hasEdits`. If the entry has any unsaved edits, show a subtle ring highlight on all edited fields. This is simpler than per-field tracking:

```typescript
className={cn('w-28', item.hasEdits && 'ring-2 ring-blue-500/30 border-blue-500')}
```

- [ ] **Step 2: Update StatusBadge**

Simplify to show Scored/Pending based on `ScoringRow.isScored`:

```typescript
import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ScoringRow } from './types';

interface StatusBadgeProps {
  item: ScoringRow;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ item }) => {
  if (item.isScored) {
    return (
      <Badge variant="default" className="flex items-center space-x-1">
        <CheckCircle className="h-3 w-3" />
        <span>Scored</span>
      </Badge>
    );
  }

  if (item.hasEdits) {
    return (
      <Badge variant="outline" className="flex items-center space-x-1">
        <span>Editing</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="flex items-center space-x-1">
      <span>Pending</span>
    </Badge>
  );
};
```

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && npx vitest run src/components/classes/`
Expected: Pass (or failures in tests that reference old types — fix in Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx apps/myk9show/src/components/classes/ClassResultsTable/StatusBadge.tsx
git commit -m "refactor: update QualificationCell and StatusBadge for new scoring types"
```

---

## Task 4: Fix broken tests

**Files:**

- Various test files in `apps/myk9show/src/components/classes/__tests__/`

- [ ] **Step 1: Run tests and identify failures**

Run: `cd apps/myk9show && pnpm test 2>&1 | grep "FAIL" | sort -u`

- [ ] **Step 2: Fix each test file**

Common fixes:

- Replace `BulkEntryData` references with `ScoringRow`
- Replace `onResultsSubmit` with nothing (hook writes directly)
- Replace `updateBulkData` with `onFieldChange`
- Replace `summary.canSubmit` with `canSubmit`
- Update mock data shapes
- Add `replicatedEntriesTable` mock if not present

- [ ] **Step 3: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: fix tests for simple scoring table rewrite"
```

---

## Task 5: Clean up dead code + remove diagnostics

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/utils.ts`

- [ ] **Step 1: Simplify utils.ts**

Remove `validateEntry` (validation is now inline in the hook). Keep `calculatePlacements` only if still used by other code — check imports. Keep `formatPlacement`, `getPlacementBadgeClass`, `formatSearchTime`, `timeStringToMs`, `convertTimeToInputFormat`.

If `calculatePlacements` is only used by the old hook (now removed), delete it.

- [ ] **Step 2: Run typecheck and full tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead scoring utilities"
```

---

## Task 6: Update TO-DOS.md

- [ ] **Step 1: Update the scoring todo**

Mark the simplified scoring todo as done with the new approach.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark simple scoring table rewrite as complete"
```
