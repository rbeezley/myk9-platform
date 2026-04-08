# AKC Scent Work Entry Form Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate pre-filled AKC Scent Work entry forms from platform registration data, one per dog per show, accessible from the secretary Reports page.

**Architecture:** Extends the existing report engine (registry + React component + iframe preview + browser print). A new `AKCScentWorkEntryForm` component fetches its own data via `useEntryFormData` (same pattern as `ShowFlyerReport`). The `ReportControlsBar` gains an optional dog picker for single-dog printing.

**Tech Stack:** React, TypeScript, Vitest, React Query, Supabase PostgREST joins, existing report engine (`reportRegistry.ts`, `reportRenderer.ts`, `ReportPreview.tsx`)

**Design spec:** `docs/superpowers/specs/2026-04-07-org-entry-form-generation-design.md`

---

## File Map

| File                                                                           | Action | Responsibility                                                                                      |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/lib/reports/types.ts`                                       | Modify | Add `dogId?`, `dogName?` to `ReportProps`; add `supportsDogFilter?` to `ReportDefinition`           |
| `apps/myk9show/src/lib/reports/entryFormTypes.ts`                              | Create | Types for entry form data: `EntryFormDog`, `EntryFormSecretary`, `EntryFormTrial`, `EntryFormClass` |
| `apps/myk9show/src/lib/reports/entryFormUtils.ts`                              | Create | Pure functions: `buildClassGrid`, `groupEntriesByDog`, `sortEntryFormDogs`                          |
| `apps/myk9show/src/hooks/queries/useEntryFormData.ts`                          | Create | React Query hook fetching joined entry form data                                                    |
| `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`               | Create | Report component rendering one form page per dog                                                    |
| `apps/myk9show/src/lib/reports/reportRegistry.ts`                              | Modify | Register the new report                                                                             |
| `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`          | Modify | Add optional dog picker combobox                                                                    |
| `apps/myk9show/src/pages/secretary/ReportsPage/index.tsx`                      | Modify | Wire `dogId` state through to `ReportPreview`                                                       |
| `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`              | Modify | Pass `dogId` to show-scoped report props                                                            |
| `apps/myk9show/src/lib/reports/__tests__/entryFormUtils.test.ts`               | Create | Unit tests for grid logic, grouping, sorting                                                        |
| `apps/myk9show/src/hooks/queries/__tests__/useEntryFormData.test.ts`           | Create | Hook tests                                                                                          |
| `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.ts` | Create | Component rendering tests                                                                           |

---

## Task 1: Extend Report Type Definitions

**Files:**

- Modify: `apps/myk9show/src/lib/reports/types.ts`

- [ ] **Step 1: Write the test for new type fields**

No runtime test needed — these are type-only changes. Verify by running the type checker after modification.

- [ ] **Step 2: Add `dogId` and `dogName` to `ReportProps`**

In `apps/myk9show/src/lib/reports/types.ts`, add two optional fields to the `ReportProps` interface:

```typescript
export interface ReportProps {
  showId?: string;
  showName: string;
  trial?: {
    date: string;
    trialNumber: string;
    judgeName: string;
  };
  classData?: {
    element: string;
    level: string;
    section: string;
    timeLimitSeconds?: number | null;
    timeLimitArea2Seconds?: number | null;
    timeLimitArea3Seconds?: number | null;
    areaCount?: number | null;
    hidesText?: string | null;
    distractionsText?: string | null;
  };
  entries: ReportEntry[];
  sortOrder: string;
  organization?: string;
  activityType?: string;
  clubName?: string;
  showDates?: string;
  dogId?: string;
  dogName?: string;
}
```

- [ ] **Step 3: Add `supportsDogFilter` to `ReportDefinition`**

In the same file, add the optional field to `ReportDefinition`:

```typescript
export interface ReportDefinition {
  id: string;
  name: string;
  category: string;
  scopes: ('show' | 'trial' | 'class')[];
  sortOptions: ReportSortOption[];
  defaultSort: string;
  component: React.ComponentType<ReportProps>;
  enabled: boolean;
  supportsDogFilter?: boolean;
}
```

- [ ] **Step 4: Run typecheck to verify no regressions**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS (optional fields are backward compatible)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/lib/reports/types.ts
git commit -m "feat(reports): add dogId and supportsDogFilter to report types"
```

---

## Task 2: Entry Form Types

**Files:**

- Create: `apps/myk9show/src/lib/reports/entryFormTypes.ts`

- [ ] **Step 1: Create the entry form type definitions**

Create `apps/myk9show/src/lib/reports/entryFormTypes.ts`:

```typescript
/**
 * Types for the AKC Scent Work entry form generation.
 * These represent the joined data needed to populate one entry form per dog.
 */

/** Secretary info for the form header "Entries should be sent to" block */
export interface EntryFormSecretary {
  name: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/** A trial row in the class selection grid */
export interface EntryFormTrial {
  id: string;
  date: string;
  trialNumber: number;
}

/** A class offered at the show (used to build the grid columns) */
export interface EntryFormClass {
  id: string;
  trialId: string;
  element: string;
  level: string;
}

/** A single entry for a dog in one class */
export interface EntryFormEntry {
  id: string;
  trialId: string;
  classId: string;
  element: string;
  level: string;
  armband: number | null;
  handler: string | null;
  submittedAt: string | null;
}

/** Dog registration info from dog_registrations table */
export interface EntryFormRegistration {
  registeredName: string | null;
  registrationNumber: string;
  organization: string;
  variety: string | null;
}

/** Owner/person info */
export interface EntryFormPerson {
  firstName: string | null;
  lastName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
}

/** One dog's complete data for a single entry form page */
export interface EntryFormDog {
  dogId: string;
  callName: string;
  breed: string;
  sex: string | null;
  dateOfBirth: string | null;
  registration: EntryFormRegistration | null;
  breeder: string | null;
  sire: string | null;
  dam: string | null;
  owner: EntryFormPerson;
  handler: string | null;
  armband: number | null;
  entries: EntryFormEntry[];
  agreementDate: string | null;
}

/** The AKC Scent Work element columns in the class grid */
export const AKC_SCENT_WORK_ELEMENTS = [
  'Container',
  'Interior',
  'Exterior',
  'Buried',
  'Handler Discrimination',
  'Detective',
] as const;

export type AKCScentWorkElement = (typeof AKC_SCENT_WORK_ELEMENTS)[number];

/** The AKC Scent Work level rows within each element cell */
export const AKC_SCENT_WORK_LEVELS = ['Novice', 'Advanced', 'Excellent', 'Master'] as const;

export type AKCScentWorkLevel = (typeof AKC_SCENT_WORK_LEVELS)[number];

/** Column header abbreviations matching the official form */
export const ELEMENT_COLUMN_HEADERS: Record<AKCScentWorkElement, string> = {
  Container: 'Cont.',
  Interior: 'Int.',
  Exterior: 'Ext.',
  Buried: 'Buried',
  'Handler Discrimination': 'Handler Disc.',
  Detective: 'Det.',
};

/** A single cell in the class grid: which levels are checked for this trial+element */
export interface GridCell {
  checkedLevels: Set<string>;
  noviceClass: 'A' | 'B' | null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/lib/reports/entryFormTypes.ts
git commit -m "feat(reports): add entry form type definitions"
```

---

## Task 3: Entry Form Utility Functions + Tests

**Files:**

- Create: `apps/myk9show/src/lib/reports/entryFormUtils.ts`
- Create: `apps/myk9show/src/lib/reports/__tests__/entryFormUtils.test.ts`

- [ ] **Step 1: Write failing tests for `buildClassGrid`**

Create `apps/myk9show/src/lib/reports/__tests__/entryFormUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildClassGrid, groupEntriesByDog, sortEntryFormDogs } from '../entryFormUtils';
import type {
  EntryFormTrial,
  EntryFormEntry,
  EntryFormDog,
  EntryFormPerson,
} from '../entryFormTypes';

const makeOwner = (last: string = 'Smith'): EntryFormPerson => ({
  firstName: 'Jane',
  lastName: last,
  streetAddress: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zipCode: '75001',
  phone: '555-0100',
  email: 'jane@example.com',
});

const makeDog = (overrides: Partial<EntryFormDog> = {}): EntryFormDog => ({
  dogId: 'dog-1',
  callName: 'Star',
  breed: 'Golden Retriever',
  sex: 'Female',
  dateOfBirth: '2022-03-15',
  registration: {
    registeredName: "GCH Oakwood's Rising Star",
    registrationNumber: 'DN12345678',
    organization: 'AKC',
    variety: null,
  },
  breeder: null,
  sire: null,
  dam: null,
  owner: makeOwner(),
  handler: null,
  armband: 101,
  entries: [],
  agreementDate: '2026-04-01',
  ...overrides,
});

const trials: EntryFormTrial[] = [
  { id: 'trial-1', date: '2026-04-12', trialNumber: 1 },
  { id: 'trial-2', date: '2026-04-12', trialNumber: 2 },
];

describe('buildClassGrid', () => {
  it('returns checked levels for matching entries', () => {
    const entries: EntryFormEntry[] = [
      {
        id: 'e1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
      {
        id: 'e2',
        trialId: 'trial-1',
        classId: 'c2',
        element: 'Interior',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
    ];

    const grid = buildClassGrid(entries, trials);

    // Trial 1, Container should have Excellent checked
    const t1Container = grid.get('trial-1')?.get('Container');
    expect(t1Container?.checkedLevels.has('Excellent')).toBe(true);
    expect(t1Container?.checkedLevels.has('Novice')).toBe(false);

    // Trial 1, Interior should have Excellent checked
    const t1Interior = grid.get('trial-1')?.get('Interior');
    expect(t1Interior?.checkedLevels.has('Excellent')).toBe(true);

    // Trial 2 should have no checks
    const t2Container = grid.get('trial-2')?.get('Container');
    expect(t2Container?.checkedLevels.size).toBe(0);
  });

  it('sets noviceClass to A or B', () => {
    const entries: EntryFormEntry[] = [
      {
        id: 'e1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Novice B',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
    ];

    const grid = buildClassGrid(entries, trials);
    const cell = grid.get('trial-1')?.get('Container');
    expect(cell?.checkedLevels.has('Novice')).toBe(true);
    expect(cell?.noviceClass).toBe('B');
  });

  it('returns empty grid for no entries', () => {
    const grid = buildClassGrid([], trials);
    const cell = grid.get('trial-1')?.get('Container');
    expect(cell?.checkedLevels.size).toBe(0);
    expect(cell?.noviceClass).toBeNull();
  });
});

describe('groupEntriesByDog', () => {
  it('groups entries from the same dog together', () => {
    const rawEntries = [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Excellent',
      },
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        classId: 'c2',
        element: 'Interior',
        level: 'Excellent',
      },
      {
        dogId: 'dog-2',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Novice A',
      },
    ];

    const grouped = groupEntriesByDog(rawEntries);
    expect(grouped.get('dog-1')?.length).toBe(2);
    expect(grouped.get('dog-2')?.length).toBe(1);
  });

  it('returns empty map for empty input', () => {
    const grouped = groupEntriesByDog([]);
    expect(grouped.size).toBe(0);
  });
});

describe('sortEntryFormDogs', () => {
  it('sorts by armband number', () => {
    const dogs = [
      makeDog({ dogId: 'dog-2', armband: 200, callName: 'Zulu' }),
      makeDog({ dogId: 'dog-1', armband: 101, callName: 'Alpha' }),
    ];

    const sorted = sortEntryFormDogs(dogs, 'armband');
    expect(sorted[0].armband).toBe(101);
    expect(sorted[1].armband).toBe(200);
  });

  it('sorts by owner last name', () => {
    const dogs = [
      makeDog({ dogId: 'dog-1', owner: makeOwner('Zimmerman') }),
      makeDog({ dogId: 'dog-2', owner: makeOwner('Adams') }),
    ];

    const sorted = sortEntryFormDogs(dogs, 'owner-name');
    expect(sorted[0].owner.lastName).toBe('Adams');
    expect(sorted[1].owner.lastName).toBe('Zimmerman');
  });

  it('sorts by dog registered name', () => {
    const dogs = [
      makeDog({
        dogId: 'dog-1',
        registration: {
          registeredName: 'Zephyr Wind',
          registrationNumber: 'DN1',
          organization: 'AKC',
          variety: null,
        },
      }),
      makeDog({
        dogId: 'dog-2',
        registration: {
          registeredName: 'Alpine Star',
          registrationNumber: 'DN2',
          organization: 'AKC',
          variety: null,
        },
      }),
    ];

    const sorted = sortEntryFormDogs(dogs, 'dog-name');
    expect(sorted[0].registration?.registeredName).toBe('Alpine Star');
  });

  it('defaults to armband sort for unknown sort key', () => {
    const dogs = [
      makeDog({ dogId: 'dog-2', armband: 200 }),
      makeDog({ dogId: 'dog-1', armband: 101 }),
    ];

    const sorted = sortEntryFormDogs(dogs, 'unknown');
    expect(sorted[0].armband).toBe(101);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/entryFormUtils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the utility functions**

Create `apps/myk9show/src/lib/reports/entryFormUtils.ts`:

```typescript
import type { EntryFormTrial, EntryFormEntry, EntryFormDog, GridCell } from './entryFormTypes';
import { AKC_SCENT_WORK_ELEMENTS } from './entryFormTypes';

/**
 * Build a class selection grid: Map<trialId, Map<element, GridCell>>
 * Each cell tracks which levels are checked and Novice A/B designation.
 */
export function buildClassGrid(
  entries: EntryFormEntry[],
  trials: EntryFormTrial[]
): Map<string, Map<string, GridCell>> {
  const grid = new Map<string, Map<string, GridCell>>();

  // Initialize empty grid for all trials x elements
  for (const trial of trials) {
    const elementMap = new Map<string, GridCell>();
    for (const element of AKC_SCENT_WORK_ELEMENTS) {
      elementMap.set(element, { checkedLevels: new Set(), noviceClass: null });
    }
    grid.set(trial.id, elementMap);
  }

  // Fill in checked levels from entries
  for (const entry of entries) {
    const elementMap = grid.get(entry.trialId);
    if (!elementMap) continue;

    // Normalize element name to match our canonical list
    const element = matchElement(entry.element);
    if (!element) continue;

    const cell = elementMap.get(element);
    if (!cell) continue;

    // Parse level — "Novice A" or "Novice B" maps to "Novice" + noviceClass
    const { level, noviceClass } = parseLevel(entry.level);
    cell.checkedLevels.add(level);
    if (noviceClass) {
      cell.noviceClass = noviceClass;
    }
  }

  return grid;
}

/** Match a DB element string to our canonical element name */
function matchElement(element: string): string | null {
  const lower = element.toLowerCase().trim();
  for (const canonical of AKC_SCENT_WORK_ELEMENTS) {
    if (canonical.toLowerCase() === lower) return canonical;
  }
  // Partial matching for common variants
  if (lower.includes('container')) return 'Container';
  if (lower.includes('interior')) return 'Interior';
  if (lower.includes('exterior')) return 'Exterior';
  if (lower.includes('buried')) return 'Buried';
  if (lower.includes('handler') && lower.includes('disc')) return 'Handler Discrimination';
  if (lower.includes('detective')) return 'Detective';
  return null;
}

/** Parse a level string like "Novice A", "Novice B", "Advanced", "Excellent", "Master" */
function parseLevel(level: string): { level: string; noviceClass: 'A' | 'B' | null } {
  const trimmed = level.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('novice')) {
    if (lower.endsWith('a') || lower.includes(' a')) {
      return { level: 'Novice', noviceClass: 'A' };
    }
    if (lower.endsWith('b') || lower.includes(' b')) {
      return { level: 'Novice', noviceClass: 'B' };
    }
    return { level: 'Novice', noviceClass: null };
  }

  if (lower.startsWith('advanced')) return { level: 'Advanced', noviceClass: null };
  if (lower.startsWith('excellent')) return { level: 'Excellent', noviceClass: null };
  if (lower.startsWith('master')) return { level: 'Master', noviceClass: null };

  // Fallback: use as-is
  return { level: trimmed, noviceClass: null };
}

/** Group raw entries by dog ID */
export function groupEntriesByDog<T extends { dogId: string }>(entries: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.dogId) ?? [];
    list.push(entry);
    map.set(entry.dogId, list);
  }
  return map;
}

/** Sort entry form dogs by the selected sort order */
export function sortEntryFormDogs(dogs: EntryFormDog[], sortOrder: string): EntryFormDog[] {
  const sorted = [...dogs];

  switch (sortOrder) {
    case 'owner-name':
      return sorted.sort((a, b) => {
        const aName = (a.owner.lastName ?? '').toLowerCase();
        const bName = (b.owner.lastName ?? '').toLowerCase();
        return aName.localeCompare(bName) || (a.armband ?? 0) - (b.armband ?? 0);
      });

    case 'dog-name':
      return sorted.sort((a, b) => {
        const aName = (a.registration?.registeredName ?? a.callName).toLowerCase();
        const bName = (b.registration?.registeredName ?? b.callName).toLowerCase();
        return aName.localeCompare(bName);
      });

    case 'armband':
    default:
      return sorted.sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/lib/reports/__tests__/entryFormUtils.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/lib/reports/entryFormUtils.ts apps/myk9show/src/lib/reports/__tests__/entryFormUtils.test.ts
git commit -m "feat(reports): add entry form utility functions with tests"
```

---

## Task 4: Data Fetching Hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useEntryFormData.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useEntryFormData.test.ts`

- [ ] **Step 1: Write the hook test**

Create `apps/myk9show/src/hooks/queries/__tests__/useEntryFormData.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
  },
}));

// Mock the query functions
vi.mock('@/services/database/queries/trialQueries', () => ({
  getTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/queries/classQueries', () => ({
  getClassesByTrialId: vi.fn(),
}));

vi.mock('@/services/database/queries/entryQueries', () => ({
  getEntriesByShow: vi.fn(),
}));

import { useEntryFormData } from '../useEntryFormData';

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useEntryFormData', () => {
  it('returns isLoading true when showId is provided', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: 'show-1' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it('does not fetch when showId is empty', () => {
    const { result } = renderHook(() => useEntryFormData({ showId: '' }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dogs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useEntryFormData.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `apps/myk9show/src/hooks/queries/useEntryFormData.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { groupEntriesByDog } from '@/lib/reports/entryFormUtils';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  EntryFormClass,
  EntryFormEntry,
  EntryFormRegistration,
  EntryFormPerson,
} from '@/lib/reports/entryFormTypes';

export interface UseEntryFormDataOptions {
  showId: string;
  trialId?: string;
  dogId?: string;
}

export interface UseEntryFormDataResult {
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
  isLoading: boolean;
  isError: boolean;
}

async function fetchEntryFormData(
  showId: string,
  trialId?: string,
  dogId?: string
): Promise<{
  dogs: EntryFormDog[];
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  classes: EntryFormClass[];
}> {
  // 1. Fetch trials for the show
  const { data: trialsRaw } = await supabase
    .from('trials')
    .select('id, date, trial_number')
    .eq('show_id', showId)
    .order('date')
    .order('trial_number');

  const trials: EntryFormTrial[] = (trialsRaw ?? []).map(t => ({
    id: t.id,
    date: t.date ?? '',
    trialNumber: t.trial_number ?? 0,
  }));

  const trialIds = trialId ? [trialId] : trials.map(t => t.id);

  // 2. Fetch classes for those trials
  const { data: classesRaw } = await supabase
    .from('classes')
    .select('id, trial_id, element, level')
    .in('trial_id', trialIds);

  const classes: EntryFormClass[] = (classesRaw ?? []).map(c => ({
    id: c.id,
    trialId: c.trial_id,
    element: c.element ?? '',
    level: c.level ?? '',
  }));

  // 3. Fetch entries with dog join
  let entriesQuery = supabase
    .from('entries')
    .select('id, dog_id, class_id, trial_id, armband, handler, submitted_at')
    .eq('show_id', showId)
    .is('deleted_at', null);

  if (trialId) {
    entriesQuery = entriesQuery.eq('trial_id', trialId);
  }
  if (dogId) {
    entriesQuery = entriesQuery.eq('dog_id', dogId);
  }

  const { data: entriesRaw } = await entriesQuery;

  if (!entriesRaw || entriesRaw.length === 0) {
    return { dogs: [], secretary: null, trials, classes };
  }

  // Build a class lookup for element/level
  const classMap = new Map(classes.map(c => [c.id, c]));

  // Map entries with element/level from class
  const allEntries: (EntryFormEntry & { dogId: string })[] = (entriesRaw ?? []).map(e => {
    const cls = classMap.get(e.class_id ?? '');
    return {
      id: e.id,
      dogId: e.dog_id ?? '',
      trialId: e.trial_id ?? '',
      classId: e.class_id ?? '',
      element: cls?.element ?? '',
      level: cls?.level ?? '',
      armband: e.armband != null ? Number(e.armband) : null,
      handler: e.handler,
      submittedAt: e.submitted_at,
    };
  });

  // Group entries by dog
  const entriesByDog = groupEntriesByDog(allEntries);
  const dogIds = [...entriesByDog.keys()].filter(Boolean);

  // 4. Fetch dog details
  const { data: dogsRaw } = await supabase
    .from('dogs')
    .select('id, call_name, breed, sex, date_of_birth, owner_id, breeder_id')
    .in('id', dogIds);

  // 5. Fetch dog registrations (prefer AKC)
  const { data: regsRaw } = await supabase
    .from('dog_registrations')
    .select('dog_id, registered_name, registration_number, organization, variety')
    .in('dog_id', dogIds);

  // 6. Collect person IDs (owners + breeders)
  const ownerIds = new Set<string>();
  const breederIds = new Set<string>();
  for (const dog of dogsRaw ?? []) {
    if (dog.owner_id) ownerIds.add(dog.owner_id);
    if (dog.breeder_id) breederIds.add(dog.breeder_id);
  }

  const allPersonIds = [...new Set([...ownerIds, ...breederIds])].filter(Boolean);

  const { data: personsRaw } = await supabase
    .from('people')
    .select('id, first_name, last_name, street_address, city, state, zip_code, phone, email')
    .in('id', allPersonIds);

  const personMap = new Map((personsRaw ?? []).map(p => [p.id, p]));

  // 7. Fetch pedigree ancestors (sire/dam) for all dogs
  const { data: pedigreeRaw } = await supabase
    .from('pedigree_ancestors')
    .select('dog_id, position, registered_name')
    .in('dog_id', dogIds)
    .in('position', ['sire', 'dam']);

  // Index pedigree by dog_id
  const pedigreeMap = new Map<string, { sire: string | null; dam: string | null }>();
  for (const p of pedigreeRaw ?? []) {
    const existing = pedigreeMap.get(p.dog_id) ?? { sire: null, dam: null };
    if (p.position === 'sire') existing.sire = p.registered_name;
    if (p.position === 'dam') existing.dam = p.registered_name;
    pedigreeMap.set(p.dog_id, existing);
  }

  // Index registrations by dog_id (prefer AKC, then first available)
  const regMap = new Map<string, EntryFormRegistration>();
  for (const r of regsRaw ?? []) {
    const existing = regMap.get(r.dog_id);
    if (!existing || r.organization === 'AKC') {
      regMap.set(r.dog_id, {
        registeredName: r.registered_name,
        registrationNumber: r.registration_number,
        organization: r.organization,
        variety: r.variety,
      });
    }
  }

  // 8. Fetch secretary for the show
  const { data: secretaryRole } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('scope_id', showId)
    .eq('role', 'secretary')
    .limit(1)
    .maybeSingle();

  let secretary: EntryFormSecretary | null = null;
  if (secretaryRole?.user_id) {
    const secPerson = personMap.get(secretaryRole.user_id);
    if (!secPerson) {
      // Secretary might not be in our personMap if they're not also an owner
      const { data: secData } = await supabase
        .from('people')
        .select('first_name, last_name, street_address, city, state, zip_code')
        .eq('id', secretaryRole.user_id)
        .maybeSingle();
      if (secData) {
        secretary = {
          name: `${secData.first_name ?? ''} ${secData.last_name ?? ''}`.trim(),
          streetAddress: secData.street_address,
          city: secData.city,
          state: secData.state,
          zipCode: secData.zip_code,
        };
      }
    } else {
      secretary = {
        name: `${secPerson.first_name ?? ''} ${secPerson.last_name ?? ''}`.trim(),
        streetAddress: secPerson.street_address,
        city: secPerson.city,
        state: secPerson.state,
        zipCode: secPerson.zip_code,
      };
    }
  }

  // 9. Assemble EntryFormDog[]
  const dogs: EntryFormDog[] = [];
  for (const dog of dogsRaw ?? []) {
    const dogEntries = entriesByDog.get(dog.id) ?? [];
    if (dogEntries.length === 0) continue;

    const ownerRaw = dog.owner_id ? personMap.get(dog.owner_id) : null;
    const owner: EntryFormPerson = ownerRaw
      ? {
          firstName: ownerRaw.first_name,
          lastName: ownerRaw.last_name,
          streetAddress: ownerRaw.street_address,
          city: ownerRaw.city,
          state: ownerRaw.state,
          zipCode: ownerRaw.zip_code,
          phone: ownerRaw.phone,
          email: ownerRaw.email,
        }
      : {
          firstName: null,
          lastName: null,
          streetAddress: null,
          city: null,
          state: null,
          zipCode: null,
          phone: null,
          email: null,
        };

    const breederRaw = dog.breeder_id ? personMap.get(dog.breeder_id) : null;
    const breederName = breederRaw
      ? `${breederRaw.first_name ?? ''} ${breederRaw.last_name ?? ''}`.trim()
      : null;

    const pedigree = pedigreeMap.get(dog.id);
    const reg = regMap.get(dog.id) ?? null;

    // Determine handler — use first non-owner handler from entries
    const handlerEntry = dogEntries.find(
      e => e.handler && e.handler !== `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim()
    );
    const handler = handlerEntry?.handler ?? null;

    // Use first armband found
    const armband = dogEntries.find(e => e.armband != null)?.armband ?? null;

    // Agreement date — use first submitted_at
    const agreementDate = dogEntries.find(e => e.submittedAt)?.submittedAt ?? null;

    dogs.push({
      dogId: dog.id,
      callName: dog.call_name ?? '',
      breed: dog.breed ?? '',
      sex: dog.sex,
      dateOfBirth: dog.date_of_birth,
      registration: reg,
      breeder: breederName || null,
      sire: pedigree?.sire ?? null,
      dam: pedigree?.dam ?? null,
      owner,
      handler,
      armband,
      entries: dogEntries,
      agreementDate,
    });
  }

  return { dogs, secretary, trials, classes };
}

export function useEntryFormData({
  showId,
  trialId,
  dogId,
}: UseEntryFormDataOptions): UseEntryFormDataResult {
  const query = useQuery({
    queryKey: ['entry-form-data', showId, trialId ?? 'all', dogId ?? 'all'],
    queryFn: () => fetchEntryFormData(showId, trialId, dogId),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });

  return {
    dogs: query.data?.dogs ?? [],
    secretary: query.data?.secretary ?? null,
    trials: query.data?.trials ?? [],
    classes: query.data?.classes ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useEntryFormData.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useEntryFormData.ts apps/myk9show/src/hooks/queries/__tests__/useEntryFormData.test.ts
git commit -m "feat(reports): add useEntryFormData hook for entry form generation"
```

---

## Task 5: AKC Scent Work Entry Form Component + Tests

**Files:**

- Create: `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`
- Create: `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AKCScentWorkEntryForm } from '../AKCScentWorkEntryForm';
import type { ReportProps } from '@/lib/reports/types';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  EntryFormClass,
} from '@/lib/reports/entryFormTypes';

// Mock the useEntryFormData hook
const mockDogs: EntryFormDog[] = [
  {
    dogId: 'dog-1',
    callName: 'Star',
    breed: 'Golden Retriever',
    sex: 'Female',
    dateOfBirth: '2022-03-15',
    registration: {
      registeredName: "GCH Oakwood's Rising Star",
      registrationNumber: 'DN12345678',
      organization: 'AKC',
      variety: null,
    },
    breeder: 'John Doe',
    sire: "CH Oakwood's Golden Boy",
    dam: "Oakwood's Shining Light",
    owner: {
      firstName: 'Sarah',
      lastName: 'Johnson',
      streetAddress: '456 Oak Ave',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75001',
      phone: '(214) 555-0123',
      email: 'sarah@example.com',
    },
    handler: null,
    armband: 101,
    entries: [
      {
        id: 'e1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: '2026-04-01T12:00:00Z',
      },
      {
        id: 'e2',
        trialId: 'trial-1',
        classId: 'c2',
        element: 'Interior',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: '2026-04-01T12:00:00Z',
      },
    ],
    agreementDate: '2026-04-01T12:00:00Z',
  },
];

const mockSecretary: EntryFormSecretary = {
  name: 'Jane Smith',
  streetAddress: '123 Main St',
  city: 'Anytown',
  state: 'TX',
  zipCode: '75001',
};

const mockTrials: EntryFormTrial[] = [
  { id: 'trial-1', date: '2026-04-12', trialNumber: 1 },
  { id: 'trial-2', date: '2026-04-12', trialNumber: 2 },
];

const mockClasses: EntryFormClass[] = [
  { id: 'c1', trialId: 'trial-1', element: 'Container', level: 'Excellent' },
  { id: 'c2', trialId: 'trial-1', element: 'Interior', level: 'Excellent' },
];

vi.mock('@/hooks/queries/useEntryFormData', () => ({
  useEntryFormData: vi.fn().mockReturnValue({
    dogs: mockDogs,
    secretary: mockSecretary,
    trials: mockTrials,
    classes: mockClasses,
    isLoading: false,
    isError: false,
  }),
}));

const baseProps: ReportProps = {
  showId: 'show-1',
  showName: 'Spring Scent Trial 2026',
  entries: [],
  sortOrder: 'armband',
  organization: 'AKC',
  clubName: 'Bay Area Nose Work Club',
  showDates: '2026-04-12 – 2026-04-13',
};

describe('AKCScentWorkEntryForm', () => {
  it('renders the form title', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText('OFFICIAL ENTRY FORM')).toBeInTheDocument();
  });

  it('renders the secretary address in the header', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
  });

  it('renders the dog registered name', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/GCH Oakwood's Rising Star/)).toBeInTheDocument();
  });

  it('renders the registration number', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/DN12345678/)).toBeInTheDocument();
  });

  it('renders the owner name and address', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument();
    expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
  });

  it('renders breeder, sire, and dam when available', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/CH Oakwood's Golden Boy/)).toBeInTheDocument();
    expect(screen.getByText(/Oakwood's Shining Light/)).toBeInTheDocument();
  });

  it('renders the agreement text', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/AGREEMENT/)).toBeInTheDocument();
    expect(screen.getByText(/I certify that I am the actual owner/)).toBeInTheDocument();
  });

  it('renders the digital consent note with date', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Entered via myK9Show/)).toBeInTheDocument();
    expect(screen.getByText(/04\/01\/2026/)).toBeInTheDocument();
  });

  it('renders element column headers', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText('Cont.')).toBeInTheDocument();
    expect(screen.getByText('Int.')).toBeInTheDocument();
    expect(screen.getByText('Ext.')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('shows error state when showId is missing', () => {
    render(<AKCScentWorkEntryForm {...baseProps} showId={undefined} />);
    expect(screen.getByText(/Show ID is required/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`:

```typescript
import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import { buildClassGrid, sortEntryFormDogs } from '@/lib/reports/entryFormUtils';
import { formatReportDate } from '@/lib/reports/reportUtils';
import {
  AKC_SCENT_WORK_ELEMENTS,
  AKC_SCENT_WORK_LEVELS,
  ELEMENT_COLUMN_HEADERS,
} from '@/lib/reports/entryFormTypes';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  GridCell,
} from '@/lib/reports/entryFormTypes';

// ─── Static AKC Agreement Text ────────────────────────────────────────────

const AKC_AGREEMENT_TEXT = `I certify that I am the actual owner of the dog, or that I am the duly authorized agent of the actual owner whose name I have entered. In consideration of the acceptance of this entry, I (we) agree to abide by the rules and regulations of The American Kennel Club in effect at the time of this event, and any additional rules and regulations appearing in the premium list of this event and entry form and any decision made in accord with them. I (we) agree that the club holding this event has the right to refuse this entry for cause which the club shall deem sufficient. I (we) certify and represent that the dog entered is not a hazard to persons or other dogs. In consideration of the acceptance of this entry and of the holding of this event and of the opportunity to have the dog judged and to win prizes, ribbons, or trophies, I (we) agree to hold the AKC, the event-giving club, their members, directors, governors, officers, agents, superintendents or event secretary and the owner and/or lessor of the premises and any provider of services that are necessary to hold this event and any employees or volunteers of the aforementioned parties, and any AKC approved judge, judging at this event, harmless from any claim for loss or injury which may be alleged to have been caused directly or indirectly to any person or thing by the act of this dog while in or about the event premises or grounds or near any entrance thereto, and I (we) personally assume all responsibility and liability for any such claim; and I (we) further agree to hold the aforementioned parties harmless from any claim of loss, injury or damage to this dog.`;

const AKC_AGREEMENT_TEXT_2 = `Additionally, I (we) hereby assume the sole responsibility for and agree to indemnify, defend and save the aforementioned parties harmless from any and all loss and expense (including legal fees) by reason of the liability imposed by law upon any of the aforementioned parties for damage because of bodily injuries, including death at any time resulting therefrom, sustained by any person or persons, including myself (ourselves), or on account of damage to property, arising out of or in consequence of my (our) participation in this event, however such injuries, death or property damage may be caused, and whether or not the same may have been caused or may be alleged to have been caused by the negligence of the aforementioned parties or any of their employees, agents, or any other person.`;

const AKC_ARBITRATION_TEXT = `I (WE) AGREE THAT ANY CAUSE OF ACTION, CONTROVERSY OR CLAIM ARISING OUT OF OR RELATED TO THE ENTRY, EXHIBITION OR ATTENDANCE AT THE EVENT BETWEEN THE AKC AND THE EVENT-GIVING CLUB (UNLESS OTHERWISE STATED IN THIS PREMIUM LIST) AND MYSELF (OURSELVES) OR AS TO THE CONSTRUCTION, INTERPRETATION AND EFFECT OF THIS AGREEMENT SHALL BE SETTLED BY ARBITRATION PURSUANT TO THE APPLICABLE RULES OF THE AMERICAN ARBITRATION ASSOCIATION. HOWEVER, PRIOR TO ARBITRATION ALL APPLICABLE AKC BYLAWS, RULES, REGULATIONS, AND PROCEDURES MUST FIRST BE FOLLOWED AS SET FORTH IN THE AKC CHARTER AND BYLAWS, RULES, REGULATIONS, PUBLISHED POLICIES AND GUIDELINES.`;

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '9px',
    lineHeight: '1.3',
    color: '#000',
    background: '#fff',
    padding: '0.3in',
    pageBreakBefore: 'always' as const,
    maxWidth: '8.5in',
  },
  firstPage: {
    pageBreakBefore: 'auto' as const,
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '8px',
  },
  title: {
    fontWeight: 'bold' as const,
    fontSize: '12px',
    margin: '0 0 2px 0',
  },
  addressLine: {
    fontSize: '9px',
    margin: '0',
  },
  grid: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '7.5px',
    marginBottom: '6px',
  },
  gridHeader: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontWeight: 'bold' as const,
    background: '#f0f0f0',
    textAlign: 'center' as const,
  },
  gridCell: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontSize: '7px',
    verticalAlign: 'top' as const,
  },
  trialLabel: {
    border: '1px solid #000',
    padding: '2px 3px',
    fontWeight: 'bold' as const,
    fontSize: '7px',
    width: '12%',
  },
  detCell: {
    border: '1px solid #000',
    padding: '2px 3px',
    textAlign: 'center' as const,
    width: '6%',
  },
  infoTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '8px',
    marginBottom: '4px',
  },
  infoCell: {
    border: '1px solid #000',
    padding: '2px 4px',
  },
  label: {
    fontWeight: 'bold' as const,
  },
  optionalLabel: {
    color: '#888',
  },
  agreement: {
    fontSize: '6.5px',
    lineHeight: '1.25',
    marginTop: '8px',
  },
  agreementTitle: {
    fontWeight: 'bold' as const,
    fontSize: '8px',
    textAlign: 'center' as const,
    marginBottom: '2px',
  },
  consentNote: {
    marginTop: '4px',
    fontSize: '7px',
    fontStyle: 'italic' as const,
    color: '#666',
  },
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────

function FormHeader({ secretary }: { secretary: EntryFormSecretary | null }) {
  return (
    <div style={styles.header}>
      <p style={styles.title}>OFFICIAL ENTRY FORM</p>
      <p style={styles.addressLine}>Entries should be sent to:</p>
      {secretary ? (
        <>
          <p style={styles.addressLine}>{secretary.name}</p>
          {secretary.streetAddress && (
            <p style={styles.addressLine}>{secretary.streetAddress}</p>
          )}
          <p style={styles.addressLine}>
            {[secretary.city, secretary.state].filter(Boolean).join(', ')}
            {secretary.zipCode ? ` ${secretary.zipCode}` : ''}
          </p>
        </>
      ) : (
        <p style={styles.addressLine}>[Secretary info not available]</p>
      )}
    </div>
  );
}

function ClassGridCell({ cell, isDetective }: { cell: GridCell; isDetective: boolean }) {
  if (isDetective) {
    // Detective column is a single checkbox
    const checked = cell.checkedLevels.size > 0;
    return <td style={styles.detCell}>{checked ? '\u2611' : '\u2610'}</td>;
  }

  return (
    <td style={styles.gridCell}>
      {AKC_SCENT_WORK_LEVELS.map(level => {
        const isChecked = cell.checkedLevels.has(level);
        const checkbox = isChecked ? '\u2611' : '\u2610';
        const noviceSuffix =
          level === 'Novice' && cell.noviceClass ? ` (${cell.noviceClass})` : '';
        const label = level === 'Novice' ? `Novice A / B${noviceSuffix}` : level;
        return (
          <div key={level} style={isChecked ? { fontWeight: 'bold' } : undefined}>
            {checkbox} {label}
          </div>
        );
      })}
    </td>
  );
}

function ClassGrid({
  grid,
  trials,
}: {
  grid: Map<string, Map<string, GridCell>>;
  trials: EntryFormTrial[];
}) {
  const emptyCell: GridCell = { checkedLevels: new Set(), noviceClass: null };

  return (
    <table style={styles.grid}>
      <thead>
        <tr>
          <th style={styles.gridHeader}>Trial</th>
          {AKC_SCENT_WORK_ELEMENTS.map(el => (
            <th key={el} style={styles.gridHeader}>
              {ELEMENT_COLUMN_HEADERS[el]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {trials.map(trial => {
          const elementMap = grid.get(trial.id);
          return (
            <tr key={trial.id}>
              <td style={styles.trialLabel}>
                Trial {trial.trialNumber}
                <br />
                {formatReportDate(trial.date)}
              </td>
              {AKC_SCENT_WORK_ELEMENTS.map(el => (
                <ClassGridCell
                  key={el}
                  cell={elementMap?.get(el) ?? emptyCell}
                  isDetective={el === 'Detective'}
                />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DogInfoTable({ dog }: { dog: EntryFormDog }) {
  const reg = dog.registration;
  const isAkc = reg?.organization === 'AKC' || reg?.organization === 'PAL';
  const isForeign = reg?.organization === 'Foreign';
  const ownerName = `${dog.owner.firstName ?? ''} ${dog.owner.lastName ?? ''}`.trim();

  return (
    <table style={styles.infoTable}>
      <tbody>
        <tr>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.label}>AKC Registered Name: </span>
            {reg?.registeredName ?? dog.callName}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Registration #: </span>
            {reg?.registrationNumber ?? ''}
            {'  '}
            {isAkc ? '\u2611' : '\u2610'} AKC/PAL/ILP/CP{'  '}
            {isForeign ? '\u2611' : '\u2610'} Foreign
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell}>
            <span style={styles.label}>Call name: </span>
            {dog.callName}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.optionalLabel}>Date of birth: </span>
            {dog.dateOfBirth ? formatReportDate(dog.dateOfBirth) : ''}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.label}>Sex: </span>
            {dog.sex ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Breed: </span>
            {dog.breed}
            {reg?.variety ? ` — Variety: ${reg.variety}` : ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.optionalLabel}>Breeder: </span>
            {dog.breeder ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.optionalLabel}>Sire: </span>
            {dog.sire ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.optionalLabel}>Dam: </span>
            {dog.dam ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.label}>Owner: </span>
            {ownerName}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={5}>
            <span style={styles.label}>Owner&apos;s Address: </span>
            {dog.owner.streetAddress ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>City: </span>
            {dog.owner.city ?? ''}
          </td>
          <td style={styles.infoCell}>
            <span style={styles.label}>State: </span>
            {dog.owner.state ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Zip: </span>
            {dog.owner.zipCode ?? ''}
          </td>
        </tr>
        <tr>
          <td style={styles.infoCell} colSpan={2}>
            <span style={styles.label}>Telephone: </span>
            {dog.owner.phone ?? ''}
          </td>
          <td style={styles.infoCell} colSpan={3}>
            <span style={styles.label}>Email: </span>
            {dog.owner.email ?? ''}
          </td>
        </tr>
        {dog.handler && (
          <tr>
            <td style={styles.infoCell} colSpan={5}>
              <span style={styles.label}>Handler name (if different from owner): </span>
              {dog.handler}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function AgreementSection({ agreementDate }: { agreementDate: string | null }) {
  const formattedDate = agreementDate
    ? formatReportDate(agreementDate.split('T')[0])
    : 'unknown';

  return (
    <div style={styles.agreement}>
      <p style={styles.agreementTitle}>AGREEMENT</p>
      <p>{AKC_AGREEMENT_TEXT}</p>
      <p>{AKC_AGREEMENT_TEXT_2}</p>
      <p>{AKC_ARBITRATION_TEXT}</p>
      <p style={styles.consentNote}>
        Entered via myK9Show &mdash; agreement accepted digitally on {formattedDate}
      </p>
    </div>
  );
}

// ─── Single form page for one dog ─────────────────────────────────────────

function EntryFormPage({
  dog,
  secretary,
  trials,
  isFirst,
}: {
  dog: EntryFormDog;
  secretary: EntryFormSecretary | null;
  trials: EntryFormTrial[];
  isFirst: boolean;
}) {
  const grid = buildClassGrid(dog.entries, trials);

  return (
    <div style={{ ...styles.page, ...(isFirst ? styles.firstPage : {}) }}>
      <FormHeader secretary={secretary} />
      <ClassGrid grid={grid} trials={trials} />
      <DogInfoTable dog={dog} />
      <AgreementSection agreementDate={dog.agreementDate} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export const AKCScentWorkEntryForm: React.FC<ReportProps> = ({
  showId,
  sortOrder,
  dogId,
}) => {
  const { dogs, secretary, trials, isLoading, isError } = useEntryFormData({
    showId: showId ?? '',
    dogId,
  });

  if (!showId) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Show ID is required to generate entry forms.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Loading entry form data...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="report-page">
        <p style={{ color: '#c00', textAlign: 'center', paddingTop: '2in' }}>
          Failed to load entry form data.
        </p>
      </div>
    );
  }

  if (dogs.length === 0) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          No entries found for this selection.
        </p>
      </div>
    );
  }

  const sortedDogs = sortEntryFormDogs(dogs, sortOrder);

  return (
    <>
      {sortedDogs.map((dog, index) => (
        <EntryFormPage
          key={dog.dogId}
          dog={dog}
          secretary={secretary}
          trials={trials}
          isFirst={index === 0}
        />
      ))}
    </>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx
git commit -m "feat(reports): add AKC Scent Work entry form component with tests"
```

---

## Task 6: Register the Report

**Files:**

- Modify: `apps/myk9show/src/lib/reports/reportRegistry.ts`

- [ ] **Step 1: Add the import and registry entry**

In `apps/myk9show/src/lib/reports/reportRegistry.ts`, add the import at the top with the other report imports:

```typescript
import { AKCScentWorkEntryForm } from '@/components/reports/AKCScentWorkEntryForm';
```

Then add the registry entry after the `show-flyer` entry and before the Phase 2 stubs comment:

```typescript
  {
    id: 'akc-scent-work-entry-form',
    name: 'AKC Scent Work Entry Form',
    category: 'organization',
    scopes: ['show'],
    sortOptions: [
      { value: 'armband', label: 'Armband Number' },
      { value: 'owner-name', label: 'Owner Last Name' },
      { value: 'dog-name', label: 'Dog Registered Name' },
    ],
    defaultSort: 'armband',
    component: AKCScentWorkEntryForm,
    enabled: true,
    supportsDogFilter: true,
  },
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/lib/reports/reportRegistry.ts
git commit -m "feat(reports): register AKC Scent Work entry form in report registry"
```

---

## Task 7: Add Dog Picker to ReportControlsBar

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/index.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`

- [ ] **Step 1: Add dog picker props and UI to ReportControlsBar**

In `apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx`:

Add new props to the interface:

```typescript
interface ReportControlsBarProps {
  reportType: string;
  trialId: string;
  classId: string;
  sortOrder: string;
  dogId: string;
  trials: Array<{ id: string; trial_number: number; date: string }>;
  classes: Array<{
    id: string;
    element: string;
    level: string;
    section: string;
    trial_id: string;
  }>;
  dogs: Array<{
    id: string;
    callName: string;
    registeredName: string | null;
    armband: number | null;
  }>;
  onReportTypeChange: (value: string) => void;
  onTrialChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onDogChange: (value: string) => void;
  onPrint: () => void;
}
```

Update the function signature to destructure the new props:

```typescript
export function ReportControlsBar({
  reportType,
  trialId,
  classId,
  sortOrder,
  dogId,
  trials,
  classes,
  dogs,
  onReportTypeChange,
  onTrialChange,
  onClassChange,
  onSortChange,
  onDogChange,
  onPrint,
}: ReportControlsBarProps) {
```

Add `supportsDogFilter` check:

```typescript
const hasDogFilter = selectedReport?.supportsDogFilter ?? false;
```

Add the dog picker Select after the class dropdown and before the sort dropdown:

```typescript
      {/* Dog filter — shown only for reports with supportsDogFilter */}
      {hasDogFilter && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Dog</label>
          <Select value={dogId} onValueChange={onDogChange}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="All Dogs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dogs</SelectItem>
              {dogs.map(dog => (
                <SelectItem key={dog.id} value={dog.id}>
                  {dog.callName}
                  {dog.registeredName ? ` (${dog.registeredName})` : ''}
                  {dog.armband != null ? ` — #${dog.armband}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
```

- [ ] **Step 2: Wire dogId state in ReportsPage**

In `apps/myk9show/src/pages/secretary/ReportsPage/index.tsx`:

Add state:

```typescript
const [dogId, setDogId] = useState<string>('all');
```

Reset dogId when report type, show, or trial changes — add `setDogId('all')` to `handleReportTypeChange`, `handleShowChange`, and `handleTrialChange`.

Add a `dogOptions` memo. For now, this will be populated from the entry form data hook when the entry form report is selected. A simple approach: fetch a lightweight dog list from entries for the show:

```typescript
// Build dog options for the dog picker (only when a dog-filter report is selected)
const dogOptions = useMemo(() => {
  if (!report?.supportsDogFilter) return [];
  // Extract unique dogs from entries
  const dogMap = new Map<
    string,
    { id: string; callName: string; registeredName: string | null; armband: number | null }
  >();
  for (const entry of (entries ?? []) as Array<Record<string, unknown>>) {
    const dogId = entry.dog_id as string;
    if (!dogId || dogMap.has(dogId)) continue;
    const dog = entry.dog as Record<string, unknown> | null;
    dogMap.set(dogId, {
      id: dogId,
      callName: (dog?.call_name as string) ?? `Dog ${entry.armband ?? '?'}`,
      registeredName: null, // Not available in the current entries join
      armband: entry.armband != null ? Number(entry.armband) : null,
    });
  }
  return [...dogMap.values()].sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
}, [entries, report?.supportsDogFilter]);
```

Pass new props to `ReportControlsBar`:

```typescript
      <ReportControlsBar
        reportType={reportType}
        trialId={trialId}
        classId={classId}
        sortOrder={sortOrder}
        dogId={dogId}
        trials={trialOptions}
        classes={classOptions}
        dogs={dogOptions}
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onSortChange={setSortOrder}
        onDogChange={setDogId}
        onPrint={handlePrint}
      />
```

- [ ] **Step 3: Pass dogId through ReportPreview**

In `apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx`:

Add `dogId: string` to `ReportPreviewProps`.

In the `showScoped` branch of the useEffect, add `dogId` to the props passed to the component:

```typescript
const props: ReportProps = {
  showId: show.id,
  showName: show.name ?? '',
  clubName: show.clubName ?? undefined,
  showDates,
  entries: [],
  sortOrder,
  organization: show.organization ?? undefined,
  dogId: dogId !== 'all' ? dogId : undefined,
};
```

Add `dogId` to the ReportsPage's `<ReportPreview>` call:

```typescript
      <ReportPreview
        reportType={reportType}
        show={show}
        trials={trials as Parameters<typeof ReportPreview>[0]['trials']}
        classes={classes as Parameters<typeof ReportPreview>[0]['classes']}
        entries={entries}
        trialId={trialId}
        classId={classId}
        sortOrder={sortOrder}
        dogId={dogId}
        isLoading={isLoading}
        isError={isError}
        iframeRef={iframeRef}
      />
```

Add `dogId` to the `useEffect` dependency array in `ReportPreview`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run existing report tests to verify no regressions**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ src/lib/reports/__tests__/`
Expected: PASS — all existing tests still green

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ReportsPage/ReportControlsBar.tsx apps/myk9show/src/pages/secretary/ReportsPage/index.tsx apps/myk9show/src/pages/secretary/ReportsPage/ReportPreview.tsx
git commit -m "feat(reports): add dog picker to ReportControlsBar and wire through ReportsPage"
```

---

## Task 8: Full Test Suite Run + Final Verification

- [ ] **Step 1: Run all report-related tests**

Run: `cd apps/myk9show && npx vitest run src/components/reports/__tests__/ src/lib/reports/__tests__/ src/hooks/queries/__tests__/useEntryFormData.test.ts`
Expected: PASS — all tests green

- [ ] **Step 2: Run full typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `cd apps/myk9show && npx eslint src/components/reports/AKCScentWorkEntryForm.tsx src/lib/reports/entryFormTypes.ts src/lib/reports/entryFormUtils.ts src/hooks/queries/useEntryFormData.ts --max-warnings 0`
Expected: PASS

- [ ] **Step 4: Commit any lint fixes if needed**

```bash
git add -A && git commit -m "fix: lint fixes for entry form feature"
```

---

## Summary

| Task | Description         | Files                                                     | Tests               |
| ---- | ------------------- | --------------------------------------------------------- | ------------------- |
| 1    | Extend report types | `types.ts`                                                | Typecheck           |
| 2    | Entry form types    | `entryFormTypes.ts`                                       | Typecheck           |
| 3    | Utility functions   | `entryFormUtils.ts`                                       | 10+ unit tests      |
| 4    | Data hook           | `useEntryFormData.ts`                                     | 2+ hook tests       |
| 5    | Form component      | `AKCScentWorkEntryForm.tsx`                               | 10+ component tests |
| 6    | Registry entry      | `reportRegistry.ts`                                       | Typecheck           |
| 7    | Dog picker + wiring | `ReportControlsBar.tsx`, `index.tsx`, `ReportPreview.tsx` | Regression check    |
| 8    | Final verification  | —                                                         | Full suite          |
