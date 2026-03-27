# Simplified Scoring Data Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-layer scoring type conversion chain with direct DB column read/write, fixing the bug where cleared results revert to old values.

**Architecture:** `useClassResults` reads scoring data directly from raw DB entry rows (via a new `useClassEntriesRaw` hook) and writes back via `replicatedEntriesTable.updateEntry()` with DB column names. This eliminates `competitionData`, `judgingState.currentResult`, `handleResultUpdate`, and `handleResultsSubmit` as intermediaries. `BulkEntryData` stays as the local edit buffer.

**Tech Stack:** Supabase (Postgres), React Query, Zustand replication layer, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-simplified-scoring-data-flow-design.md`

---

## File Structure

### New Files

| File                                                    | Responsibility                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts` | React Query hook returning raw DB entry rows with scoring columns intact    |
| `apps/myk9show/src/utils/scoringMappings.ts`            | `result_status` <-> `QualificationStatus` mapping helpers + time conversion |
| `apps/myk9show/src/utils/scoringMappings.test.ts`       | Unit tests for mapping helpers                                              |

### Modified Files

| File                                                                        | Change                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts` | Rewrite initialization to read from raw DB columns; rewrite submit to write DB columns directly |
| `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`          | Simplify `isEntryScored`, accept raw entries prop, add clear button per row                     |
| `apps/myk9show/src/components/classes/ClassResultsTable/types.ts`           | Update `ClassResultsTableProps` to accept raw entry data                                        |
| `apps/myk9show/src/components/classes/ClassDetailsMain.tsx`                 | Remove `handleResultsSubmit`, pass raw entries + replication table to ClassResultsTable         |
| `apps/myk9show/src/pages/ClassDetailsPage/index.tsx`                        | Remove `handleResultUpdate`, wire raw entry data                                                |
| `apps/myk9show/src/pages/ClassDetailsPage/useClassDetailsData.ts`           | Add `useClassEntriesRaw` for scoring data, remove qualification from ClassEntryDisplay          |

---

## Task 1: Create Scoring Mapping Helpers

**Files:**

- Create: `apps/myk9show/src/utils/scoringMappings.ts`
- Create: `apps/myk9show/src/utils/scoringMappings.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// scoringMappings.test.ts
import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from './scoringMappings';

describe('mapResultStatusToQualification', () => {
  it('maps DB result_status to display QualificationStatus', () => {
    expect(mapResultStatusToQualification('qualified')).toBe('Qualified');
    expect(mapResultStatusToQualification('nq')).toBe('Not Qualified');
    expect(mapResultStatusToQualification('absent')).toBe('Absent');
    expect(mapResultStatusToQualification('excused')).toBe('Excused');
    expect(mapResultStatusToQualification('withdrawn')).toBe('Withdrawn');
  });

  it('returns empty string for pending or null', () => {
    expect(mapResultStatusToQualification('pending')).toBe('');
    expect(mapResultStatusToQualification(null)).toBe('');
    expect(mapResultStatusToQualification(undefined)).toBe('');
  });
});

describe('mapQualificationToResultStatus', () => {
  it('maps display QualificationStatus to DB result_status', () => {
    expect(mapQualificationToResultStatus('Qualified')).toBe('qualified');
    expect(mapQualificationToResultStatus('Not Qualified')).toBe('nq');
    expect(mapQualificationToResultStatus('Absent')).toBe('absent');
    expect(mapQualificationToResultStatus('Excused')).toBe('excused');
    expect(mapQualificationToResultStatus('Withdrawn')).toBe('withdrawn');
    expect(mapQualificationToResultStatus('Eliminated')).toBe('nq');
  });

  it('returns pending for empty string', () => {
    expect(mapQualificationToResultStatus('')).toBe('pending');
  });
});

describe('dbSecondsToInputFormat', () => {
  it('converts seconds to MM:SS.HH', () => {
    expect(dbSecondsToInputFormat(45.23)).toBe('0:45.23');
    expect(dbSecondsToInputFormat(125.5)).toBe('2:05.50');
    expect(dbSecondsToInputFormat(0)).toBe('');
    expect(dbSecondsToInputFormat(null)).toBe('');
  });
});

describe('inputFormatToDbSeconds', () => {
  it('converts MM:SS.HH to seconds', () => {
    expect(inputFormatToDbSeconds('0:45.23')).toBe(45.23);
    expect(inputFormatToDbSeconds('2:05.50')).toBe(125.5);
    expect(inputFormatToDbSeconds('')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/utils/scoringMappings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoring mappings**

```typescript
// scoringMappings.ts
import type { QualificationStatus } from '@/types/scent-work-types';

const RESULT_STATUS_TO_QUALIFICATION: Record<string, QualificationStatus> = {
  qualified: 'Qualified',
  nq: 'Not Qualified',
  absent: 'Absent',
  excused: 'Excused',
  withdrawn: 'Withdrawn',
};

const QUALIFICATION_TO_RESULT_STATUS: Record<string, string> = {
  Qualified: 'qualified',
  'Not Qualified': 'nq',
  Absent: 'absent',
  Excused: 'excused',
  Withdrawn: 'withdrawn',
  Eliminated: 'nq',
};

/** Map DB `result_status` column value to display `QualificationStatus`. */
export function mapResultStatusToQualification(
  resultStatus: string | null | undefined
): QualificationStatus | '' {
  if (!resultStatus || resultStatus === 'pending') return '';
  return RESULT_STATUS_TO_QUALIFICATION[resultStatus] ?? '';
}

/** Map display `QualificationStatus` to DB `result_status` column value. */
export function mapQualificationToResultStatus(qualification: QualificationStatus | ''): string {
  if (!qualification) return 'pending';
  return QUALIFICATION_TO_RESULT_STATUS[qualification] ?? 'pending';
}

/** Convert DB `search_time_seconds` (numeric) to input format `M:SS.HH`. */
export function dbSecondsToInputFormat(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/** Convert input format `M:SS.HH` to DB `search_time_seconds` (numeric). */
export function inputFormatToDbSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (!match) return 0;
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);
  return minutes * 60 + seconds + hundredths / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/utils/scoringMappings.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/scoringMappings.ts apps/myk9show/src/utils/scoringMappings.test.ts
git commit -m "feat: add scoring mapping helpers (result_status <-> QualificationStatus, time conversion)"
```

---

## Task 2: Create `useClassEntriesRaw` Hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts`

- [ ] **Step 1: Create the hook**

```typescript
// useClassEntriesRaw.ts
import { useQuery } from '@tanstack/react-query';
import { getEntriesByClass } from '@/services/database/queries/entry-query-lookups';
import { cacheStrategies } from '@/lib/queryClient';

/** Raw DB entry row with all columns intact (no mapper that drops scoring fields). */
export interface RawEntryRow {
  id: string;
  class_id: string;
  show_id: string;
  dog_id: string;
  handler_id: string | null;
  armband: string | null;
  handler: string | null;
  // Scoring columns
  result_status: string | null;
  is_scored: boolean | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  judge_notes: string | null;
  disqualification_reason: string | null;
  scoring_completed_at: string | null;
  // Check-in
  check_in_status: string | null;
  // Dog join
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  } | null;
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Returns raw DB entry rows for a class with all scoring columns intact.
 * Unlike useClassEntriesWithQuery, this does NOT run through mapDatabaseToEntry
 * which drops scoring fields.
 */
export function useClassEntriesRaw(classId: string | undefined) {
  return useQuery({
    queryKey: ['classes', classId, 'entries'],
    queryFn: async () => {
      if (!classId) return [];
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return (data ?? []) as RawEntryRow[];
    },
    enabled: !!classId,
    ...cacheStrategies.dynamic,
  });
}
```

- [ ] **Step 2: Add `disqualification_reason` to ReplicatedEntry and toSupabaseRow [ADDED]**

In `apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts`:

1. Add to `ReplicatedEntry` interface:

```typescript
  disqualification_reason?: string | null | undefined;
```

2. Add to `rowToEntry` mapping:

```typescript
  disqualification_reason: (row.disqualification_reason as string | undefined) ?? undefined,
```

3. Add to `toSupabaseRow` mapping:

```typescript
  disqualification_reason: entry.disqualification_reason ?? null,
```

This ensures the clear operation can write `disqualification_reason: null` through to the DB.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts
git commit -m "feat: add useClassEntriesRaw hook, add disqualification_reason to ReplicatedEntry"
```

---

## Task 3: Rewrite `useClassResults` — Read Path

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts`
- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/types.ts`

This is the core change. The initialization `useEffect` reads from raw DB rows instead of `competitionData`/`judgingState`.

- [ ] **Step 1: Update `ClassResultsTableProps` to accept raw entry data**

In `types.ts`, add a new prop for raw entry rows and import the type:

```typescript
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
```

Add to `ClassResultsTableProps`:

```typescript
  /** Raw DB entry rows for scoring data (bypasses mappers that drop scoring columns). */
  rawEntries?: RawEntryRow[] | undefined;
```

- [ ] **Step 2: Rewrite the initialization `useEffect` in `useClassResults`**

Replace the `UseClassResultsParams` interface to accept raw entries:

```typescript
interface UseClassResultsParams {
  entries: ScentWorkEntry[]; // Still needed for display info (dogName, breed, etc.)
  rawEntries: RawEntryRow[]; // DB rows with scoring columns
  classConfig: ScentWorkClassConfig;
  userPermissions: UserPermissions;
  classId: string;
}
```

Add imports:

```typescript
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { useQueryClient } from '@tanstack/react-query';
import {
  mapResultStatusToQualification,
  mapQualificationToResultStatus,
  dbSecondsToInputFormat,
  inputFormatToDbSeconds,
} from '@/utils/scoringMappings';
```

Rewrite the initialization `useEffect` (replace lines 51-128):

```typescript
// Build a lookup of raw DB entries by ID for scoring data
const rawEntryMap = useMemo(() => new Map(rawEntries.map(r => [r.id, r])), [rawEntries]);

// Initialize bulk data from entries + raw DB scoring columns
useEffect(() => {
  setBulkData(() => {
    const newData = entries.map(entry => {
      const raw = rawEntryMap.get(entry.id);

      // Read scoring fields directly from DB columns
      const qualification = mapResultStatusToQualification(raw?.result_status);
      const searchTime = dbSecondsToInputFormat(raw?.search_time_seconds);

      const hadExistingData = !!(searchTime || qualification);

      const bulkEntry: BulkEntryData = {
        entryId: entry.id,
        armband: entry.displayInfo.armband,
        dogName: entry.displayInfo.dogName,
        handlerName: entry.displayInfo.handlerName,
        searchTime,
        qualification,
        qualificationReason: raw?.disqualification_reason ?? '',
        faults: String(raw?.total_faults ?? 0),
        notes: raw?.judge_notes ?? '',
        placement: raw?.final_placement ?? null,
        isValid: !!(searchTime && qualification),
        hasChanges: false,
        hadExistingData,
        isCleared: false,
        modifiedFields: new Set<keyof BulkEntryData>(),
      };

      return bulkEntry;
    });

    return calculatePlacements(newData);
  });
}, [entries, rawEntryMap]);
```

- [ ] **Step 3: Rewrite `handleSubmit` — Write Path**

Replace the existing `handleSubmit` (lines 286-337) with direct DB writes:

```typescript
const queryClient = useQueryClient();

const handleSubmit = useCallback(async () => {
  if (!userPermissions.canEditEntries) return;

  setIsSubmitting(true);
  setSubmitError(null);

  try {
    // Collect scored entries
    const scoredItems = bulkData.filter(item => item.hasChanges && item.isValid && !item.isCleared);

    // Collect cleared entries
    const clearedItems = bulkData.filter(item => item.isCleared);

    if (scoredItems.length === 0 && clearedItems.length === 0) {
      setSubmitError('No valid results to submit');
      return;
    }

    // Write scored entries directly to DB columns via replication
    for (const item of scoredItems) {
      await replicatedEntriesTable.updateEntry(item.entryId, {
        result_status: mapQualificationToResultStatus(item.qualification),
        search_time_seconds: inputFormatToDbSeconds(item.searchTime),
        total_faults: parseInt(item.faults) || 0,
        judge_notes: item.notes || null,
        final_placement: item.placement,
        is_scored: true,
        scoring_completed_at: new Date().toISOString(),
      });
    }

    // Clear entries — reset all scoring columns to defaults
    for (const item of clearedItems) {
      await replicatedEntriesTable.updateEntry(item.entryId, {
        result_status: 'pending',
        is_scored: false,
        search_time_seconds: 0,
        total_faults: 0,
        judge_notes: null,
        final_placement: null,
        scoring_completed_at: null,
        disqualification_reason: null,
      });
    }

    // Invalidate React Query cache to refresh from DB
    queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });

    // Reset local change tracking
    setBulkData(prev =>
      prev.map(item => ({
        ...item,
        hasChanges: false,
        isCleared: false,
        modifiedFields: new Set<keyof BulkEntryData>(),
      }))
    );
  } catch (error) {
    logger.error('Submit error:', 'classes', {}, error as Error);
    setSubmitError(error instanceof Error ? error.message : 'Failed to submit results');
  } finally {
    setIsSubmitting(false);
  }
}, [bulkData, classId, userPermissions, queryClient]);
```

- [ ] **Step 4: Remove the old `onResultsSubmit` prop**

The hook no longer needs `onResultsSubmit` since it writes directly. Remove it from `UseClassResultsParams`. Remove it from `ClassResultsTableProps` in `types.ts` as well.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: Errors in files that still pass `onResultsSubmit` — these will be fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts apps/myk9show/src/components/classes/ClassResultsTable/types.ts
git commit -m "refactor: rewrite useClassResults to read/write DB columns directly"
```

---

## Task 4: Wire Raw Entries into ClassResultsTable + Simplify isEntryScored

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

- [ ] **Step 1: Update the component to accept and pass rawEntries**

Update the destructured props to include `rawEntries`:

```typescript
export const ClassResultsTable: React.FC<ClassResultsTableProps> = ({
  entries,
  rawEntries,
  classConfig,
  userPermissions,
  onDeleteEntry,
  onAddEntry,
  className,
  classId,
  onOpenRequirements,
}) => {
```

Update the `useClassResults` call to pass `rawEntries` and `classId`, remove `onResultsSubmit`:

```typescript
const {
  bulkData,
  isSubmitting,
  submitError,
  validationErrors,
  summary,
  updateBulkData,
  handleKeyDown,
  handleSubmit,
} = useClassResults({
  entries,
  rawEntries: rawEntries ?? [],
  classConfig,
  userPermissions,
  classId: classId ?? '',
});
```

- [ ] **Step 2: Simplify `isEntryScored`**

Replace the entire `isEntryScored` function and `SCORED_QUALIFICATIONS` set with:

```typescript
function isEntryScored(entry: ScentWorkEntry): boolean {
  // Check raw entry data via the entries map if available
  // Fall back to the entry's own fields
  const raw = entry as unknown as Record<string, unknown>;
  if (raw.is_scored === true) return true;
  const status = raw.result_status as string;
  if (status && status !== 'pending') return true;
  return false;
}
```

Note: The `ScentWorkEntry` objects in the `entries` prop don't have `is_scored`/`result_status`. We need to check against the raw entries. Update `isEntryScored` to accept the rawEntries map:

```typescript
function isEntryScored(entryId: string, rawEntryMap: Map<string, RawEntryRow>): boolean {
  const raw = rawEntryMap.get(entryId);
  if (!raw) return false;
  if (raw.is_scored === true) return true;
  return !!raw.result_status && raw.result_status !== 'pending';
}
```

Update the `scoredEntryIds` memo and anywhere `isEntryScored` is called:

```typescript
const rawEntryMap = useMemo(() => new Map((rawEntries ?? []).map(r => [r.id, r])), [rawEntries]);

const scoredEntryIds = useMemo(
  () => new Set(entries.filter(e => isEntryScored(e.id, rawEntryMap)).map(e => e.id)),
  [entries, rawEntryMap]
);
```

- [ ] **Step 3: Add clear button to column definitions**

Add a new column before the delete column:

```typescript
{
  id: 'clearResult',
  header: '',
  cell: ({ row }) => {
    const item = row.original;
    if (!item.hadExistingData && !item.hasChanges) return null;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => {
          updateBulkData(item.entryId, 'qualification', '');
          updateBulkData(item.entryId, 'searchTime', '');
          updateBulkData(item.entryId, 'faults', '0');
          updateBulkData(item.entryId, 'notes', '');
          updateBulkData(item.entryId, 'qualificationReason', '');
        }}
        title="Clear result"
      >
        <Eraser className="h-3.5 w-3.5" />
      </Button>
    );
  },
},
```

Add `Eraser` to the Lucide imports at the top of the file.

- [ ] **Step 4: Update MemoizedClassResultsTable comparison [ADDED]**

The `MemoizedClassResultsTable` (at the bottom of index.tsx) compares `prevEntry.competitionData` and `prevEntry.judgingState?.currentResult` to detect changes. These fields are no longer the source of truth. Update the comparison to check the `rawEntries` prop instead:

```typescript
export const MemoizedClassResultsTable = React.memo(ClassResultsTable, (prevProps, nextProps) => {
  // Re-render if rawEntries change (scoring data from DB)
  if (prevProps.rawEntries !== nextProps.rawEntries) return false;
  // Re-render if entries array identity changes (display data)
  if (prevProps.entries !== nextProps.entries) return false;
  if (prevProps.entries.length !== nextProps.entries.length) return false;
  // Re-render if permissions change
  if (prevProps.userPermissions !== nextProps.userPermissions) return false;
  if (prevProps.classConfig !== nextProps.classConfig) return false;
  return true;
});
```

Remove the per-entry `competitionData`/`judgingState`/`checkInStatus` deep comparison — `rawEntries` reference identity handles it.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: Errors in ClassDetailsMain and ClassDetailsPage that still pass old props — fixed in next tasks.

Note: [ADDED] Clear button is table-view only for v1. Card view users switch to table view to clear entries. Card view is for quick status overview, not detailed editing.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/index.tsx
git commit -m "refactor: wire raw entries into ClassResultsTable, simplify isEntryScored, add clear button"
```

---

## Task 5: Update ClassDetailsMain — Remove handleResultsSubmit

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassDetailsMain.tsx`

- [ ] **Step 1: Remove `handleResultsSubmit` and `onResultUpdate` prop**

The `ClassDetailsMain` component no longer needs to transform results — `useClassResults` writes directly. Remove:

1. The `onResultUpdate` from the destructured props
2. The entire `handleResultsSubmit` callback (lines ~77-115)
3. The `msToDisplay` import (if only used by handleResultsSubmit)

Add `rawEntries` to the props interface. Read the `ClassDetailsMainProps` type to add it:

```typescript
interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: ClassEntryDisplay[];
  rawEntries: RawEntryRow[]; // NEW
  parentShow: ShowData;
  onAddEntry?: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onOpenRequirements?: () => void;
}
```

- [ ] **Step 2: Pass rawEntries to ClassResultsTable**

In the JSX where `ClassResultsTable` (or `MemoizedClassResultsTable`) is rendered, add `rawEntries` prop and remove `onResultsSubmit`:

```typescript
<MemoizedClassResultsTable
  entries={scentWorkEntries}
  rawEntries={rawEntries}
  classConfig={classConfig}
  userPermissions={/* existing */}
  classId={classData?.id}
  onDeleteEntry={onDeleteEntry}
  onAddEntry={onAddEntry}
  onOpenRequirements={onOpenRequirements}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Errors in ClassDetailsPage where it passes `onResultUpdate` — fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassDetailsMain.tsx
git commit -m "refactor: remove handleResultsSubmit from ClassDetailsMain, pass rawEntries through"
```

---

## Task 6: Update ClassDetailsPage — Remove handleResultUpdate, Wire Raw Entries

**Files:**

- Modify: `apps/myk9show/src/pages/ClassDetailsPage/index.tsx`
- Modify: `apps/myk9show/src/pages/ClassDetailsPage/useClassDetailsData.ts`

- [ ] **Step 1: Add `useClassEntriesRaw` to `useClassDetailsData`**

In `useClassDetailsData.ts`, add the raw entries query:

```typescript
import { useClassEntriesRaw } from '@/hooks/queries/useClassEntriesRaw';
```

Inside the hook, add:

```typescript
const { data: rawEntries = [] } = useClassEntriesRaw(classId || undefined);
```

Add `rawEntries` to the return object.

- [ ] **Step 2: Remove `handleResultUpdate` from ClassDetailsPage**

In `index.tsx`:

1. Remove the entire `handleResultUpdate` function (lines 165-210)
2. Remove `updateResult` from the `useEntryStore()` destructuring
3. Remove `replicatedEntriesTable` import (if only used by handleResultUpdate)
4. Remove `onResultUpdate={handleResultUpdate}` from the `ClassDetailsMain` props

- [ ] **Step 3: Pass rawEntries to ClassDetailsMain**

```typescript
<ClassDetailsMain
  classData={currentClass}
  classEntries={classEntries}
  rawEntries={rawEntries}
  parentShow={parentShow}
  onAddEntry={/* existing */}
  onDeleteEntry={/* existing */}
  onOpenRequirements={/* existing */}
/>
```

- [ ] **Step 4: Clean up ClassEntryDisplay status mapping**

In `useClassDetailsData.ts`, the `ClassEntryDisplay` mapping no longer needs the qualification status (scoring is read from raw entries now). Simplify:

```typescript
return {
  id: e.id,
  armband,
  handler: e.handler || '',
  dog: e.dog || 'Unknown Dog',
  status: '' as ClassEntryDisplay['status'], // Scoring handled by raw entries
  score: '',
  time: '',
  placement: '',
  classId: e.classId || '',
};
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: Pass (all old scoring plumbing removed).

- [ ] **Step 6: Run tests**

Run: `cd apps/myk9show && pnpm test`
Expected: Some tests may fail due to removed props. Fix in Task 7.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/ClassDetailsPage/index.tsx apps/myk9show/src/pages/ClassDetailsPage/useClassDetailsData.ts
git commit -m "refactor: remove handleResultUpdate, wire raw entries through ClassDetailsPage"
```

---

## Task 7: Fix Broken Tests

**Files:**

- Various test files

- [ ] **Step 1: Run full test suite and identify failures**

Run: `cd apps/myk9show && pnpm test 2>&1 | grep "FAIL" | sort -u`

- [ ] **Step 2: Fix each failing test**

Common fixes needed:

- Tests passing `onResultsSubmit` prop to ClassResultsTable — remove it
- Tests passing `onResultUpdate` to ClassDetailsMain — remove it
- Tests mocking `handleResultsSubmit` — remove the mock
- Tests checking `isEntryScored` behavior — update to match new signature
- Add `rawEntries` prop to test renders of ClassResultsTable

For each test file:

1. Run individually: `npx vitest run <path>`
2. Read the error
3. Apply minimal fix
4. Verify passes

- [ ] **Step 3: Run full suite to confirm**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: fix tests for simplified scoring data flow"
```

---

## Task 8: Integration Verification + Dead Code Cleanup

**Files:**

- Various files

- [ ] **Step 1: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: Clean.

- [ ] **Step 2: Verify no stale imports**

Search for references to removed code:

```bash
grep -r "onResultsSubmit\|handleResultsSubmit\|handleResultUpdate" apps/myk9show/src/ --include='*.ts' --include='*.tsx' | grep -v test | grep -v '.d.ts'
```

Expected: No matches (except test files if they reference the old pattern in comments).

- [ ] **Step 3: Remove dead scoring logic from buildScentWorkEntries**

In `ClassDetailsMain.helpers.ts`, the `competitionData` and `judgingState.currentResult` blocks in `buildScentWorkEntries` (lines 188-237) are no longer needed for scoring display. Simplify to always set `competitionData: undefined` and `judgingState: { isInProgress: false, currentResult: undefined }`. The display info (armband, dogName, etc.) stays.

- [ ] **Step 4: Run full test suite one more time**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead scoring reconstruction logic from buildScentWorkEntries"
```

---

## Task 9: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the scoring simplification todo as done**

Update the "Simplify Scoring Data Flow" item to `[x]` with completion summary.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark scoring data flow simplification as complete"
```
