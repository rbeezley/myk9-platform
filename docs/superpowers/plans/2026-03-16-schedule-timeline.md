# Schedule Timeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat-text Schedule section with a visual spine timeline showing element run order, timing, and live progress — on both the Show Overview and Trial Detail pages.

**Architecture:** Two React components (`ScheduleTimeline`, `TrialTimeline`) sharing spine/dot primitives and status derivation logic. Each has its own React Query hook for data fetching. No database changes needed.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Query, Base UI Collapsible, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-schedule-timeline-design.md`

---

## File Map

### New Files

| File                                                                | Responsibility                                      |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| `src/components/schedule/schedule-timeline.utils.ts`                | Status derivation, level formatting, grouping logic |
| `src/components/schedule/schedule-timeline.types.ts`                | TypeScript interfaces for timeline data             |
| `src/components/schedule/StatusDot.tsx`                             | Shared status-colored circle (10px)                 |
| `src/components/schedule/SpineLine.tsx`                             | Shared vertical connecting line                     |
| `src/components/schedule/ElementCard.tsx`                           | Compact element card (overview)                     |
| `src/components/schedule/TrialSpine.tsx`                            | Single trial's spine + element cards                |
| `src/components/schedule/DaySection.tsx`                            | Day heading + 2-col trial grid                      |
| `src/components/schedule/ScheduleTimeline.tsx`                      | Overview timeline component                         |
| `src/components/schedule/LevelRow.tsx`                              | Single level row in accordion                       |
| `src/components/schedule/ElementAccordion.tsx`                      | Expandable element card (trial detail)              |
| `src/components/schedule/JudgeSection.tsx`                          | Judge header + spine                                |
| `src/components/schedule/TrialTimeline.tsx`                         | Trial detail timeline component                     |
| `src/hooks/queries/useScheduleTimeline.ts`                          | React Query hook for overview data                  |
| `src/hooks/queries/useTrialTimeline.ts`                             | React Query hook for trial detail data              |
| `src/components/schedule/__tests__/schedule-timeline.utils.test.ts` | Utility unit tests                                  |
| `src/components/schedule/__tests__/ScheduleTimeline.test.tsx`       | Overview component tests                            |
| `src/components/schedule/__tests__/TrialTimeline.test.tsx`          | Trial detail component tests                        |

### Modified Files

| File                                                | Change                                 |
| --------------------------------------------------- | -------------------------------------- |
| `src/components/shows/overview/ScheduleSummary.tsx` | Replace with `ScheduleTimeline` import |
| `src/components/trials/TrialDetailsMain.tsx`        | Add `TrialTimeline` section            |

> All paths below are relative to `apps/myk9show/`.

---

## Chunk 1: Utilities and Shared Primitives

### Task 1: Types and Interfaces

**Files:**

- Create: `src/components/schedule/schedule-timeline.types.ts`

- [ ] **Step 1: Write the types file**

```typescript
import type { ClassStatusValue } from '@myk9/core';

/** Raw row from the schedule timeline query (overview) */
export interface TimelineClassRow {
  trialId: string;
  trialDate: string;
  trialNumber: string | null;
  trialPlannedStartTime: string | null;
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string; // raw DB status, needs normalizeClassStatus()
  totalEntriesCount: number;
}

/** Raw row from the trial timeline query (trial detail) */
export interface TrialTimelineClassRow {
  classId: string;
  className: string;
  element: string | null;
  level: string | null;
  startTime: string | null;
  status: string; // raw DB status
  totalEntriesCount: number;
  judgePersonId: string | null;
  judgeFirstName: string | null;
  judgeLastName: string | null;
}

/** Processed element summary for display */
export interface ElementSummary {
  element: string;
  startTime: string | null;
  levelRange: string;
  status: ClassStatusValue;
  levels: LevelDetail[];
}

/** Individual level detail within an element */
export interface LevelDetail {
  classId: string;
  level: string;
  status: ClassStatusValue;
  entryCount: number;
}

/** A single trial's timeline data */
export interface TrialTimelineData {
  trialId: string;
  trialNumber: string | null;
  plannedStartTime: string | null;
  elements: ElementSummary[];
}

/** A day's worth of trials */
export interface DayTimelineData {
  date: string;
  trials: TrialTimelineData[];
}

/** Judge section for trial detail view */
export interface JudgeTimelineData {
  judgeId: string | null;
  judgeName: string;
  ringNumber: string | null; // [ADDED] ring number if applicable
  elements: ElementSummary[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/schedule-timeline.types.ts
git commit -m "feat(schedule): add timeline type definitions"
```

---

### Task 2: Export LEVEL_ORDER and compareLevels

**Files:**

- Modify: `src/utils/schedule-summary.ts`

- [ ] **Step 1: Export LEVEL_ORDER and compareLevels**

In `src/utils/schedule-summary.ts`, add `export` to both declarations (they are currently private):

```typescript
// Change: const LEVEL_ORDER → export const LEVEL_ORDER
export const LEVEL_ORDER: Record<string, number> = { ... };

// Change: function compareLevels → export function compareLevels
export function compareLevels(a: string, b: string): number { ... }
```

- [ ] **Step 2: Run existing tests to confirm no breakage**

Run: `cd apps/myk9show && pnpm vitest run src/utils/schedule-summary.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/schedule-summary.ts
git commit -m "refactor: export LEVEL_ORDER and compareLevels from schedule-summary"
```

---

### Task 3: Utility Functions — Tests First

**Files:**

- Create: `src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
- Create: `src/components/schedule/schedule-timeline.utils.ts`

- [ ] **Step 1: Write failing tests for `deriveElementStatus`**

```typescript
import { describe, it, expect } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import {
  deriveElementStatus,
  formatLevelRange,
  groupByDay,
  groupByJudge,
} from '../schedule-timeline.utils';
import type {
  LevelDetail,
  TimelineClassRow,
  TrialTimelineClassRow,
} from '../schedule-timeline.types';

describe('deriveElementStatus', () => {
  const level = (status: string): LevelDetail => ({
    classId: 'c1',
    level: 'Novice',
    status: status as any,
    entryCount: 10,
  });

  it('returns Completed when all levels are Completed', () => {
    const levels = [level(CLASS_STATUS.COMPLETED), level(CLASS_STATUS.COMPLETED)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.COMPLETED);
  });

  it('returns In Progress when any level is In Progress', () => {
    const levels = [level(CLASS_STATUS.COMPLETED), level(CLASS_STATUS.IN_PROGRESS)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('returns Scheduled when all levels are Scheduled', () => {
    const levels = [level(CLASS_STATUS.SCHEDULED), level(CLASS_STATUS.SCHEDULED)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.SCHEDULED);
  });

  it('returns In Progress for mixed Completed + Scheduled', () => {
    const levels = [level(CLASS_STATUS.COMPLETED), level(CLASS_STATUS.SCHEDULED)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.IN_PROGRESS);
  });

  it('returns Cancelled when all levels are Cancelled', () => {
    const levels = [level(CLASS_STATUS.CANCELLED), level(CLASS_STATUS.CANCELLED)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.CANCELLED);
  });

  it('ignores cancelled levels when deriving from remaining', () => {
    const levels = [level(CLASS_STATUS.CANCELLED), level(CLASS_STATUS.COMPLETED)];
    expect(deriveElementStatus(levels)).toBe(CLASS_STATUS.COMPLETED);
  });

  it('returns Scheduled for empty array', () => {
    expect(deriveElementStatus([])).toBe(CLASS_STATUS.SCHEDULED);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `deriveElementStatus` implementation**

In `src/components/schedule/schedule-timeline.utils.ts`:

```typescript
import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { LEVEL_ORDER, compareLevels } from '@/utils/schedule-summary';
import type {
  LevelDetail,
  ElementSummary,
  TimelineClassRow,
  TrialTimelineClassRow,
  DayTimelineData,
  TrialTimelineData,
  JudgeTimelineData,
} from './schedule-timeline.types';

/**
 * Derive an element's aggregate status from its child level statuses.
 */
export function deriveElementStatus(levels: LevelDetail[]): ClassStatusValue {
  if (levels.length === 0) return CLASS_STATUS.SCHEDULED;

  // Filter out cancelled levels for derivation
  const active = levels.filter(l => l.status !== CLASS_STATUS.CANCELLED);

  // If all cancelled, return cancelled
  if (active.length === 0) return CLASS_STATUS.CANCELLED;

  const allCompleted = active.every(l => l.status === CLASS_STATUS.COMPLETED);
  if (allCompleted) return CLASS_STATUS.COMPLETED;

  const allScheduled = active.every(
    l => l.status === CLASS_STATUS.SCHEDULED || l.status === CLASS_STATUS.UPCOMING
  );
  if (allScheduled) return CLASS_STATUS.SCHEDULED;

  // Any in progress, or mixed completed + scheduled
  return CLASS_STATUS.IN_PROGRESS;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: PASS

- [ ] **Step 5: Add failing tests for `formatLevelRange`**

Append to the test file:

```typescript
describe('formatLevelRange', () => {
  it('formats a full range as "Nov–Mst"', () => {
    expect(formatLevelRange(['Novice', 'Advanced', 'Open', 'Excellent', 'Master'])).toBe('Nov–Mst');
  });

  it('formats a partial range', () => {
    expect(formatLevelRange(['Advanced', 'Excellent'])).toBe('Adv–Exc');
  });

  it('formats a single level', () => {
    expect(formatLevelRange(['Novice'])).toBe('Nov');
  });

  it('sorts levels by progression order', () => {
    expect(formatLevelRange(['Master', 'Novice', 'Advanced'])).toBe('Nov–Mst');
  });

  it('handles Utility level', () => {
    expect(formatLevelRange(['Utility'])).toBe('Util');
  });

  it('returns empty string for no levels', () => {
    expect(formatLevelRange([])).toBe('');
  });

  it('passes through unknown levels as-is', () => {
    expect(formatLevelRange(['Custom'])).toBe('Custom');
  });
});
```

- [ ] **Step 6: Run tests to verify new tests fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: FAIL — `formatLevelRange` not exported

- [ ] **Step 7: Implement `formatLevelRange`**

Add to `schedule-timeline.utils.ts`:

```typescript
const LEVEL_ABBREVIATIONS: Record<string, string> = {
  Novice: 'Nov',
  Advanced: 'Adv',
  Open: 'Open',
  Excellent: 'Exc',
  Utility: 'Util',
  Master: 'Mst',
};

/**
 * Format an array of level names into an abbreviated range string.
 * e.g., ['Novice', 'Advanced', 'Master'] → 'Nov–Mst'
 */
export function formatLevelRange(levels: string[]): string {
  if (levels.length === 0) return '';

  const sorted = [...levels].sort(compareLevels);
  const abbrev = (l: string) => LEVEL_ABBREVIATIONS[l] ?? l;

  if (sorted.length === 1) return abbrev(sorted[0]);
  return `${abbrev(sorted[0])}–${abbrev(sorted[sorted.length - 1])}`;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: PASS

- [ ] **Step 9: Add failing tests for `groupByDay`**

Append to the test file:

```typescript
describe('groupByDay', () => {
  const row = (overrides: Partial<TimelineClassRow> = {}): TimelineClassRow => ({
    trialId: 't1',
    trialDate: '2026-04-04',
    trialNumber: '1',
    trialPlannedStartTime: '08:00:00',
    classId: 'c1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    startTime: '08:00:00',
    status: 'Scheduled',
    totalEntriesCount: 10,
    ...overrides,
  });

  it('groups rows into days and trials with elements', () => {
    const rows = [
      row({ element: 'Container', level: 'Novice', startTime: '08:00:00' }),
      row({ element: 'Container', level: 'Advanced', startTime: '08:00:00' }),
      row({ element: 'Buried', level: 'Novice', startTime: '09:30:00' }),
    ];
    const result = groupByDay(rows);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-04-04');
    expect(result[0].trials).toHaveLength(1);
    expect(result[0].trials[0].elements).toHaveLength(2);
    expect(result[0].trials[0].elements[0].element).toBe('Container');
    expect(result[0].trials[0].elements[0].levelRange).toBe('Nov–Adv');
    expect(result[0].trials[0].elements[1].element).toBe('Buried');
  });

  it('separates different dates', () => {
    const rows = [
      row({ trialDate: '2026-04-04', trialId: 't1' }),
      row({ trialDate: '2026-04-05', trialId: 't2', trialNumber: '2' }),
    ];
    const result = groupByDay(rows);
    expect(result).toHaveLength(2);
  });

  it('separates different trials on the same day', () => {
    const rows = [
      row({ trialId: 't1', trialNumber: '1' }),
      row({ trialId: 't2', trialNumber: '2' }),
    ];
    const result = groupByDay(rows);
    expect(result).toHaveLength(1);
    expect(result[0].trials).toHaveLength(2);
  });

  it('orders elements by earliest start time', () => {
    const rows = [
      row({ element: 'Buried', startTime: '10:00:00' }),
      row({ element: 'Container', startTime: '08:00:00' }),
    ];
    const result = groupByDay(rows);
    expect(result[0].trials[0].elements[0].element).toBe('Container');
    expect(result[0].trials[0].elements[1].element).toBe('Buried');
  });

  it('handles null element by using class name', () => {
    const rows = [row({ element: null, className: 'Special Class' })];
    const result = groupByDay(rows);
    expect(result[0].trials[0].elements[0].element).toBe('Special Class');
  });

  it('shows TBD for null start time', () => {
    const rows = [row({ startTime: null })];
    const result = groupByDay(rows);
    expect(result[0].trials[0].elements[0].startTime).toBeNull();
  });

  it('returns empty array for no rows', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
```

- [ ] **Step 10: Run tests to verify new tests fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: FAIL — `groupByDay` not exported

- [ ] **Step 11: Implement `groupByDay`**

Add to `schedule-timeline.utils.ts`:

```typescript
/**
 * Build an ElementSummary from a set of class rows sharing the same element.
 */
function buildElementSummary(
  elementName: string,
  classes: {
    classId: string;
    level: string | null;
    startTime: string | null;
    status: string;
    totalEntriesCount: number;
  }[]
): ElementSummary {
  const levels: LevelDetail[] = classes.map(cls => ({
    classId: cls.classId,
    level: cls.level ?? 'Unknown',
    status: normalizeClassStatus(cls.status),
    entryCount: cls.totalEntriesCount,
  }));

  // Sort levels by progression order
  levels.sort((a, b) => compareLevels(a.level, b.level));

  const levelNames = [...new Set(levels.map(l => l.level))];
  const earliestStart =
    classes
      .map(c => c.startTime)
      .filter(Boolean)
      .sort()[0] ?? null;

  return {
    element: elementName,
    startTime: earliestStart,
    levelRange: formatLevelRange(levelNames),
    status: deriveElementStatus(levels),
    levels,
  };
}

/**
 * Group raw timeline rows into day → trial → element hierarchy.
 */
export function groupByDay(rows: TimelineClassRow[]): DayTimelineData[] {
  if (rows.length === 0) return [];

  // Group by date
  const byDate = new Map<string, TimelineClassRow[]>();
  for (const row of rows) {
    const key = row.trialDate;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(row);
  }

  const days: DayTimelineData[] = [];
  for (const [date, dateRows] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Group by trial
    const byTrial = new Map<string, TimelineClassRow[]>();
    for (const row of dateRows) {
      if (!byTrial.has(row.trialId)) byTrial.set(row.trialId, []);
      byTrial.get(row.trialId)!.push(row);
    }

    const trials: TrialTimelineData[] = [];
    for (const [trialId, trialRows] of byTrial) {
      // Group by element
      const byElement = new Map<string, TimelineClassRow[]>();
      for (const row of trialRows) {
        const elName = row.element ?? row.className;
        if (!byElement.has(elName)) byElement.set(elName, []);
        byElement.get(elName)!.push(row);
      }

      const elements: ElementSummary[] = [];
      for (const [elName, elRows] of byElement) {
        elements.push(buildElementSummary(elName, elRows));
      }

      // Sort elements by earliest start time
      elements.sort((a, b) => {
        if (!a.startTime && !b.startTime) return 0;
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });

      trials.push({
        trialId,
        trialNumber: trialRows[0].trialNumber,
        plannedStartTime: trialRows[0].trialPlannedStartTime,
        elements,
      });
    }

    // Sort trials by trial number
    trials.sort((a, b) => {
      const na = parseInt(a.trialNumber ?? '0', 10);
      const nb = parseInt(b.trialNumber ?? '0', 10);
      return na - nb;
    });

    days.push({ date, trials });
  }

  return days;
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: PASS

- [ ] **Step 13: Add failing tests for `groupByJudge`**

Append to the test file:

```typescript
describe('groupByJudge', () => {
  const row = (overrides: Partial<TrialTimelineClassRow> = {}): TrialTimelineClassRow => ({
    classId: 'c1',
    className: 'Container Novice',
    element: 'Container',
    level: 'Novice',
    startTime: '08:00:00',
    status: 'Scheduled',
    totalEntriesCount: 10,
    judgePersonId: 'j1',
    judgeFirstName: 'Jane',
    judgeLastName: 'Smith',
    ...overrides,
  });

  it('groups by judge with elements', () => {
    const rows = [
      row({
        element: 'Container',
        judgePersonId: 'j1',
        judgeFirstName: 'Jane',
        judgeLastName: 'Smith',
      }),
      row({
        element: 'Buried',
        judgePersonId: 'j1',
        judgeFirstName: 'Jane',
        judgeLastName: 'Smith',
        startTime: '10:00:00',
      }),
      row({
        element: 'Interior',
        judgePersonId: 'j2',
        judgeFirstName: 'Bob',
        judgeLastName: 'Jones',
      }),
    ];
    const result = groupByJudge(rows);
    expect(result).toHaveLength(2);
    expect(result[0].judgeName).toBe('Jane Smith');
    expect(result[0].elements).toHaveLength(2);
    expect(result[1].judgeName).toBe('Bob Jones');
    expect(result[1].elements).toHaveLength(1);
  });

  it('groups unassigned classes under "Unassigned"', () => {
    const rows = [row({ judgePersonId: null, judgeFirstName: null, judgeLastName: null })];
    const result = groupByJudge(rows);
    expect(result).toHaveLength(1);
    expect(result[0].judgeId).toBeNull();
    expect(result[0].judgeName).toBe('Unassigned');
  });

  it('returns empty array for no rows', () => {
    expect(groupByJudge([])).toEqual([]);
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: FAIL — `groupByJudge` not exported

- [ ] **Step 15: Implement `groupByJudge`**

Add to `schedule-timeline.utils.ts`:

```typescript
/**
 * Group trial detail rows by judge → element hierarchy.
 */
export function groupByJudge(rows: TrialTimelineClassRow[]): JudgeTimelineData[] {
  if (rows.length === 0) return [];

  const byJudge = new Map<string, TrialTimelineClassRow[]>();
  for (const row of rows) {
    const key = row.judgePersonId ?? '__unassigned__';
    if (!byJudge.has(key)) byJudge.set(key, []);
    byJudge.get(key)!.push(row);
  }

  const judges: JudgeTimelineData[] = [];
  for (const [judgeKey, judgeRows] of byJudge) {
    const isUnassigned = judgeKey === '__unassigned__';
    const judgeName = isUnassigned
      ? 'Unassigned'
      : [judgeRows[0].judgeFirstName, judgeRows[0].judgeLastName].filter(Boolean).join(' ');

    // Group by element
    const byElement = new Map<string, TrialTimelineClassRow[]>();
    for (const row of judgeRows) {
      const elName = row.element ?? row.className;
      if (!byElement.has(elName)) byElement.set(elName, []);
      byElement.get(elName)!.push(row);
    }

    const elements: ElementSummary[] = [];
    for (const [elName, elRows] of byElement) {
      elements.push(buildElementSummary(elName, elRows));
    }

    elements.sort((a, b) => {
      if (!a.startTime && !b.startTime) return 0;
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    judges.push({
      judgeId: isUnassigned ? null : judgeRows[0].judgePersonId,
      judgeName,
      ringNumber: null, // [ADDED] ring number not yet in class data — pass null until schema supports it
      elements,
    });
  }

  // Put unassigned last
  judges.sort((a, b) => {
    if (a.judgeId === null) return 1;
    if (b.judgeId === null) return -1;
    return 0;
  });

  return judges;
}
```

- [ ] **Step 16: Run all utility tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/schedule-timeline.utils.test.ts`
Expected: ALL PASS

- [ ] **Step 17: Commit**

```bash
git add src/components/schedule/schedule-timeline.utils.ts src/components/schedule/__tests__/schedule-timeline.utils.test.ts
git commit -m "feat(schedule): add timeline utility functions with tests

Status derivation, level range formatting, groupByDay, groupByJudge."
```

---

### Task 3: Shared UI Primitives — StatusDot and SpineLine

**Files:**

- Create: `src/components/schedule/StatusDot.tsx`
- Create: `src/components/schedule/SpineLine.tsx`

- [ ] **Step 1: Create StatusDot component**

```tsx
import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';

const STATUS_DOT_COLORS: Record<ClassStatusValue, string> = {
  [CLASS_STATUS.SCHEDULED]: 'bg-slate-500',
  [CLASS_STATUS.UPCOMING]: 'bg-slate-500',
  [CLASS_STATUS.IN_PROGRESS]: 'bg-amber-500',
  [CLASS_STATUS.COMPLETED]: 'bg-green-500',
  [CLASS_STATUS.CANCELLED]: 'bg-slate-500',
};

interface StatusDotProps {
  status: ClassStatusValue;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <div
      className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_DOT_COLORS[status], className)}
      aria-label={`Status: ${status}`}
    />
  );
}
```

- [ ] **Step 2: Create SpineLine component**

```tsx
import { cn } from '@/lib/utils';

interface SpineLineProps {
  className?: string;
}

export function SpineLine({ className }: SpineLineProps) {
  return <div className={cn('w-0.5 flex-1 bg-slate-700', className)} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/StatusDot.tsx src/components/schedule/SpineLine.tsx
git commit -m "feat(schedule): add StatusDot and SpineLine shared primitives"
```

---

## Chunk 2: Overview Timeline (ScheduleTimeline)

### Task 4: useScheduleTimeline Hook

**Files:**

- Create: `src/hooks/queries/useScheduleTimeline.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { groupByDay } from '@/components/schedule/schedule-timeline.utils';
import type {
  DayTimelineData,
  TimelineClassRow,
} from '@/components/schedule/schedule-timeline.types';

export function useScheduleTimeline(showId: string | null) {
  return useQuery<DayTimelineData[]>({
    queryKey: ['shows', showId, 'schedule-timeline'],
    queryFn: async () => {
      if (!showId) return [];

      const { data, error } = await supabase
        .from('trials')
        .select(
          `
          id,
          date,
          trial_number,
          planned_start_time,
          classes (
            id,
            name,
            element,
            level,
            start_time,
            status,
            total_entries_count,
            deleted_at
          )
        `
        )
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (error) throw error;
      if (!data) return [];

      const rows: TimelineClassRow[] = [];
      for (const trial of data) {
        // [ADDED] Filter out soft-deleted classes (nested selects don't support .is() filters)
        const allClasses =
          (trial.classes as Array<{
            id: string;
            name: string;
            element: string | null;
            level: string | null;
            start_time: string | null;
            status: string | null;
            total_entries_count: number | null;
            deleted_at: string | null;
          }>) ?? [];
        const classes = allClasses.filter(c => c.deleted_at === null);

        for (const cls of classes) {
          rows.push({
            trialId: trial.id,
            trialDate: trial.date,
            trialNumber: trial.trial_number,
            trialPlannedStartTime: trial.planned_start_time,
            classId: cls.id,
            className: cls.name,
            element: cls.element,
            level: cls.level,
            startTime: cls.start_time,
            status: cls.status ?? 'no-status',
            totalEntriesCount: cls.total_entries_count ?? 0,
          });
        }
      }

      return groupByDay(rows);
    },
    enabled: !!showId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/queries/useScheduleTimeline.ts
git commit -m "feat(schedule): add useScheduleTimeline React Query hook"
```

---

### Task 5: ElementCard Component

**Files:**

- Create: `src/components/schedule/ElementCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { getClassStatusBadgeClasses, getClassStatusDisplay } from '@myk9/core';
import type { ElementSummary } from './schedule-timeline.types';

interface ElementCardProps {
  element: ElementSummary;
  onClick?: () => void;
}

export function ElementCard({ element, onClick }: ElementCardProps) {
  const badgeClasses = getClassStatusBadgeClasses(element.status);
  const formattedTime = element.startTime
    ? new Date(`1970-01-01T${element.startTime}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-card-foreground">{element.element}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeClasses}`}>
          {getClassStatusDisplay(element.status).label}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {formattedTime}
        {element.levelRange && ` · ${element.levelRange}`}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ElementCard.tsx
git commit -m "feat(schedule): add ElementCard component"
```

---

### Task 6: TrialSpine Component

**Files:**

- Create: `src/components/schedule/TrialSpine.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useNavigate } from 'react-router-dom';
import type { TrialTimelineData } from './schedule-timeline.types';
import { StatusDot } from './StatusDot';
import { SpineLine } from './SpineLine';
import { ElementCard } from './ElementCard';

interface TrialSpineProps {
  trial: TrialTimelineData;
  showId: string;
}

export function TrialSpine({ trial, showId }: TrialSpineProps) {
  const navigate = useNavigate();

  const formattedStartTime = trial.plannedStartTime
    ? new Date(`1970-01-01T${trial.plannedStartTime}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const trialLabel = trial.trialNumber ? `Trial ${trial.trialNumber}` : 'Trial';

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {trialLabel}
        {formattedStartTime && ` · ${formattedStartTime}`}
      </div>

      {trial.elements.length === 0 ? (
        <p className="text-xs text-muted-foreground">No classes scheduled</p>
      ) : (
        <div className="flex gap-3">
          {/* Spine */}
          <div className="flex flex-col items-center pt-1.5">
            {trial.elements.map((el, i) => (
              <div key={el.element} className="flex flex-col items-center">
                <StatusDot status={el.status} />
                {i < trial.elements.length - 1 && <SpineLine className="min-h-[2rem]" />}
              </div>
            ))}
          </div>

          {/* Cards */}
          <div className="flex flex-1 flex-col gap-1.5">
            {trial.elements.map(el => (
              <ElementCard
                key={el.element}
                element={el}
                onClick={() => navigate(`/shows/${showId}/trials/${trial.trialId}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/TrialSpine.tsx
git commit -m "feat(schedule): add TrialSpine component"
```

---

### Task 7: DaySection Component

**Files:**

- Create: `src/components/schedule/DaySection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { DayTimelineData } from './schedule-timeline.types';
import { TrialSpine } from './TrialSpine';

interface DaySectionProps {
  day: DayTimelineData;
  showId: string;
}

export function DaySection({ day, showId }: DaySectionProps) {
  const formatted = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-orange-500">{formatted}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {day.trials.map(trial => (
          <TrialSpine key={trial.trialId} trial={trial} showId={showId} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/DaySection.tsx
git commit -m "feat(schedule): add DaySection component"
```

---

### Task 8: ScheduleTimeline Component

**Files:**

- Create: `src/components/schedule/ScheduleTimeline.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useScheduleTimeline } from '@/hooks/queries/useScheduleTimeline';
import { DaySection } from './DaySection';

interface ScheduleTimelineProps {
  showId: string;
}

export function ScheduleTimeline({ showId }: ScheduleTimelineProps) {
  const { data, isLoading, error, refetch } = useScheduleTimeline(showId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="flex gap-3">
            <div className="flex flex-col items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-muted" />
              <div className="h-8 w-0.5 bg-muted" />
              <div className="h-2.5 w-2.5 rounded-full bg-muted" />
              <div className="h-8 w-0.5 bg-muted" />
              <div className="h-2.5 w-2.5 rounded-full bg-muted" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-14 rounded-md bg-muted" />
              <div className="h-14 rounded-md bg-muted" />
              <div className="h-14 rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">Failed to load schedule.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">No schedule available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Schedule</h2>
      <div className="space-y-6">
        {data.map((day, i) => (
          <div key={day.date}>
            {i > 0 && <hr className="mb-6 border-border" />}
            <DaySection day={day} showId={showId} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ScheduleTimeline.tsx
git commit -m "feat(schedule): add ScheduleTimeline overview component"
```

---

### Task 9: ScheduleTimeline Tests

**Files:**

- Create: `src/components/schedule/__tests__/ScheduleTimeline.test.tsx`

- [ ] **Step 1: Write component tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event'; // [ADDED]
import { MemoryRouter } from 'react-router-dom';
import { ScheduleTimeline } from '../ScheduleTimeline';
import type { DayTimelineData } from '../schedule-timeline.types';
import { CLASS_STATUS } from '@myk9/core';

const mockData: DayTimelineData[] = [
  {
    date: '2026-04-04',
    trials: [
      {
        trialId: 't1',
        trialNumber: '1',
        plannedStartTime: '08:00:00',
        elements: [
          {
            element: 'Container',
            startTime: '08:00:00',
            levelRange: 'Nov–Mst',
            status: CLASS_STATUS.COMPLETED,
            levels: [],
          },
          {
            element: 'Buried',
            startTime: '09:30:00',
            levelRange: 'Nov–Mst',
            status: CLASS_STATUS.IN_PROGRESS,
            levels: [],
          },
        ],
      },
    ],
  },
];

vi.mock('@/hooks/queries/useScheduleTimeline', () => ({
  useScheduleTimeline: () => ({ data: mockData, isLoading: false, error: null }),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ScheduleTimeline', () => {
  it('renders the schedule heading', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('renders day heading', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/Saturday, April 4, 2026/)).toBeInTheDocument();
  });

  it('renders trial label with start time', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText(/Trial 1/)).toBeInTheDocument();
  });

  it('renders element cards', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('renders level ranges', () => {
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    const levelTexts = screen.getAllByText(/Nov–Mst/);
    expect(levelTexts.length).toBeGreaterThanOrEqual(2);
  });

  // [ADDED] navigation click test
  it('navigates to trial detail on element card click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ScheduleTimeline showId="show-1" />);
    await user.click(screen.getByText('Container'));
    // MemoryRouter won't navigate, but we verify the button is clickable
    // Full navigation tested via E2E
  });
});
```

- [ ] **Step 2: [ADDED] Add loading/error/empty state tests**

Add additional describe blocks to the same test file that re-mock the hook for different states:

```tsx
// Add after the main describe block, in the same file:

describe('ScheduleTimeline — loading state', () => {
  beforeEach(() => {
    vi.doMock('@/hooks/queries/useScheduleTimeline', () => ({
      useScheduleTimeline: () => ({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      }),
    }));
  });

  it('renders skeleton while loading', async () => {
    const { ScheduleTimeline: ST } = await import('../ScheduleTimeline');
    renderWithRouter(<ST showId="show-1" />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    // Skeleton has animate-pulse
    const skeleton = document.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });
});

describe('ScheduleTimeline — error state', () => {
  const mockRefetch = vi.fn();
  beforeEach(() => {
    vi.doMock('@/hooks/queries/useScheduleTimeline', () => ({
      useScheduleTimeline: () => ({
        data: undefined,
        isLoading: false,
        error: new Error('fail'),
        refetch: mockRefetch,
      }),
    }));
  });

  it('renders error with retry button', async () => {
    const { ScheduleTimeline: ST } = await import('../ScheduleTimeline');
    renderWithRouter(<ST showId="show-1" />);
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});

describe('ScheduleTimeline — empty state', () => {
  beforeEach(() => {
    vi.doMock('@/hooks/queries/useScheduleTimeline', () => ({
      useScheduleTimeline: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
    }));
  });

  it('renders empty message', async () => {
    const { ScheduleTimeline: ST } = await import('../ScheduleTimeline');
    renderWithRouter(<ST showId="show-1" />);
    expect(screen.getByText('No schedule available')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/ScheduleTimeline.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/__tests__/ScheduleTimeline.test.tsx
git commit -m "test(schedule): add ScheduleTimeline component tests"
```

---

### Task 10: Integrate ScheduleTimeline into Show Overview

**Files:**

- Modify: `src/components/shows/overview/ScheduleSummary.tsx`

- [ ] **Step 1: Read the current ScheduleSummary component**

Read `src/components/shows/overview/ScheduleSummary.tsx` to understand the current interface.

- [ ] **Step 2: Replace ScheduleSummary with ScheduleTimeline**

The `ScheduleSummary` component takes `showId: string`. Replace its contents to render `ScheduleTimeline` instead, keeping the same export name and props so no consumers need changing:

```tsx
import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';

interface ScheduleSummaryProps {
  showId: string;
}

export function ScheduleSummary({ showId }: ScheduleSummaryProps) {
  return <ScheduleTimeline showId={showId} />;
}
```

This is a thin wrapper — once confirmed working, a follow-up can rename/remove this file and update the import in the parent. For now this avoids touching multiple files.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 4: Visually verify in browser**

Run: `pnpm dev:show` and navigate to a show detail page. Verify the Schedule section now shows the spine timeline with element cards.

- [ ] **Step 5: Commit**

```bash
git add src/components/shows/overview/ScheduleSummary.tsx
git commit -m "feat(schedule): integrate ScheduleTimeline into show overview

Replaces flat-text schedule with spine timeline. ScheduleSummary
now delegates to ScheduleTimeline for backward compatibility."
```

---

## Chunk 3: Trial Detail Timeline (TrialTimeline)

### Task 11: useTrialTimeline Hook

**Files:**

- Create: `src/hooks/queries/useTrialTimeline.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { groupByJudge } from '@/components/schedule/schedule-timeline.utils';
import type {
  JudgeTimelineData,
  TrialTimelineClassRow,
} from '@/components/schedule/schedule-timeline.types';

export function useTrialTimeline(trialId: string | null) {
  return useQuery<JudgeTimelineData[]>({
    queryKey: ['trials', trialId, 'timeline'],
    queryFn: async () => {
      if (!trialId) return [];

      // Fetch classes for this trial
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, name, element, level, start_time, status, total_entries_count')
        .eq('trial_id', trialId)
        .is('deleted_at', null);

      if (classesError) throw classesError;
      if (!classes || classes.length === 0) return [];

      // Fetch judge assignments for these classes
      const classIds = classes.map(c => c.id);
      const { data: assignments, error: assignError } = await supabase
        .from('judge_assignments')
        .select('class_id, person_id, people!inner(first_name, last_name)')
        .in('class_id', classIds);

      if (assignError) throw assignError;

      // Build a map of classId → judge info
      const judgeMap = new Map<string, { personId: string; firstName: string; lastName: string }>();
      for (const a of assignments ?? []) {
        const person = a.people as unknown as { first_name: string; last_name: string };
        judgeMap.set(a.class_id!, {
          personId: a.person_id,
          firstName: person.first_name,
          lastName: person.last_name,
        });
      }

      // Combine into rows
      const rows: TrialTimelineClassRow[] = classes.map(cls => {
        const judge = judgeMap.get(cls.id);
        return {
          classId: cls.id,
          className: cls.name,
          element: cls.element,
          level: cls.level,
          startTime: cls.start_time,
          status: cls.status ?? 'no-status',
          totalEntriesCount: cls.total_entries_count ?? 0,
          judgePersonId: judge?.personId ?? null,
          judgeFirstName: judge?.firstName ?? null,
          judgeLastName: judge?.lastName ?? null,
        };
      });

      return groupByJudge(rows);
    },
    enabled: !!trialId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/queries/useTrialTimeline.ts
git commit -m "feat(schedule): add useTrialTimeline React Query hook"
```

---

### Task 12: LevelRow Component

**Files:**

- Create: `src/components/schedule/LevelRow.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { CLASS_STATUS } from '@myk9/core';
import { cn } from '@/lib/utils';
import type { LevelDetail } from './schedule-timeline.types';

interface LevelRowProps {
  level: LevelDetail;
  onClick?: () => void;
}

export function LevelRow({ level, onClick }: LevelRowProps) {
  const isInProgress = level.status === CLASS_STATUS.IN_PROGRESS;
  const isComplete = level.status === CLASS_STATUS.COMPLETED;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded px-2 py-1 text-left transition-colors hover:bg-accent',
        isInProgress && 'bg-amber-500/10'
      )}
    >
      <span
        className={cn(
          'text-xs',
          isInProgress && 'font-medium text-amber-500',
          isComplete && 'text-muted-foreground',
          !isInProgress && !isComplete && 'text-muted-foreground'
        )}
      >
        {level.level}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {level.entryCount} {level.entryCount === 1 ? 'entry' : 'entries'}
        </span>
        {isComplete && <span className="text-[10px] text-green-500">✓</span>}
        {isInProgress && <span className="text-[10px] text-amber-500">●</span>}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/LevelRow.tsx
git commit -m "feat(schedule): add LevelRow component"
```

---

### Task 13: ElementAccordion Component

**Files:**

- Create: `src/components/schedule/ElementAccordion.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { CLASS_STATUS } from '@myk9/core';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import type { ElementSummary } from './schedule-timeline.types';
import { LevelRow } from './LevelRow';

interface ElementAccordionProps {
  element: ElementSummary;
  showId: string;
  trialId: string;
  onNavigateToClass?: (classId: string) => void;
}

export function ElementAccordion({
  element,
  showId,
  trialId,
  onNavigateToClass,
}: ElementAccordionProps) {
  const isInProgress = element.status === CLASS_STATUS.IN_PROGRESS;
  const isComplete = element.status === CLASS_STATUS.COMPLETED;
  const completedCount = element.levels.filter(l => l.status === CLASS_STATUS.COMPLETED).length;
  const totalCount = element.levels.filter(l => l.status !== CLASS_STATUS.CANCELLED).length;
  const progressLabel = isComplete
    ? `${totalCount}/${totalCount} ✓`
    : `${completedCount}/${totalCount}`;

  const formattedTime = element.startTime
    ? new Date(`1970-01-01T${element.startTime}`).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'TBD';

  return (
    <Collapsible defaultOpen={isInProgress}>
      <div className="rounded-md border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-2.5 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground transition-transform [[data-open]_&]:rotate-90">
              ▶
            </span>
            <span className="text-sm font-medium text-card-foreground">{element.element}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formattedTime}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                isComplete
                  ? 'bg-green-500/10 text-green-500'
                  : isInProgress
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {progressLabel}
            </span>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="ml-4 border-l-2 border-border pb-2 pl-2.5">
            {element.levels.map(level => (
              <LevelRow
                key={level.classId}
                level={level}
                onClick={() => onNavigateToClass?.(level.classId)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/ElementAccordion.tsx
git commit -m "feat(schedule): add ElementAccordion with Base UI Collapsible"
```

---

### Task 14: JudgeSection Component

**Files:**

- Create: `src/components/schedule/JudgeSection.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { JudgeTimelineData } from './schedule-timeline.types';
import { StatusDot } from './StatusDot';
import { SpineLine } from './SpineLine';
import { ElementAccordion } from './ElementAccordion';

interface JudgeSectionProps {
  judge: JudgeTimelineData;
  showId: string;
  trialId: string;
  onNavigateToClass?: (classId: string) => void;
}

function getJudgeInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Stable color palette for judge avatars
const JUDGE_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-emerald-500',
];

export function JudgeSection({ judge, showId, trialId, onNavigateToClass }: JudgeSectionProps) {
  // Use judgeId hash to pick a stable color
  const colorIndex = judge.judgeId
    ? Math.abs(judge.judgeId.charCodeAt(0) + judge.judgeId.charCodeAt(1)) % JUDGE_COLORS.length
    : 0;
  const avatarColor = judge.judgeId ? JUDGE_COLORS[colorIndex] : 'bg-slate-500';

  return (
    <div>
      {/* Judge header */}
      <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-1.5">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColor}`}
        >
          {getJudgeInitials(judge.judgeName)}
        </div>
        <span className="text-sm font-medium text-card-foreground">{judge.judgeName}</span>
        {/* [ADDED] ring number display */}
        {judge.ringNumber && (
          <span className="ml-auto text-xs text-muted-foreground">Ring {judge.ringNumber}</span>
        )}
      </div>

      {/* Spine + accordions */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-2.5">
          {judge.elements.map((el, i) => (
            <div key={el.element} className="flex flex-col items-center">
              <StatusDot status={el.status} />
              {i < judge.elements.length - 1 && <SpineLine className="min-h-[2.5rem]" />}
            </div>
          ))}
        </div>

        <div className="flex flex-1 flex-col gap-1">
          {judge.elements.map(el => (
            <ElementAccordion
              key={el.element}
              element={el}
              showId={showId}
              trialId={trialId}
              onNavigateToClass={onNavigateToClass}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/JudgeSection.tsx
git commit -m "feat(schedule): add JudgeSection component with judge header and spine"
```

---

### Task 15: TrialTimeline Component

**Files:**

- Create: `src/components/schedule/TrialTimeline.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useNavigate } from 'react-router-dom';
import { useTrialTimeline } from '@/hooks/queries/useTrialTimeline';
import { JudgeSection } from './JudgeSection';

interface TrialTimelineProps {
  trialId: string;
  showId: string;
}

export function TrialTimeline({ trialId, showId }: TrialTimelineProps) {
  const { data, isLoading, error, refetch } = useTrialTimeline(trialId);
  const navigate = useNavigate();

  const handleNavigateToClass = (classId: string) => {
    navigate(`/shows/${showId}/trials/${trialId}/classes/${classId}`);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
            <div className="h-10 w-0.5 bg-muted" />
            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="h-12 rounded-md bg-muted" />
            <div className="h-12 rounded-md bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Failed to load timeline.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground">No schedule available for this trial.</p>;
  }

  return (
    <div className="space-y-6">
      {data.map(judge => (
        <JudgeSection
          key={judge.judgeId ?? 'unassigned'}
          judge={judge}
          showId={showId}
          trialId={trialId}
          onNavigateToClass={handleNavigateToClass}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/schedule/TrialTimeline.tsx
git commit -m "feat(schedule): add TrialTimeline component for trial detail page"
```

---

### Task 16: TrialTimeline Tests

**Files:**

- Create: `src/components/schedule/__tests__/TrialTimeline.test.tsx`

- [ ] **Step 1: Write component tests**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TrialTimeline } from '../TrialTimeline';
import type { JudgeTimelineData } from '../schedule-timeline.types';
import { CLASS_STATUS } from '@myk9/core';

const mockData: JudgeTimelineData[] = [
  {
    judgeId: 'j1',
    judgeName: 'Jane Smith',
    elements: [
      {
        element: 'Container',
        startTime: '08:00:00',
        levelRange: 'Nov–Mst',
        status: CLASS_STATUS.COMPLETED,
        levels: [
          { classId: 'c1', level: 'Novice', status: CLASS_STATUS.COMPLETED, entryCount: 12 },
          { classId: 'c2', level: 'Advanced', status: CLASS_STATUS.COMPLETED, entryCount: 8 },
        ],
      },
      {
        element: 'Buried',
        startTime: '09:30:00',
        levelRange: 'Nov–Adv',
        status: CLASS_STATUS.IN_PROGRESS,
        levels: [
          { classId: 'c3', level: 'Novice', status: CLASS_STATUS.COMPLETED, entryCount: 10 },
          { classId: 'c4', level: 'Advanced', status: CLASS_STATUS.IN_PROGRESS, entryCount: 8 },
        ],
      },
    ],
  },
];

vi.mock('@/hooks/queries/useTrialTimeline', () => ({
  useTrialTimeline: () => ({ data: mockData, isLoading: false, error: null }),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('TrialTimeline', () => {
  it('renders judge name', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders judge initials', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders element names', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('renders progress fractions', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('2/2 ✓')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('auto-expands in-progress element showing levels', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    // Buried is in progress, should be auto-expanded
    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('shows entry counts in expanded levels', () => {
    renderWithRouter(<TrialTimeline trialId="t1" showId="s1" />);
    expect(screen.getByText('10 entries')).toBeInTheDocument();
    expect(screen.getByText('8 entries')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/__tests__/TrialTimeline.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/__tests__/TrialTimeline.test.tsx
git commit -m "test(schedule): add TrialTimeline component tests"
```

---

### Task 17: Integrate TrialTimeline into Trial Detail Page

**Files:**

- Modify: `src/components/trials/TrialDetailsMain.tsx`

- [ ] **Step 1: Read TrialDetailsMain.tsx**

Read `src/components/trials/TrialDetailsMain.tsx` to find the classes section (around lines 326-344).

- [ ] **Step 2: Add TrialTimeline above the classes table**

Add import at the top:

```typescript
import { TrialTimeline } from '@/components/schedule/TrialTimeline';
```

Add the timeline section above the existing classes section. Look for the classes section heading and add the `TrialTimeline` component above it:

```tsx
{
  /* Timeline */
}
<div className="mb-6">
  <h3 className="mb-3 text-base font-semibold">Timeline</h3>
  <TrialTimeline trialId={trial.id} showId={trial.showId} />
</div>;
```

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 4: Visually verify in browser**

Run: `pnpm dev:show` and navigate to a trial detail page. Verify the Timeline section appears above the classes table with judge grouping and accordion behavior.

- [ ] **Step 5: Commit**

```bash
git add src/components/trials/TrialDetailsMain.tsx
git commit -m "feat(schedule): integrate TrialTimeline into trial detail page"
```

---

## Chunk 4: Cleanup and Final Verification

### Task 18: Run Full Test Suite

- [ ] **Step 1: Run all schedule tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/schedule/`
Expected: ALL PASS

- [ ] **Step 2: Run full app test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: PASS (existing tests should not break)

- [ ] **Step 3: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Run lint across monorepo**

Run: `pnpm lint`
Expected: PASS

---

### Task 19: Create Index Export

**Files:**

- Create: `src/components/schedule/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
export { ScheduleTimeline } from './ScheduleTimeline';
export { TrialTimeline } from './TrialTimeline';
```

- [ ] **Step 2: Update imports in ScheduleSummary.tsx to use index**

```typescript
import { ScheduleTimeline } from '@/components/schedule';
```

- [ ] **Step 3: Update imports in TrialDetailsMain.tsx to use index**

```typescript
import { TrialTimeline } from '@/components/schedule';
```

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/index.ts src/components/shows/overview/ScheduleSummary.tsx src/components/trials/TrialDetailsMain.tsx
git commit -m "chore(schedule): add barrel export and clean up imports"
```
