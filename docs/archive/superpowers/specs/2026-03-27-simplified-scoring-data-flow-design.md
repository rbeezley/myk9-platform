# Simplified Scoring Data Flow — Design Spec

**Date:** 2026-03-27
**Status:** Draft

## Problem

The scoring data flow in myK9Show has 7 intermediate type conversions between the database and the UI. Scoring data gets lost at multiple points — most critically, `entryToReplicated` drops `competitionData` entirely, and `mapDatabaseToEntry` drops all scoring DB columns. This causes bugs where cleared results revert to old values (NQ reappears after clearing) because the read path reconstructs scoring state from stale intermediate objects.

### Current Architecture (broken)

```
DB columns (result_status, search_time_seconds, etc.)
  → getEntriesByClass (SELECT *)
  → mapDatabaseToEntry (DROPS scoring columns)
  → ShowEntry (competitionData empty)
  → useClassDetailsData (maps lifecycle status as qualification — wrong)
  → ClassEntryDisplay
  → buildScentWorkEntries (reconstructs competitionData + judgingState from strings)
  → ScentWorkEntry
  → useClassResults (reads competitionData then falls back to judgingState)
  → BulkEntryData (local form state)
```

Write path is equally broken — `entryToReplicated` doesn't map `competitionData` fields, so scoring writes to the local store but never reaches the DB.

### myK9Q Pattern (works)

myK9Q writes scoring data directly to DB columns via `replicatedEntriesTable.markAsScored()`. No intermediate type conversions. Flat structure, single source of truth.

## Solution

Replace the 7-layer chain with a direct DB-column read/write path.

### New Read Path

```
DB columns (search_time_seconds, result_status, total_faults, etc.)
  → getEntriesByClass (SELECT *)
  → Raw DB rows passed to ClassResultsTable
  → useClassResults initializes BulkEntryData from DB column names
```

`useClassResults` reads `result_status`, `search_time_seconds`, `total_faults`, `judge_notes`, `final_placement` directly from the entry row. No `competitionData`, no `judgingState` fallback.

### New Write Path

```
BulkEntryData (user edits)
  → handleSubmit maps to DB column names
  → replicatedEntriesTable.updateEntry(entryId, {
      result_status, search_time_seconds, total_faults,
      is_scored, judge_notes, final_placement, scoring_completed_at
    })
  → Replication layer syncs to Supabase
  → React Query invalidation refreshes UI
```

No more `CompetitionData` → `entryToReplicated` → `toSupabaseRow` chain with data loss.

### Clear Button

One "Clear" button per entry row. Writes directly via replication:

```typescript
replicatedEntriesTable.updateEntry(entryId, {
  result_status: 'pending',
  is_scored: false,
  search_time_seconds: 0,
  total_faults: 0,
  judge_notes: null,
  final_placement: null,
  scoring_completed_at: null,
});
```

Entry moves from Completed to Pending tab immediately.

## Decisions Made

- **Keep batch submit** — secretary edits multiple entries, reviews, then submits all at once
- **Keep BulkEntryData as local edit buffer** — it's form state, that's fine
- **Keep both scoring methods** — inline table for bulk secretary scoring, scoresheet page for ringside scoring
- **Don't delete `competitionData` from types** — stop reading it in the results table, but leave the type intact for other consumers
- **Direct replication writes** — skip the entry store for scoring updates, write to `replicatedEntriesTable` directly (matches myK9Q pattern)

## What Gets Eliminated

| Component                                             | Why                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `buildScentWorkEntries` scoring logic (lines 188-237) | No longer reconstructing `competitionData`/`judgingState` from display strings |
| `ClassEntryDisplay.status` as qualification           | Was using lifecycle status (wrong field)                                       |
| `handleResultUpdate` in ClassDetailsPage              | Replaced by direct replication write                                           |
| `useClassResults` dual-source fallback chain          | Reads from DB columns directly, single source                                  |
| `entryToReplicated` scoring field gap                 | Bypassed — writing to replication layer directly                               |

## What Stays

| Component                            | Why                                                        |
| ------------------------------------ | ---------------------------------------------------------- |
| `BulkEntryData` (local form state)   | Edit buffer for batch submit — correct pattern             |
| `ReplicatedEntry` (replication type) | Already has all DB scoring fields                          |
| Scoresheet pages                     | Already write directly via replication — no changes needed |
| `ShowEntry.competitionData` type     | Exists on the type, just not read by results table anymore |

## Detailed Changes

### 1. New Entry Data Hook: `useClassEntriesRaw`

New React Query hook that returns raw DB entries without the `mapDatabaseToEntry` transformation that drops scoring columns.

```typescript
// Returns entries with DB column names intact
export function useClassEntriesRaw(classId: string) {
  return useQuery({
    queryKey: ['classes', classId, 'entries'],
    queryFn: async () => {
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return data; // Raw DB rows — no mapper that drops scoring columns
    },
    enabled: !!classId,
    ...cacheStrategies.dynamic,
  });
}
```

### 2. Rewrite `useClassResults` Initialization

The `useEffect` that initializes `BulkEntryData` reads from DB columns:

```typescript
useEffect(() => {
  setBulkData(() => {
    return entries.map(entry => {
      const row = entry as Record<string, unknown>;

      // Map result_status DB value to display qualification
      const qualification = mapResultStatusToQualification(row.result_status as string);

      // Convert search_time_seconds to display format
      const searchTime = row.search_time_seconds
        ? convertSecondsToInputFormat(Number(row.search_time_seconds))
        : '';

      return {
        entryId: entry.id,
        armband: (row.armband as string) ?? '',
        dogName: /* from dog join */ '',
        handlerName: (row.handler as string) ?? '',
        searchTime,
        qualification,
        qualificationReason: (row.disqualification_reason as string) ?? '',
        faults: String(row.total_faults ?? 0),
        notes: (row.judge_notes as string) ?? '',
        placement: row.final_placement ? Number(row.final_placement) : null,
        isValid: !!(searchTime && qualification),
        hasChanges: false,
        hadExistingData: !!(searchTime || qualification),
        isCleared: false,
        modifiedFields: new Set(),
      };
    });
  });
}, [entries]);
```

### 3. Rewrite `handleSubmit` Write Path

Submit maps `BulkEntryData` directly to DB columns:

```typescript
const handleSubmit = async () => {
  const updates = bulkData
    .filter(item => item.hasChanges && item.isValid && !item.isCleared)
    .map(item => ({
      entryId: item.entryId,
      fields: {
        result_status: mapQualificationToResultStatus(item.qualification),
        search_time_seconds: timeStringToSeconds(item.searchTime),
        total_faults: parseInt(item.faults) || 0,
        judge_notes: item.notes || null,
        final_placement: item.placement,
        is_scored: true,
        scoring_completed_at: new Date().toISOString(),
      },
    }));

  const clears = bulkData.filter(item => item.isCleared).map(item => item.entryId);

  // Write scored entries
  for (const update of updates) {
    await replicatedEntriesTable.updateEntry(update.entryId, update.fields);
  }

  // Clear entries
  for (const entryId of clears) {
    await replicatedEntriesTable.updateEntry(entryId, {
      result_status: 'pending',
      is_scored: false,
      search_time_seconds: 0,
      total_faults: 0,
      judge_notes: null,
      final_placement: null,
      scoring_completed_at: null,
    });
  }

  // Invalidate React Query to refresh UI from DB
  queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
};
```

### 4. Status Mapping Helpers

Two small helpers to translate between DB `result_status` values and display `QualificationStatus`:

```typescript
// DB → display
function mapResultStatusToQualification(resultStatus: string | null): QualificationStatus | '' {
  const map: Record<string, QualificationStatus> = {
    qualified: 'Qualified',
    nq: 'Not Qualified',
    absent: 'Absent',
    excused: 'Excused',
    withdrawn: 'Withdrawn',
  };
  return resultStatus ? (map[resultStatus] ?? '') : '';
}

// Display → DB
function mapQualificationToResultStatus(qualification: QualificationStatus | ''): string {
  const map: Record<string, string> = {
    Qualified: 'qualified',
    'Not Qualified': 'nq',
    Absent: 'absent',
    Excused: 'excused',
    Withdrawn: 'withdrawn',
    Eliminated: 'nq',
  };
  return qualification ? (map[qualification] ?? 'pending') : 'pending';
}
```

### 5. Simplified `isEntryScored`

```typescript
function isEntryScored(entry: Record<string, unknown>): boolean {
  if (entry.is_scored === true) return true;
  const status = entry.result_status as string;
  return !!status && status !== 'pending';
}
```

### 6. Clear Button Per Row

Add a clear/reset button to each entry row in the table (and card view). Visible only on scored entries:

```tsx
// In column definition
{
  id: 'clear',
  header: '',
  cell: ({ row }) => {
    const entry = row.original;
    if (!entry.hadExistingData && !entry.hasChanges) return null;
    return (
      <Button variant="ghost" size="icon" onClick={() => clearEntry(entry.entryId)}>
        <Eraser className="h-4 w-4" />
      </Button>
    );
  },
}
```

The `clearEntry` function updates local `BulkEntryData` state (marks as cleared) for batch submit.

### 7. Remove Dead Code

After the new path is working:

- Remove `handleResultUpdate` from `ClassDetailsPage/index.tsx` (lines 165-210)
- Remove scoring logic from `buildScentWorkEntries` in `ClassDetailsMain.helpers.ts` (lines 188-237) — replace with pass-through
- Remove the `competitionData`/`judgingState` fallback chain from old `useClassResults` initialization
- Remove `handleResultsSubmit` mapping in `ClassDetailsMain.tsx` (lines 77-113) — replaced by direct write

## Entry Data Flow to ClassResultsTable

Currently ClassResultsTable receives `ScentWorkEntry[]`. After this refactoring, it needs to receive raw entry data that includes DB scoring columns. Two options:

**Option A:** Pass raw DB rows alongside the existing `ScentWorkEntry` array (add an `entryMap` prop with raw data for scoring fields).

**Option B:** Extend `ScentWorkEntry` to carry the raw DB scoring fields through.

Decision: **Option A** — cleaner separation. The `ScentWorkEntry` type keeps its display role, and the scoring fields come from a separate raw data source. `useClassResults` receives the raw entry map alongside the existing entries prop.

## Files Changed (Summary)

### New Files

- `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts` — raw DB query hook
- `apps/myk9show/src/utils/scoringMappings.ts` — result_status ↔ QualificationStatus helpers

### Modified Files

- `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts` — rewrite initialization + submit to use DB columns
- `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` — add clear button column, pass raw entry data, simplify `isEntryScored`
- `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` — remove `handleResultsSubmit`, pass raw entries to table
- `apps/myk9show/src/pages/ClassDetailsPage/index.tsx` — remove `handleResultUpdate`, wire raw entry data
- `apps/myk9show/src/pages/ClassDetailsPage/useClassDetailsData.ts` — add raw entry query, remove qualification from `ClassEntryDisplay` mapping

### Removed Code (within modified files)

- `buildScentWorkEntries` scoring reconstruction logic
- `handleResultUpdate` qualification → result_status mapping
- `handleResultsSubmit` intermediate mapping
- `useClassResults` dual-source fallback chain

## Testing

- **Clear button:** Clicking clear on a scored entry writes `result_status: 'pending'` to DB, entry moves to Pending tab
- **Bulk submit:** Editing qualification + time + faults, submitting, entry persists after page reload
- **Page reload:** Scored entries show correct data after full reload (proves DB is the source of truth, not stale store)
- **Pending/Completed tabs:** Entries sort correctly based on `result_status` from DB
- **Scoresheet flow:** Scoring via scoresheet page still works (unchanged — already writes to DB directly)

## Out of Scope

- Scoresheet pages (ScoresheetPage, SecretaryScoringPage) — already write directly to DB, no changes
- Entry registration flow — untouched
- Check-in status system — untouched (already uses direct DB path)
- Multi-area scoring — future enhancement, same pattern will apply
