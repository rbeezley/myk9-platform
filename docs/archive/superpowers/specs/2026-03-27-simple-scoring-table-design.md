# Simple Scoring Table — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Replaces:** `2026-03-27-simplified-scoring-data-flow-design.md` (partially implemented, still had timing/complexity issues)

## Problem

The scoring table has gone through multiple refactoring attempts but remains fragile due to too many data layers, race conditions between local store and DB queries, and complex initialization guards. The fundamental issue: trying to merge two async data sources (local Zustand store + DB React Query) into a synchronized edit buffer.

## Solution

Strip it down to the simplest possible thing: **the table is a form over raw DB rows.**

### Architecture

```
Raw DB rows (useClassEntriesRaw)
  → Render table cells
  → User edits stored in Map<entryId, edits>
  → Submit writes edits to replicatedEntriesTable.updateEntry()
  → Done
```

No `ScentWorkEntry`. No `CompetitionData`. No `judgingState`. No `BulkEntryData` rebuild. No dual-source init. No version key tracking.

## Data Model

### Source of Truth

`useClassEntriesRaw(classId)` returns `RawEntryRow[]` — raw DB rows with all columns including scoring fields and dog join data. Already exists.

### Edit Buffer

```typescript
type ScoringEdits = Map<
  string,
  {
    qualification?: QualificationStatus | '';
    qualificationReason?: string;
    searchTime?: string; // MM:SS.HH display format
    faults?: string;
    notes?: string;
  }
>;
```

Simple `useState<ScoringEdits>`. Only stores fields the user has changed. Cleared after submit.

### Just-Scored Set

```typescript
const [justScoredIds, setJustScoredIds] = useState<Set<string>>(new Set());
```

Tracks entries scored in this session (for immediate Pending → Completed tab move before DB sync).

## Display Logic

For each cell, merge raw DB data with edit buffer:

```typescript
function getDisplayValue(entryId: string, field: string) {
  const edits = editBuffer.get(entryId);
  if (edits && field in edits) return edits[field]; // User edit wins

  const raw = rawEntryMap.get(entryId);
  // Fall back to raw DB value
  switch (field) {
    case 'qualification':
      return mapResultStatusToQualification(raw?.result_status);
    case 'searchTime':
      return dbSecondsToInputFormat(raw?.search_time_seconds);
    case 'faults':
      return String(raw?.total_faults ?? 0);
    case 'notes':
      return raw?.judge_notes ?? '';
    default:
      return '';
  }
}
```

Dog name, handler, armband come directly from the raw row's dog join — no intermediate mapping.

## Tab Split (Pending / Completed)

```typescript
function isEntryScored(entryId: string): boolean {
  if (justScoredIds.has(entryId)) return true;
  const raw = rawEntryMap.get(entryId);
  if (!raw) return false;
  return raw.is_scored === true || (!!raw.result_status && raw.result_status !== 'pending');
}
```

## Submit Flow

1. Validate all edited entries:
   - Qualified → must have time
   - NQ/Excused/Withdrawn → must have reason
   - Time without qualification → error
2. Calculate placements (sort Qualified entries by faults then time)
3. Write each entry to `replicatedEntriesTable.updateEntry()`:
   ```typescript
   {
     result_status: mapQualificationToResultStatus(qualification),
     search_time_seconds: inputFormatToDbSeconds(searchTime),
     total_faults: parseInt(faults) || 0,
     judge_notes: notes || null,
     final_placement: calculatedPlacement,
     is_scored: true,
     scoring_completed_at: new Date().toISOString(),
   }
   ```
4. Add scored entry IDs to `justScoredIds`
5. Clear the edit buffer
6. Show success toast

## Clear Flow

Per-entry clear button (Eraser icon). On click:

```typescript
replicatedEntriesTable.updateEntry(entryId, {
  result_status: 'pending',
  is_scored: false,
  search_time_seconds: 0,
  total_faults: 0,
  judge_notes: null,
  final_placement: null,
  scoring_completed_at: null,
  disqualification_reason: null,
});
justScoredIds.delete(entryId);
editBuffer.delete(entryId);
```

Writes defaults directly. Entry moves back to Pending tab.

## Validation

Only on submit — no live "Invalid"/"Valid" badges while editing. If validation fails, show error toast with the specific issue and don't submit.

## What Gets Replaced

The entire `useClassResults.ts` hook (currently ~350 lines) gets replaced with ~100 lines of:

- `useState` for edit buffer and just-scored set
- `getDisplayValue` helper
- `handleFieldChange` (writes to edit buffer)
- `handleSubmit` (validate → calculate placements → write to DB)
- `handleClear` (write defaults to DB)

The `BulkEntryData` type, `ResultsSummary`, initialization `useEffect`, `updateBulkData`, `handleKeyDown`, and all the guard logic are deleted.

## What Stays

- `ClassResultsTable/index.tsx` — column definitions, table rendering, card view
- `ClassResultsTable/utils.ts` — `calculatePlacements`, `formatPlacement`, `getPlacementBadgeClass`, `validateEntry` (simplified)
- `ClassResultsTable/QualificationCell.tsx` — dropdown UI
- `ClassResultsTable/StatusBadge.tsx` — simplified (just shows "Scored"/"Pending" based on DB)
- `ClassResultsTable/constants.ts` — qualification reasons, navigable fields
- `useClassEntriesRaw` hook — raw DB query
- `scoringMappings.ts` — DB ↔ display conversion helpers

## What's NOT Changing

- Scoresheet pages (ScoresheetPage, SecretaryScoringPage) — already write directly to DB
- Check-in status system — unrelated
- Entry registration flow — unrelated
- Card view — uses same data, just different rendering

## Files Changed

### Rewritten

- `apps/myk9show/src/components/classes/ClassResultsTable/useClassResults.ts` — complete rewrite (~100 lines)
- `apps/myk9show/src/components/classes/ClassResultsTable/types.ts` — simplify types

### Modified

- `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` — update column cell renderers to use `getDisplayValue` + `handleFieldChange` instead of `BulkEntryData` props
- `apps/myk9show/src/components/classes/ClassResultsTable/StatusBadge.tsx` — simplify to show Scored/Pending
- `apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx` — wire to new edit buffer pattern
- `apps/myk9show/src/components/classes/ClassResultsTable/utils.ts` — simplify `validateEntry`

### No Changes

- `apps/myk9show/src/hooks/queries/useClassEntriesRaw.ts` — already correct
- `apps/myk9show/src/utils/scoringMappings.ts` — already correct
- `apps/myk9show/src/components/classes/ClassDetailsMain.tsx` — passes rawEntries through
- `apps/myk9show/src/pages/ClassDetailsPage/` — wires rawEntries through

## Testing

- Score a Qualified entry with time + faults → submit → entry moves to Completed, data persists on reload
- Score an NQ entry without time → submit → works (no "Invalid" error)
- Clear a scored entry → entry moves back to Pending, fields reset
- Hard refresh → scored data still shows (came from DB)
- Offline: score entry → submit → entry moves to Completed locally → sync when online
- Edit multiple entries → submit all at once → all persist
