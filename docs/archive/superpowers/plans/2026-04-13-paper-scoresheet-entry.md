# Paper Scoresheet Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace myK9Show's one-dog-at-a-time scoring flow with a purpose-built paper scoresheet entry page — split-panel layout, result-first entry, optional time for NQ, pre-fill for common results.

**Architecture:** New `PaperScoresheetPage` replaces `ScoringEntryListPage` at the same route. A `usePaperScoring` hook manages selection state, session settings, and save mutations. Two layout modes (`SplitPanelView` and `SequentialView`) share a single `EntryPanel`. No changes to `packages/scoring-ui` or `ScoresheetPage` — myK9Q ringside flow is untouched.

**Tech Stack:** React, TypeScript, TanStack React Query, shadcn/ui (Button, Card), Tailwind CSS, `replicatedEntriesTable` / `replicatedDogsTable` (offline-first replication layer), existing `TimeInput` from `@/components/ui/data-table`.

---

## File Map

**Create:**
| File | Responsibility |
|------|----------------|
| `apps/myk9show/src/pages/scoring/paper-scoring-types.ts` | Shared types: `PaperScoringMode`, `PaperResult`, `SessionSettings` |
| `apps/myk9show/src/pages/scoring/hooks/usePaperScoring.ts` | State: selection, session settings, mode, save/next logic |
| `apps/myk9show/src/pages/scoring/hooks/usePaperScoring.test.ts` | Tests for hook |
| `apps/myk9show/src/pages/scoring/components/SessionToolbar.tsx` | Pre-fill + time mode controls |
| `apps/myk9show/src/pages/scoring/components/SessionToolbar.test.tsx` | Tests |
| `apps/myk9show/src/pages/scoring/components/ClassEntryRow.tsx` | Compact row for left-column table |
| `apps/myk9show/src/pages/scoring/components/ClassEntryRow.test.tsx` | Tests |
| `apps/myk9show/src/pages/scoring/components/EntryPanel.tsx` | Dog info, result buttons, time, faults, save buttons |
| `apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx` | Tests |
| `apps/myk9show/src/pages/scoring/components/SplitPanelView.tsx` | Two-column layout (table + panel) |
| `apps/myk9show/src/pages/scoring/components/SplitPanelView.test.tsx` | Tests |
| `apps/myk9show/src/pages/scoring/components/SequentialView.tsx` | Full-width single-dog view with progress |
| `apps/myk9show/src/pages/scoring/components/SequentialView.test.tsx` | Tests |
| `apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx` | Page shell: data loading, mode toggle, breadcrumb |

**Modify:**
| File | Change |
|------|--------|
| `apps/myk9show/src/routes/secretaryRoutes.tsx` | Swap `ScoringEntryListPage` import/route for `PaperScoresheetPage` |
| `apps/myk9show/src/pages/scoring/index.ts` | Export `PaperScoresheetPage` |
| `apps/myk9show/src/components/entries/management/ScoringModeWrapper.tsx` | Navigate to `/scoring/classes/:classId/entries` instead of rendering `ClassResultsTable` inline |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx` | Add "Enter Scores" button on class cards that are in scoring-ready stage |

---

## Task 1: Shared types

**Files:**

- Create: `apps/myk9show/src/pages/scoring/paper-scoring-types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/myk9show/src/pages/scoring/paper-scoring-types.ts

/** Display codes used in UI buttons */
export type PaperResult = 'Q' | 'NQ' | 'ABS' | 'EX';

/** Layout mode — persisted in localStorage */
export type PaperScoringMode = 'split' | 'sequential';

/** Whether to show a time field for non-qualifying results */
export type TimeRecordMode = 'q-only' | 'all-runs';

/** Pre-selected result that is highlighted (but not saved) when a dog's panel opens */
export type PreFillOption = 'none' | 'Q' | 'NQ';

export interface SessionSettings {
  preFill: PreFillOption;
  timeRecordMode: TimeRecordMode;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  preFill: 'none',
  timeRecordMode: 'q-only',
};

/**
 * Maps display result codes to the value stored in result_status column.
 * These must match the values in mapResultStatusToQualification() in types.ts.
 */
export const RESULT_STATUS_MAP: Record<PaperResult, string> = {
  Q: 'Qualified',
  NQ: 'Not Qualified',
  ABS: 'Absent',
  EX: 'Excused',
};

/**
 * Convert a TimeInput digit string to floating-point seconds.
 * "12345" → digits padded to "012345" → 1 min 23.45 sec → 83.45
 * "" or "0" → 0
 */
export function digitsToSeconds(digits: string): number {
  if (!digits || digits === '0') return 0;
  const padded = digits.padStart(6, '0');
  const min = parseInt(padded.slice(0, 2), 10);
  const sec = parseInt(padded.slice(2, 4), 10);
  const hundredths = parseInt(padded.slice(4, 6), 10);
  return min * 60 + sec + hundredths / 100;
}

/** localStorage key for persisting mode preference per user */
export function modeStorageKey(userId: string): string {
  return `paper-scoring-mode:${userId}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/pages/scoring/paper-scoring-types.ts
git commit -m "feat(scoring): add paper scoring shared types"
```

---

## Task 2: `usePaperScoring` hook

**Files:**

- Create: `apps/myk9show/src/pages/scoring/hooks/usePaperScoring.ts`
- Test: `apps/myk9show/src/pages/scoring/hooks/usePaperScoring.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/hooks/usePaperScoring.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaperScoring } from './usePaperScoring';
import type { ScoringEntry } from '../types';

// Mock the replicated table
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 1,
    entryId: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    callName: 'Buddy',
    handler: 'Smith',
    breed: 'Lab',
    armband: 101,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: 1,
    ...overrides,
  };
}

const entries: ScoringEntry[] = [
  makeEntry({ entryId: 'e1', exhibitorOrder: 1 }),
  makeEntry({ entryId: 'e2', exhibitorOrder: 2, armband: 102 }),
  makeEntry({ entryId: 'e3', exhibitorOrder: 3, armband: 103, isScored: true, status: 'scored' }),
];

describe('usePaperScoring', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with no selection', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    expect(result.current.selectedEntryId).toBeNull();
  });

  it('selectEntry updates selectedEntryId', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    act(() => result.current.selectEntry('e1'));
    expect(result.current.selectedEntryId).toBe('e1');
  });

  it('nextUnscored returns first pending entry by exhibitorOrder', () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    expect(result.current.nextUnscored()).toBe('e1');
  });

  it('nextUnscored skips scored entries', () => {
    const allScored = entries.map(e => ({ ...e, isScored: true, status: 'scored' as const }));
    const { result } = renderHook(() => usePaperScoring(allScored, 'class-1', 'user-1'));
    expect(result.current.nextUnscored()).toBeNull();
  });

  it('saveEntry calls updateEntry with correct fields for Q result', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveEntry('e1', 'Q', '12345', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'Qualified',
        resultStatus: 'Qualified',
        search_time_seconds: 83.45,
        searchTimeSeconds: 83.45,
        total_faults: 0,
        totalFaults: 0,
        checkInStatus: 'completed',
        check_in_status: 'completed',
      })
    );
  });

  it('saveEntry writes 0 seconds for empty time on NQ', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveEntry('e1', 'NQ', '', 0));
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'Not Qualified',
        search_time_seconds: 0,
      })
    );
  });

  it('saveAndNext selects next unscored entry after saving', async () => {
    const { result } = renderHook(() => usePaperScoring(entries, 'class-1', 'user-1'));
    await act(() => result.current.saveAndNext('e1', 'Q', '12345', 0));
    // After saving e1, next unscored is e2 (e3 is already scored)
    expect(result.current.selectedEntryId).toBe('e2');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/hooks/usePaperScoring.test.ts
```

Expected: FAIL — `usePaperScoring` not found.

- [ ] **Step 3: Implement the hook**

```typescript
// apps/myk9show/src/pages/scoring/hooks/usePaperScoring.ts
import { useState, useCallback } from 'react';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ScoringEntry } from '../types';
import {
  digitsToSeconds,
  modeStorageKey,
  RESULT_STATUS_MAP,
  DEFAULT_SESSION_SETTINGS,
} from '../paper-scoring-types';
import type { PaperResult, PaperScoringMode, SessionSettings } from '../paper-scoring-types';

function readModeFromStorage(userId: string): PaperScoringMode {
  try {
    const stored = localStorage.getItem(modeStorageKey(userId));
    if (stored === 'split' || stored === 'sequential') return stored;
  } catch {
    // localStorage unavailable (SSR, private mode)
  }
  return 'split';
}

function writeModeToStorage(userId: string, mode: PaperScoringMode) {
  try {
    localStorage.setItem(modeStorageKey(userId), mode);
  } catch {
    // ignore
  }
}

export function usePaperScoring(entries: ScoringEntry[], _classId: string, userId: string) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [sessionSettings, setSessionSettingsState] =
    useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [mode, setModeState] = useState<PaperScoringMode>(() => readModeFromStorage(userId));
  const [isSaving, setIsSaving] = useState(false);

  // Index of selected entry for sequential mode navigation
  const currentIndex = entries.findIndex(e => e.entryId === selectedEntryId);

  const selectEntry = useCallback((entryId: string) => {
    setSelectedEntryId(entryId);
  }, []);

  /** Returns entryId of the next unscored entry in run order, or null if all scored. */
  const nextUnscored = useCallback((): string | null => {
    const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
    const next = sorted.find(e => !e.isScored);
    return next?.entryId ?? null;
  }, [entries]);

  const performSave = useCallback(
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      const seconds = digitsToSeconds(timeDigits);
      const statusValue = RESULT_STATUS_MAP[result];
      setIsSaving(true);
      try {
        await replicatedEntriesTable.updateEntry(entryId, {
          result_status: statusValue,
          resultStatus: statusValue,
          search_time_seconds: seconds,
          searchTimeSeconds: seconds,
          total_faults: faults,
          totalFaults: faults,
          checkInStatus: 'completed',
          check_in_status: 'completed',
        });
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const saveEntry = useCallback(
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      await performSave(entryId, result, timeDigits, faults);
      setSelectedEntryId(null);
    },
    [performSave]
  );

  const saveAndNext = useCallback(
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      await performSave(entryId, result, timeDigits, faults);
      // Find next unscored (excluding the just-saved entry)
      const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
      const next = sorted.find(e => !e.isScored && e.entryId !== entryId);
      setSelectedEntryId(next?.entryId ?? null);
    },
    [performSave, entries]
  );

  const setSessionSettings = useCallback((patch: Partial<SessionSettings>) => {
    setSessionSettingsState(prev => ({ ...prev, ...patch }));
  }, []);

  const setMode = useCallback(
    (newMode: PaperScoringMode) => {
      setModeState(newMode);
      writeModeToStorage(userId, newMode);
    },
    [userId]
  );

  return {
    selectedEntryId,
    sessionSettings,
    mode,
    currentIndex,
    isSaving,
    selectEntry,
    nextUnscored,
    saveEntry,
    saveAndNext,
    setSessionSettings,
    setMode,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/hooks/usePaperScoring.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/hooks/
git commit -m "feat(scoring): add usePaperScoring hook"
```

---

## Task 3: `SessionToolbar` component

**Files:**

- Create: `apps/myk9show/src/pages/scoring/components/SessionToolbar.tsx`
- Test: `apps/myk9show/src/pages/scoring/components/SessionToolbar.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/components/SessionToolbar.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SessionToolbar } from './SessionToolbar';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';

describe('SessionToolbar', () => {
  it('renders pre-fill buttons', () => {
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /none/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^q$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^nq$/i })).toBeInTheDocument();
  });

  it('renders time mode buttons', () => {
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /q only/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all runs/i })).toBeInTheDocument();
  });

  it('calls onChange with updated preFill when Q is clicked', async () => {
    const onChange = vi.fn();
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^q$/i }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SESSION_SETTINGS, preFill: 'Q' });
  });

  it('calls onChange with updated timeRecordMode when All Runs is clicked', async () => {
    const onChange = vi.fn();
    render(<SessionToolbar settings={DEFAULT_SESSION_SETTINGS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /all runs/i }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SESSION_SETTINGS, timeRecordMode: 'all-runs' });
  });

  it('highlights active pre-fill button', () => {
    render(<SessionToolbar settings={{ ...DEFAULT_SESSION_SETTINGS, preFill: 'Q' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^q$/i })).toHaveAttribute('data-active', 'true');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SessionToolbar.test.tsx
```

- [ ] **Step 3: Implement component**

```typescript
// apps/myk9show/src/pages/scoring/components/SessionToolbar.tsx
import { cn } from '@/lib/utils';
import type { SessionSettings, PreFillOption, TimeRecordMode } from '../paper-scoring-types';

interface SessionToolbarProps {
  settings: SessionSettings;
  onChange: (settings: SessionSettings) => void;
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className={cn(
        'px-3 py-1 rounded text-sm font-medium border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted text-muted-foreground border-transparent hover:bg-accent'
      )}
    >
      {label}
    </button>
  );
}

export function SessionToolbar({ settings, onChange }: SessionToolbarProps) {
  const setPreFill = (preFill: PreFillOption) => onChange({ ...settings, preFill });
  const setTimeMode = (timeRecordMode: TimeRecordMode) => onChange({ ...settings, timeRecordMode });

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-muted/40 border-b text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Pre-fill:</span>
        <ToggleButton label="None" active={settings.preFill === 'none'} onClick={() => setPreFill('none')} />
        <ToggleButton label="Q" active={settings.preFill === 'Q'} onClick={() => setPreFill('Q')} />
        <ToggleButton label="NQ" active={settings.preFill === 'NQ'} onClick={() => setPreFill('NQ')} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium">Record time for:</span>
        <ToggleButton label="Q only" active={settings.timeRecordMode === 'q-only'} onClick={() => setTimeMode('q-only')} />
        <ToggleButton label="All runs" active={settings.timeRecordMode === 'all-runs'} onClick={() => setTimeMode('all-runs')} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SessionToolbar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/components/SessionToolbar.tsx apps/myk9show/src/pages/scoring/components/SessionToolbar.test.tsx
git commit -m "feat(scoring): add SessionToolbar component"
```

---

## Task 4: `ClassEntryRow` component

**Files:**

- Create: `apps/myk9show/src/pages/scoring/components/ClassEntryRow.tsx`
- Test: `apps/myk9show/src/pages/scoring/components/ClassEntryRow.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/components/ClassEntryRow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClassEntryRow } from './ClassEntryRow';
import type { ScoringEntry } from '../types';

function makeEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 1, entryId: 'e1', classId: 'c1', dogId: 'd1',
    callName: 'Buddy', handler: 'Smith', breed: 'Lab', armband: 101,
    status: 'pending', inRing: false, isScored: false, exhibitorOrder: 1,
    ...overrides,
  };
}

describe('ClassEntryRow', () => {
  it('renders armband and dog name', () => {
    render(<ClassEntryRow entry={makeEntry()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<ClassEntryRow entry={makeEntry()} isActive={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows Q badge for qualified scored entry', () => {
    const entry = makeEntry({
      isScored: true, status: 'scored',
      result: { time: 83450, faults: 0, qualification: 'Qualified' },
    });
    render(<ClassEntryRow entry={entry} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('Q')).toBeInTheDocument();
  });

  it('shows NQ badge for not-qualified scored entry', () => {
    const entry = makeEntry({
      isScored: true, status: 'scored',
      result: { time: 0, faults: 0, qualification: 'Not Qualified' },
    });
    render(<ClassEntryRow entry={entry} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  it('applies active styles when isActive is true', () => {
    render(<ClassEntryRow entry={makeEntry()} isActive={true} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/ClassEntryRow.test.tsx
```

- [ ] **Step 3: Implement component**

```typescript
// apps/myk9show/src/pages/scoring/components/ClassEntryRow.tsx
import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import type { ScoringEntry } from '../types';

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  Qualified:     { label: 'Q',   className: 'bg-teal-100 text-teal-700' },
  'Not Qualified': { label: 'NQ', className: 'bg-amber-100 text-amber-700' },
  Absent:        { label: 'ABS', className: 'bg-muted text-muted-foreground' },
  Excused:       { label: 'EX',  className: 'bg-muted text-muted-foreground' },
  Withdrawn:     { label: 'WD',  className: 'bg-muted text-muted-foreground' },
};

interface ClassEntryRowProps {
  entry: ScoringEntry;
  isActive: boolean;
  onClick: () => void;
}

export function ClassEntryRow({ entry, isActive, onClick }: ClassEntryRowProps) {
  const badge = entry.result ? RESULT_BADGE[entry.result.qualification] : undefined;

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        isActive
          ? 'bg-blue-50 border border-blue-300 dark:bg-blue-950 dark:border-blue-700'
          : 'hover:bg-accent',
        entry.isScored && !isActive && 'opacity-50'
      )}
    >
      <ArmbandBadge armband={String(entry.armband)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{entry.callName}</div>
        <div className="text-xs text-muted-foreground truncate">{entry.handler}</div>
      </div>
      {badge && (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', badge.className)}>
          {badge.label}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/ClassEntryRow.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/components/ClassEntryRow.tsx apps/myk9show/src/pages/scoring/components/ClassEntryRow.test.tsx
git commit -m "feat(scoring): add ClassEntryRow component"
```

---

## Task 5: `EntryPanel` component

This is the core component. Key behaviors:

- Result buttons shown first (Q, NQ, ABS, EX)
- Time field appears only when Q is selected (Q-only mode) or for any result (all-runs mode)
- Faults counter appears only when Q is selected
- When pre-fill is active: result pre-highlighted with dashed border, Save/Save & Next shown immediately
- NQ/ABS/EX in Q-only mode with no pre-fill: auto-saves on click (calls `onSave` immediately, no Save button)

**Files:**

- Create: `apps/myk9show/src/pages/scoring/components/EntryPanel.tsx`
- Test: `apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EntryPanel } from './EntryPanel';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';

function makeEntry(overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: 1, entryId: 'e1', classId: 'c1', dogId: 'd1',
    callName: 'Buddy', handler: 'Smith', breed: 'Lab', armband: 101,
    status: 'pending', inRing: false, isScored: false, exhibitorOrder: 1,
    ...overrides,
  };
}

describe('EntryPanel', () => {
  it('shows dog name and armband', () => {
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('shows Q NQ ABS EX result buttons', () => {
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    expect(screen.getByRole('button', { name: /^Q$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^NQ$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ABS$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^EX$/i })).toBeInTheDocument();
  });

  it('does not show time field before a result is selected', () => {
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    expect(screen.queryByPlaceholderText(/time/i)).not.toBeInTheDocument();
  });

  it('reveals time field when Q is selected', async () => {
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Q$/i }));
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('does not reveal time field when NQ selected in q-only mode', async () => {
    const onSave = vi.fn();
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={onSave} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /^NQ$/i }));
    expect(screen.queryByLabelText(/search time/i)).not.toBeInTheDocument();
    // Auto-saves immediately for NQ in q-only mode (no pre-fill)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('NQ', '', 0));
  });

  it('reveals time field for NQ in all-runs mode', async () => {
    render(
      <EntryPanel entry={makeEntry()}
        settings={{ preFill: 'none', timeRecordMode: 'all-runs' }}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /^NQ$/i }));
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('pre-fill: Q pre-highlighted with Save & Next visible', () => {
    render(
      <EntryPanel entry={makeEntry()}
        settings={{ preFill: 'Q', timeRecordMode: 'q-only' }}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    expect(screen.getByRole('button', { name: /^Q$/i })).toHaveAttribute('data-prefilled', 'true');
    expect(screen.getByRole('button', { name: /save & next/i })).toBeInTheDocument();
    // Time field shown because Q is pre-filled
    expect(screen.getByLabelText(/search time/i)).toBeInTheDocument();
  });

  it('pre-fill: NQ does not auto-save on open — shows Save buttons instead', () => {
    const onSave = vi.fn();
    render(
      <EntryPanel entry={makeEntry()}
        settings={{ preFill: 'NQ', timeRecordMode: 'q-only' }}
        onSave={onSave} onSaveAndNext={vi.fn()} onClose={vi.fn()} isSaving={false} />
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /save & next/i })).toBeInTheDocument();
  });

  it('Save & Next calls onSaveAndNext with result, timeDigits, faults', async () => {
    const onSaveAndNext = vi.fn();
    render(
      <EntryPanel entry={makeEntry()} settings={DEFAULT_SESSION_SETTINGS}
        onSave={vi.fn()} onSaveAndNext={onSaveAndNext} onClose={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /^Q$/i }));
    await userEvent.click(screen.getByRole('button', { name: /save & next/i }));
    expect(onSaveAndNext).toHaveBeenCalledWith('Q', expect.any(String), 0);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/EntryPanel.test.tsx
```

- [ ] **Step 3: Implement component**

```typescript
// apps/myk9show/src/pages/scoring/components/EntryPanel.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { TimeInput } from '@/components/ui/data-table';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface EntryPanelProps {
  entry: ScoringEntry;
  settings: SessionSettings;
  onSave: (result: PaperResult, timeDigits: string, faults: number) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number) => void;
  onClose: () => void;
  isSaving: boolean;
}

const RESULT_BUTTONS: { code: PaperResult; label: string; description: string }[] = [
  { code: 'Q',   label: 'Q',   description: 'Qualified' },
  { code: 'NQ',  label: 'NQ',  description: 'Not Qualified' },
  { code: 'ABS', label: 'ABS', description: 'Absent' },
  { code: 'EX',  label: 'EX',  description: 'Excused' },
];

/** True when selecting this result should immediately auto-save (no time needed) */
function shouldAutoSave(result: PaperResult, settings: SessionSettings): boolean {
  // Only auto-save NQ/ABS/EX in Q-only mode when there is no pre-fill active
  return (
    result !== 'Q' &&
    settings.timeRecordMode === 'q-only' &&
    settings.preFill === 'none'
  );
}

/** True when the time field should be shown given a selected result */
function showTimeField(result: PaperResult | null, settings: SessionSettings): boolean {
  if (result === null) return false;
  if (result === 'Q') return true;
  return settings.timeRecordMode === 'all-runs';
}

export function EntryPanel({
  entry,
  settings,
  onSave,
  onSaveAndNext,
  onClose,
  isSaving,
}: EntryPanelProps) {
  // Initialize selected result from pre-fill setting
  const initialResult: PaperResult | null =
    settings.preFill === 'none' ? null : settings.preFill;

  const [selectedResult, setSelectedResult] = useState<PaperResult | null>(initialResult);
  const [timeDigits, setTimeDigits] = useState('');
  const [faults, setFaults] = useState(0);

  // Re-initialize when entry changes (e.g. after Save & Next)
  useEffect(() => {
    setSelectedResult(settings.preFill === 'none' ? null : settings.preFill);
    setTimeDigits('');
    setFaults(0);
  }, [entry.entryId, settings.preFill]);

  const handleResultClick = (result: PaperResult) => {
    setSelectedResult(result);
    if (shouldAutoSave(result, settings)) {
      onSave(result, '', 0);
    }
  };

  const isPreFilled = (result: PaperResult) =>
    settings.preFill !== 'none' && result === settings.preFill;

  const showSaveButtons =
    selectedResult !== null &&
    !shouldAutoSave(selectedResult, settings);

  const displayTimeField = showTimeField(selectedResult, settings);

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Dog info */}
      <div className="flex items-center gap-3">
        <ArmbandBadge armband={String(entry.armband)} />
        <div>
          <div className="font-semibold">{entry.callName}</div>
          <div className="text-sm text-muted-foreground">
            {entry.handler}
          </div>
        </div>
      </div>

      {/* Result buttons */}
      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Result
        </div>
        <div className="flex flex-col gap-2">
          {RESULT_BUTTONS.map(({ code, label, description }) => {
            const isSelected = selectedResult === code;
            const isPrefilled = isPreFilled(code);
            return (
              <button
                key={code}
                onClick={() => handleResultClick(code)}
                data-prefilled={isPrefilled}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-colors font-semibold',
                  isSelected && !isPrefilled && 'border-primary bg-primary text-primary-foreground',
                  isPrefilled && 'border-dashed border-primary bg-primary/10',
                  !isSelected && !isPrefilled && 'border-border hover:bg-accent'
                )}
              >
                <span className="text-lg w-10">{label}</span>
                <span className="text-sm font-normal opacity-80">{description}</span>
                {isPrefilled && (
                  <span className="ml-auto text-xs text-muted-foreground">pre-filled · click to confirm</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time field — conditional */}
      {displayTimeField && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" htmlFor="time-input">
            Search Time{selectedResult !== 'Q' && <span className="ml-1 text-muted-foreground/60 normal-case">(optional)</span>}
          </label>
          <TimeInput
            value={timeDigits}
            onChange={setTimeDigits}
            onCommit={() => {}}
            onCancel={() => setTimeDigits('')}
            autoFocus
            className="h-12 text-xl text-center font-mono rounded-lg border-2 focus:border-primary"
          />
        </div>
      )}

      {/* Faults — only for Q */}
      {selectedResult === 'Q' && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Faults <span className="normal-case text-muted-foreground/60">(optional)</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFaults(f => Math.max(0, f - 1))}
              disabled={faults === 0}
            >
              −
            </Button>
            <span className="w-8 text-center font-semibold text-lg">{faults}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFaults(f => f + 1)}
            >
              +
            </Button>
          </div>
        </div>
      )}

      {/* Save buttons */}
      {showSaveButtons && (
        <div className="flex gap-2 mt-auto pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onSave(selectedResult!, timeDigits, faults)}
            disabled={isSaving}
          >
            Save
          </Button>
          <Button
            className="flex-1"
            onClick={() => onSaveAndNext(selectedResult!, timeDigits, faults)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save & Next'}
          </Button>
        </div>
      )}

      {/* Close / cancel */}
      <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/EntryPanel.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/components/EntryPanel.tsx apps/myk9show/src/pages/scoring/components/EntryPanel.test.tsx
git commit -m "feat(scoring): add EntryPanel component"
```

---

## Task 6: `SplitPanelView` component

**Files:**

- Create: `apps/myk9show/src/pages/scoring/components/SplitPanelView.tsx`
- Test: `apps/myk9show/src/pages/scoring/components/SplitPanelView.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/components/SplitPanelView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SplitPanelView } from './SplitPanelView';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';

function makeEntry(id: string, order: number, overrides: Partial<ScoringEntry> = {}): ScoringEntry {
  return {
    id: order, entryId: id, classId: 'c1', dogId: 'd1',
    callName: `Dog ${order}`, handler: 'Smith', breed: 'Lab', armband: 100 + order,
    status: 'pending', inRing: false, isScored: false, exhibitorOrder: order,
    ...overrides,
  };
}

const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];

describe('SplitPanelView', () => {
  it('renders all entry rows', () => {
    render(
      <SplitPanelView entries={entries} settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null} onSelectEntry={vi.fn()}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
    expect(screen.getByText('Dog 2')).toBeInTheDocument();
  });

  it('does not render panel when no entry selected', () => {
    render(
      <SplitPanelView entries={entries} settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null} onSelectEntry={vi.fn()}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.queryByText(/result/i)).not.toBeInTheDocument();
  });

  it('renders panel when entry is selected', () => {
    render(
      <SplitPanelView entries={entries} settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId="e1" onSelectEntry={vi.fn()}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.getByText(/result/i)).toBeInTheDocument();
  });

  it('calls onSelectEntry when a row is clicked', async () => {
    const onSelectEntry = vi.fn();
    render(
      <SplitPanelView entries={entries} settings={DEFAULT_SESSION_SETTINGS}
        selectedEntryId={null} onSelectEntry={onSelectEntry}
        onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(onSelectEntry).toHaveBeenCalledWith('e1');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SplitPanelView.test.tsx
```

- [ ] **Step 3: Implement**

```typescript
// apps/myk9show/src/pages/scoring/components/SplitPanelView.tsx
import { Card } from '@/components/ui/card';
import { ClassEntryRow } from './ClassEntryRow';
import { EntryPanel } from './EntryPanel';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface SplitPanelViewProps {
  entries: ScoringEntry[];
  settings: SessionSettings;
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  onSave: (result: PaperResult, timeDigits: string, faults: number) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number) => void;
  isSaving: boolean;
}

export function SplitPanelView({
  entries,
  settings,
  selectedEntryId,
  onSelectEntry,
  onSave,
  onSaveAndNext,
  isSaving,
}: SplitPanelViewProps) {
  const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
  const selectedEntry = sorted.find(e => e.entryId === selectedEntryId) ?? null;

  return (
    <div className="flex gap-4 h-full">
      {/* Left: entry list */}
      <Card className="flex-1 overflow-y-auto p-2 space-y-1">
        {sorted.map(entry => (
          <ClassEntryRow
            key={entry.entryId}
            entry={entry}
            isActive={entry.entryId === selectedEntryId}
            onClick={() => onSelectEntry(entry.entryId)}
          />
        ))}
      </Card>

      {/* Right: entry panel */}
      {selectedEntry && (
        <Card className="w-80 shrink-0 overflow-y-auto">
          <EntryPanel
            entry={selectedEntry}
            settings={settings}
            onSave={onSave}
            onSaveAndNext={onSaveAndNext}
            onClose={() => onSelectEntry('')}
            isSaving={isSaving}
          />
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SplitPanelView.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/components/SplitPanelView.tsx apps/myk9show/src/pages/scoring/components/SplitPanelView.test.tsx
git commit -m "feat(scoring): add SplitPanelView component"
```

---

## Task 7: `SequentialView` component

**Files:**

- Create: `apps/myk9show/src/pages/scoring/components/SequentialView.tsx`
- Test: `apps/myk9show/src/pages/scoring/components/SequentialView.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/pages/scoring/components/SequentialView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SequentialView } from './SequentialView';
import { DEFAULT_SESSION_SETTINGS } from '../paper-scoring-types';
import type { ScoringEntry } from '../types';

function makeEntry(id: string, order: number, isScored = false): ScoringEntry {
  return {
    id: order, entryId: id, classId: 'c1', dogId: 'd1',
    callName: `Dog ${order}`, handler: 'Smith', breed: 'Lab', armband: 100 + order,
    status: isScored ? 'scored' : 'pending', inRing: false, isScored,
    exhibitorOrder: order,
  };
}

const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3, true)];

describe('SequentialView', () => {
  it('shows progress text', () => {
    render(
      <SequentialView entries={entries} currentIndex={0} settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()} onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.getByText(/1 of 2 scored/i)).toBeInTheDocument();
  });

  it('renders dog name for current index', () => {
    render(
      <SequentialView entries={entries} currentIndex={0} settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()} onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.getByText('Dog 1')).toBeInTheDocument();
  });

  it('next arrow calls onNavigate with index+1', async () => {
    const onNavigate = vi.fn();
    render(
      <SequentialView entries={entries} currentIndex={0} settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={onNavigate} onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('prev arrow calls onNavigate with index-1', async () => {
    const onNavigate = vi.fn();
    render(
      <SequentialView entries={entries} currentIndex={1} settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={onNavigate} onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /prev/i }));
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('disables prev at index 0', () => {
    render(
      <SequentialView entries={entries} currentIndex={0} settings={DEFAULT_SESSION_SETTINGS}
        onNavigate={vi.fn()} onSave={vi.fn()} onSaveAndNext={vi.fn()} isSaving={false} />
    );
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SequentialView.test.tsx
```

- [ ] **Step 3: Implement**

```typescript
// apps/myk9show/src/pages/scoring/components/SequentialView.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EntryPanel } from './EntryPanel';
import type { ScoringEntry } from '../types';
import type { PaperResult, SessionSettings } from '../paper-scoring-types';

interface SequentialViewProps {
  entries: ScoringEntry[];
  currentIndex: number;
  settings: SessionSettings;
  onNavigate: (index: number) => void;
  onSave: (result: PaperResult, timeDigits: string, faults: number) => void;
  onSaveAndNext: (result: PaperResult, timeDigits: string, faults: number) => void;
  isSaving: boolean;
}

export function SequentialView({
  entries,
  currentIndex,
  settings,
  onNavigate,
  onSave,
  onSaveAndNext,
  isSaving,
}: SequentialViewProps) {
  const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
  const currentEntry = sorted[currentIndex] ?? null;
  const scoredCount = sorted.filter(e => e.isScored).length;
  const totalPending = sorted.filter(e => !e.isScored).length;
  const pct = sorted.length > 0 ? (scoredCount / sorted.length) * 100 : 0;

  if (!currentEntry) return null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{scoredCount} of {totalPending + scoredCount} scored</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="prev"
              disabled={currentIndex === 0}
              onClick={() => onNavigate(currentIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentIndex + 1} / {sorted.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="next"
              disabled={currentIndex >= sorted.length - 1}
              onClick={() => onNavigate(currentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Entry panel — full width */}
      <Card>
        <EntryPanel
          entry={currentEntry}
          settings={settings}
          onSave={onSave}
          onSaveAndNext={onSaveAndNext}
          onClose={() => {}}
          isSaving={isSaving}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd apps/myk9show && npx vitest run src/pages/scoring/components/SequentialView.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/components/SequentialView.tsx apps/myk9show/src/pages/scoring/components/SequentialView.test.tsx
git commit -m "feat(scoring): add SequentialView component"
```

---

## Task 8: `PaperScoresheetPage` + route update

**Files:**

- Create: `apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify: `apps/myk9show/src/pages/scoring/index.ts`

- [ ] **Step 1: Create the page**

```typescript
// apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, LayoutPanelLeft, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { useAuthContext } from '@/hooks/useAuthContext';
import { toScoringEntry, toClassInfo, calculatePlacements } from './types';
import { usePaperScoring } from './hooks/usePaperScoring';
import { SessionToolbar } from './components/SessionToolbar';
import { SplitPanelView } from './components/SplitPanelView';
import { SequentialView } from './components/SequentialView';
import { cn } from '@/lib/utils';
import type { ScoringEntry, ClassInfo } from './types';
import type { PaperResult } from './paper-scoring-types';

export function PaperScoresheetPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const breadcrumb = useScoringBreadcrumb(classId);

  const [entries, setEntries] = useState<ScoringEntry[]>([]);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load class + entries + dogs
  useEffect(() => {
    async function load() {
      if (!classId) return;
      setIsLoading(true);
      setError(null);
      try {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) { setError('Class not found'); return; }

        const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
        const dogsMap = new Map();
        for (const e of rawEntries) {
          if (e.dogId && !dogsMap.has(e.dogId)) {
            const dog = await replicatedDogsTable.get(e.dogId);
            if (dog) dogsMap.set(e.dogId, dog);
          }
        }
        const scoringEntries = rawEntries.map((e, i) =>
          toScoringEntry(e, dogsMap.get(e.dogId) ?? null, i)
        );
        setEntries(calculatePlacements(scoringEntries));
        setClassInfo(toClassInfo(cls, scoringEntries.length));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [classId]);

  const userId = user?.id ?? 'anonymous';
  const scoring = usePaperScoring(entries, classId ?? '', userId);

  // After a save, reload entries to reflect updated result_status
  const reloadEntries = async () => {
    if (!classId) return;
    const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
    const dogsMap = new Map();
    for (const e of rawEntries) {
      if (e.dogId && !dogsMap.has(e.dogId)) {
        const dog = await replicatedDogsTable.get(e.dogId);
        if (dog) dogsMap.set(e.dogId, dog);
      }
    }
    const updated = rawEntries.map((e, i) => toScoringEntry(e, dogsMap.get(e.dogId) ?? null, i));
    setEntries(calculatePlacements(updated));
  };

  const handleSave = async (result: PaperResult, timeDigits: string, faults: number) => {
    if (!scoring.selectedEntryId) return;
    await scoring.saveEntry(scoring.selectedEntryId, result, timeDigits, faults);
    await reloadEntries();
  };

  const handleSaveAndNext = async (result: PaperResult, timeDigits: string, faults: number) => {
    if (!scoring.selectedEntryId) return;
    await scoring.saveAndNext(scoring.selectedEntryId, result, timeDigits, faults);
    await reloadEntries();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const allScored = entries.length > 0 && entries.every(e => e.isScored);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      {!breadcrumb.isLoading && (
        <div className="px-4 pt-4">
          <Breadcrumb
            items={[
              ...(breadcrumb.showName ? [{ label: breadcrumb.showName, href: `/shows/${breadcrumb.showId}` }] : []),
              ...(breadcrumb.trialLabel ? [{ label: breadcrumb.trialLabel, href: `/shows/${breadcrumb.showId}` }] : []),
              { label: classInfo?.name ?? 'Class', isCurrentPage: true },
            ]}
          />
        </div>
      )}

      {/* Page header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="text-xl font-bold">{classInfo?.name ?? 'Score Entry'}</h1>
          <p className="text-sm text-muted-foreground">
            {entries.filter(e => e.isScored).length} of {entries.length} scored
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            variant={scoring.mode === 'split' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => scoring.setMode('split')}
            title="Split panel"
          >
            <LayoutPanelLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={scoring.mode === 'sequential' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => scoring.setMode('sequential')}
            title="Sequential"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Session toolbar */}
      <SessionToolbar
        settings={scoring.sessionSettings}
        onChange={scoring.setSessionSettings}
      />

      {/* All done */}
      {allScored && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
          <p className="text-2xl font-bold">All dogs scored!</p>
          <p className="text-muted-foreground">{entries.length} entries complete.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Back to Class</Button>
        </div>
      )}

      {/* Main content */}
      {!allScored && (
        <div className={cn('flex-1 overflow-hidden p-4', scoring.mode === 'sequential' && 'overflow-y-auto')}>
          {scoring.mode === 'split' ? (
            <SplitPanelView
              entries={entries}
              settings={scoring.sessionSettings}
              selectedEntryId={scoring.selectedEntryId}
              onSelectEntry={scoring.selectEntry}
              onSave={handleSave}
              onSaveAndNext={handleSaveAndNext}
              isSaving={scoring.isSaving}
            />
          ) : (
            <SequentialView
              entries={entries}
              currentIndex={Math.max(0, scoring.currentIndex)}
              settings={scoring.sessionSettings}
              onNavigate={index => {
                const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
                if (sorted[index]) scoring.selectEntry(sorted[index].entryId);
              }}
              onSave={handleSave}
              onSaveAndNext={handleSaveAndNext}
              isSaving={scoring.isSaving}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default PaperScoresheetPage;
```

- [ ] **Step 2: Update the route in `secretaryRoutes.tsx`**

Find the existing `ScoringEntryListPage` lazy import (around line 61) and the route at line 350. Replace:

```typescript
// REMOVE this lazy import (around line 61):
const ScoringEntryListPage = lazy(() =>
  import('@/pages/scoring/ScoringEntryListPage').then(m => ({ default: m.ScoringEntryListPage }))
);

// ADD this lazy import in its place:
const PaperScoresheetPage = lazy(() =>
  import('@/pages/scoring/PaperScoresheetPage').then(m => ({ default: m.PaperScoresheetPage }))
);
```

Then find the route at line 350 and replace `ScoringEntryListPage` with `PaperScoresheetPage`:

```typescript
// In the route at path="/scoring/classes/:classId/entries":
// Change <ScoringEntryListPage /> to <PaperScoresheetPage />
```

- [ ] **Step 3: Update `apps/myk9show/src/pages/scoring/index.ts`**

Add the new export:

```typescript
export { PaperScoresheetPage } from './PaperScoresheetPage';
```

- [ ] **Step 4: Start dev server and verify the page loads**

```bash
pnpm dev:show
```

Navigate to a show → trial → class → Enter Scores. Confirm the new paper entry page renders with the split panel layout.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/PaperScoresheetPage.tsx \
        apps/myk9show/src/routes/secretaryRoutes.tsx \
        apps/myk9show/src/pages/scoring/index.ts
git commit -m "feat(scoring): add PaperScoresheetPage and update route"
```

---

## Task 9: Update `ScoringModeWrapper` to navigate

Entry Management currently renders `ClassResultsTable` inline. Update it to navigate to the new page instead.

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/ScoringModeWrapper.tsx`

- [ ] **Step 1: Replace the render with a navigate**

Read the file first. The component currently renders `<ClassResultsTable ... />`. Replace it with an auto-navigate effect:

```typescript
// apps/myk9show/src/components/entries/management/ScoringModeWrapper.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ScoringModeWrapperProps {
  classId: string;
  showId: string;
  trialId: string;
  onBack: () => void;
}

/**
 * Redirects to the dedicated paper scoresheet entry page.
 * Previously rendered ClassResultsTable inline; now delegates to PaperScoresheetPage.
 */
export const ScoringModeWrapper: React.FC<ScoringModeWrapperProps> = ({ classId }) => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/scoring/classes/${classId}/entries`);
  }, [classId, navigate]);

  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
};
```

- [ ] **Step 2: Verify Entry Management still works**

With dev server running, navigate to Entry Management → select trial → select class → trigger scoring mode. Confirm it redirects to the paper scoresheet page.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/entries/management/ScoringModeWrapper.tsx
git commit -m "feat(scoring): ScoringModeWrapper redirects to PaperScoresheetPage"
```

---

## Task 10: Pipeline dashboard — "Enter Scores" on class cards

Add an "Enter Scores" link to class cards in the pipeline that are in a scoring-ready state, giving secretaries a one-click path from their dashboard.

**Files:**

- Modify: `apps/myk9show/src/features/pipeline/components/ClassPipelineColumn.tsx` (or the class card component inside it — read the file to find the right location)

- [ ] **Step 1: Read `ClassPipelineColumn.tsx` to find where class cards are rendered**

```bash
# Read the file to understand its structure before editing
```

Use the Read tool on `apps/myk9show/src/features/pipeline/components/ClassPipelineColumn.tsx`.

- [ ] **Step 2: Add "Enter Scores" link to class cards in scoring-relevant stages**

The scoring-relevant stages are those where dogs have checked in (e.g., `'in-ring'`, `'day-of'`, `'scoring'` — confirm exact stage names from `CLASS_PIPELINE_STAGES` in `mission-control-types.ts`).

In the class card render, add a `Link` to `/scoring/classes/${cls.id}/entries` when the class is in a scoring stage:

```typescript
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';

// Inside the card, after the existing class name/status display:
{SCORING_STAGES.has(cls.stage) && (
  <Link
    to={`/scoring/classes/${cls.id}/entries`}
    className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
    onClick={e => e.stopPropagation()}
  >
    <ClipboardCheck className="h-3 w-3" />
    Enter Scores
  </Link>
)}
```

Where `SCORING_STAGES` is a `Set` of the stage names that represent classes ready for scoring (defined at the top of the file after reading `CLASS_PIPELINE_STAGES`).

- [ ] **Step 3: Verify in browser**

Navigate to the secretary dashboard. Select a show and trial with a class in a scoring-ready stage. Confirm the "Enter Scores" link appears and navigates to `PaperScoresheetPage`.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/ClassPipelineColumn.tsx
git commit -m "feat(scoring): add Enter Scores link on pipeline class cards"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                                        | Covered by                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| Split Panel mode (table + side panel)                                   | Task 6 `SplitPanelView`                        |
| Sequential mode                                                         | Task 7 `SequentialView`                        |
| Result-first: Q reveals time + faults, NQ/ABS/EX may auto-save          | Task 5 `EntryPanel`                            |
| Pre-fill: pre-highlights but does not auto-save; Save/Save & Next shown | Task 5 `EntryPanel`                            |
| Pre-fill + NQ/Q-only mode: Save buttons shown, no auto-save             | Task 5 `EntryPanel` + Task 2 `usePaperScoring` |
| Time field for NQ when "All runs" mode active                           | Task 5 `EntryPanel`                            |
| Save and Save & Next buttons                                            | Task 5 `EntryPanel`                            |
| Mode toggle persisted in localStorage                                   | Task 2 `usePaperScoring`                       |
| Session settings reset per class                                        | Task 8 `PaperScoresheetPage` (component state) |
| Entry point: show → trial → class (existing route unchanged)            | Task 8 route update                            |
| Entry point: Entry Management → navigate                                | Task 9 `ScoringModeWrapper`                    |
| Entry point: Pipeline dashboard                                         | Task 10 class card link                        |
| Data: `replicatedEntriesTable` + `replicatedDogsTable`                  | Task 8 `PaperScoresheetPage`                   |
| Save: writes correct fields to `replicatedEntriesTable.updateEntry`     | Task 2 `usePaperScoring`                       |
| Next unscored: by `exhibitorOrder`, returns null when all done          | Task 2 `usePaperScoring`                       |
| "All dogs scored" completion state                                      | Task 8 `PaperScoresheetPage`                   |
| No live timer                                                           | Not present in any new component               |
| No confirmation dialog                                                  | Not present in any new component               |
| myK9Q / `packages/scoring-ui` untouched                                 | No tasks touch those files                     |
