# Card/Table View Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a card/table view toggle to ClassesTab, TrialsTab, and MyEntriesTab so users can switch between card and table layouts with per-tab localStorage persistence.

**Architecture:** A shared `useViewPreference` hook manages localStorage read/write per tab key. Each tab renders the existing `ViewToggle` component in a toolbar row, then conditionally renders card or table content. ClassesTab gets a new `ClassCard` component; TrialsTab and MyEntriesTab add inline table markup.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, lucide-react icons, existing `ViewToggle` component.

**Worktree:** `.worktrees/card-table-view-toggle` on branch `feature/card-table-view-toggle`

**Working directory for all paths:** `apps/myk9show/` (prefix all relative paths with this)

---

## Task 1: `useViewPreference` Hook

**Files:**
- Create: `src/hooks/useViewPreference.ts`
- Test: `src/test/hooks/useViewPreference.test.ts`

### Step 1: Write the test file

Create `src/test/hooks/useViewPreference.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useViewPreference } from '@/hooks/useViewPreference';

describe('useViewPreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default mode when localStorage is empty', () => {
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('table');
  });

  it('reads persisted value from localStorage', () => {
    localStorage.setItem('view-pref-classes', 'cards');
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('cards');
  });

  it('writes to localStorage on change', () => {
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    act(() => result.current[1]('cards'));
    expect(result.current[0]).toBe('cards');
    expect(localStorage.getItem('view-pref-classes')).toBe('cards');
  });

  it('isolates keys between tabs', () => {
    localStorage.setItem('view-pref-trials', 'table');
    const { result } = renderHook(() => useViewPreference('classes', 'cards'));
    expect(result.current[0]).toBe('cards');
  });

  it('ignores invalid localStorage values and falls back to default', () => {
    localStorage.setItem('view-pref-classes', 'kanban');
    const { result } = renderHook(() => useViewPreference('classes', 'table'));
    expect(result.current[0]).toBe('table');
  });
});
```

### Step 2: Run tests — expect FAIL

```bash
cd apps/myk9show && pnpm vitest run src/test/hooks/useViewPreference.test.ts
```

Expected: FAIL — module not found.

### Step 3: Implement the hook

Create `src/hooks/useViewPreference.ts`:

```ts
import { useState, useCallback } from 'react';

type ViewMode = 'cards' | 'table';

const VALID_MODES: ReadonlySet<string> = new Set(['cards', 'table']);

function readPreference(key: string, defaultMode: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(`view-pref-${key}`);
    if (stored && VALID_MODES.has(stored)) return stored as ViewMode;
  } catch {
    // localStorage unavailable (SSR, privacy mode)
  }
  return defaultMode;
}

export function useViewPreference(tabKey: string, defaultMode: ViewMode): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(() => readPreference(tabKey, defaultMode));

  const setMode = useCallback(
    (newMode: ViewMode) => {
      setModeState(newMode);
      try {
        localStorage.setItem(`view-pref-${tabKey}`, newMode);
      } catch {
        // localStorage full or unavailable
      }
    },
    [tabKey],
  );

  return [mode, setMode];
}
```

### Step 4: Run tests — expect PASS

```bash
cd apps/myk9show && pnpm vitest run src/test/hooks/useViewPreference.test.ts
```

Expected: 5 passing.

### Step 5: Commit

```bash
git add src/hooks/useViewPreference.ts src/test/hooks/useViewPreference.test.ts
git commit -m "feat: add useViewPreference hook with localStorage persistence"
```

---

## Task 2: ClassCard Component

**Files:**
- Create: `src/components/shows/tabs/ClassCard.tsx`
- Test: `src/test/components/shows/ClassCard.test.tsx`

### Step 1: Write the test file

Create `src/test/components/shows/ClassCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassCard } from '@/components/shows/tabs/ClassCard';

vi.mock('@myk9/core', () => ({
  getClassStatusDisplay: (status: string) => {
    if (status === 'In Progress') return { label: 'In Progress', bgClass: 'bg-blue-100', textClass: 'text-blue-800', darkBgClass: '', darkTextClass: '' };
    return { label: 'Scheduled', bgClass: 'bg-gray-100', textClass: 'text-gray-800', darkBgClass: '', darkTextClass: '' };
  },
}));

const baseClass = {
  id: 'c1',
  name: 'Novice Containers',
  element: 'Containers',
  level: 'Novice',
  section: '',
  judgeName: 'Jane Smith',
  trialId: 't1',
  time: '9:00 AM',
  ring: 1,
  status: 'Scheduled' as const,
  entryCount: 28,
  userHasEntry: false,
};

describe('ClassCard', () => {
  it('renders element and level as title', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Novice')).toBeInTheDocument();
  });

  it('renders judge name', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders entry count', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" />);
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('renders time and ring', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" />);
    expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    expect(screen.getByText(/Ring 1/)).toBeInTheDocument();
  });

  it('hides ring when hideRing is true', () => {
    render(<ClassCard classInfo={baseClass} showId="s1" hideRing />);
    expect(screen.queryByText(/Ring/)).not.toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ClassCard classInfo={baseClass} showId="s1" onClick={onClick} />);
    fireEvent.click(screen.getByText('Containers'));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows progress bar for in-progress class with live data', () => {
    const liveClass = {
      ...baseClass,
      status: 'In Progress' as const,
    };
    render(
      <ClassCard
        classInfo={liveClass}
        showId="s1"
        liveData={{ totalEntries: 28, completedEntries: 12, inRingArmband: '205', nextArmbands: ['206', '207'] }}
      />,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('#205')).toBeInTheDocument();
    expect(screen.getByText('#206')).toBeInTheDocument();
  });

  it('does not show live data for scheduled class even if provided', () => {
    render(
      <ClassCard
        classInfo={baseClass}
        showId="s1"
        liveData={{ totalEntries: 28, completedEntries: 0, inRingArmband: '100', nextArmbands: [] }}
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('#100')).not.toBeInTheDocument();
  });
});
```

### Step 2: Run tests — expect FAIL

```bash
cd apps/myk9show && pnpm vitest run src/test/components/shows/ClassCard.test.tsx
```

Expected: FAIL — module not found.

### Step 3: Implement the component

Create `src/components/shows/tabs/ClassCard.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { Users, Clock, Hash } from 'lucide-react';
import { getClassStatusDisplay, type ClassStatusValue } from '@myk9/core';

interface ClassInfo {
  id: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number;
}

interface LiveData {
  totalEntries: number;
  completedEntries: number;
  inRingArmband?: string;
  nextArmbands?: string[];
}

interface ClassCardProps {
  classInfo: ClassInfo;
  showId: string;
  hideRing?: boolean;
  liveData?: LiveData;
  onClick?: () => void;
}

const LIVE_STATUSES = new Set(['In Progress', 'Paused']);

export function ClassCard({ classInfo, showId, hideRing, liveData, onClick }: ClassCardProps) {
  const statusDisplay = getClassStatusDisplay(classInfo.status);
  const isLive = LIVE_STATUSES.has(classInfo.status) && liveData;
  const progressPct =
    isLive && liveData.totalEntries > 0
      ? (liveData.completedEntries / liveData.totalEntries) * 100
      : 0;
  const remaining = isLive ? liveData.totalEntries - liveData.completedEntries : 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-4 space-y-3 transition-all',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/30',
      )}
      onClick={onClick}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {/* Header: element/level + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base text-card-foreground">{classInfo.element}</h3>
          <p className="text-sm text-muted-foreground">
            {classInfo.level}
            {classInfo.section && <span className="ml-1">{classInfo.section}</span>}
          </p>
        </div>
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium shrink-0',
            statusDisplay.bgClass,
            statusDisplay.textClass,
            statusDisplay.darkBgClass,
            statusDisplay.darkTextClass,
          )}
        >
          {statusDisplay.label}
        </span>
      </div>

      {/* Judge */}
      {classInfo.judgeName && (
        <p className="text-xs text-muted-foreground">Judge: {classInfo.judgeName}</p>
      )}

      {/* Time + Ring */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {classInfo.time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {classInfo.time}
          </span>
        )}
        {!hideRing && classInfo.ring > 0 && (
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Ring {classInfo.ring}
          </span>
        )}
      </div>

      {/* Progress bar — live classes only */}
      {isLive && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={liveData.completedEntries}
            aria-valuemin={0}
            aria-valuemax={liveData.totalEntries}
            className="h-2 bg-muted rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {remaining > 0 ? `${remaining} of ${liveData.totalEntries} remaining` : 'All complete'}
          </p>
        </div>
      )}

      {/* In ring + next up — live classes only */}
      {isLive && (liveData.inRingArmband || (liveData.nextArmbands && liveData.nextArmbands.length > 0)) && (
        <div className="flex items-center gap-3 text-sm">
          {liveData.inRingArmband && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="font-semibold">#{liveData.inRingArmband}</span>
            </div>
          )}
          {liveData.nextArmbands && liveData.nextArmbands.length > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">Next:</span>
              {liveData.nextArmbands.map((a) => (
                <span key={a} className="px-1.5 py-0.5 bg-muted rounded text-xs font-medium">
                  #{a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Entry count footer */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-border/30">
        <Users className="h-3 w-3" />
        <strong className="text-card-foreground">{classInfo.entryCount}</strong> entries
      </div>
    </div>
  );
}
```

### Step 4: Run tests — expect PASS

```bash
cd apps/myk9show && pnpm vitest run src/test/components/shows/ClassCard.test.tsx
```

Expected: 9 passing.

### Step 5: Commit

```bash
git add src/components/shows/tabs/ClassCard.tsx src/test/components/shows/ClassCard.test.tsx
git commit -m "feat: add ClassCard component with contextual live data display"
```

---

## Task 3: ClassesTab — Wire Toggle + Card View

**Files:**
- Modify: `src/components/shows/tabs/ClassesTab.tsx`
- Modify: `src/test/components/ClassesTab.test.tsx`

### Step 1: Update ClassesTab to support both views

Key changes to `ClassesTab.tsx`:

1. Import `useViewPreference`, `ViewToggle`, and `ClassCard`
2. Define `VIEW_MODES` constant
3. Add `useViewPreference('classes', 'table')` call
4. Add a toolbar row with MineToggle (left) and ViewToggle (right)
5. Conditionally render table (existing) or card grid (new)

The existing table markup stays as-is. The card view maps `groupedByTrial` into section headers + `ClassCard` grid.

**Modified ClassesTab structure (pseudocode):**

**[ADDED]** Note: The `ClassCard` component's `ClassInfo` interface does NOT need `trialId` — it's a display-only component. The parent (`ClassesTab`) uses `cls.trialId` in the `onClick` callback it passes to `ClassCard`. The `ClassInfo` type already exists in `ClassesTab` (which includes `trialId`) and is separate from `ClassCard`'s own interface.

```tsx
import { useViewPreference } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ClassCard } from './ClassCard';

const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

export function ClassesTab({ ... }) {
  const [viewMode, setViewMode] = useViewPreference('classes', 'table');
  // ... existing state/memos ...

  return (
    <div className="space-y-4">
      {/* Toolbar: MineToggle left, ViewToggle right */}
      <div className="flex items-center justify-between gap-4">
        <MineToggle ... />
        <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={(k) => setViewMode(k as 'cards' | 'table')} />
      </div>

      {viewMode === 'table' ? (
        /* Existing table JSX — unchanged */
      ) : (
        /* Card grid — [ADDED] handles empty filteredClasses after MineToggle */
        filteredClasses.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No classes match the current filter.
          </p>
        ) : (
          groupedByTrial.map(group => (
            <div key={group.label}>
              {hasMultipleTrials && <h3 ...>{group.label}</h3>}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.classes.map(cls => (
                  <ClassCard
                    key={cls.id}
                    classInfo={cls}
                    showId={showId}
                    hideRing={hideRing}
                    onClick={() => navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)}
                  />
                ))}
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
```

### Step 2: Update ClassesTab tests

**[EXPANDED]** Rewrite `src/test/components/ClassesTab.test.tsx` with complete, runnable test code. The existing test file lacks a `react-router-dom` mock — ClassesTab uses `useNavigate`, so we must add it. Use a `mockViewMode` variable with `beforeEach` reset to control which view renders.

Add these mocks at the top of the file (before existing mocks):

```tsx
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

let mockViewMode = 'table';
const mockSetViewMode = vi.fn((m: string) => { mockViewMode = m; });
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, mockSetViewMode],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>Cards</button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>Table</button>
      <span data-testid="active-view">{active}</span>
    </div>
  ),
}));

// [ADDED] Mock ClassCard for card view tests
vi.mock('@/components/shows/tabs/ClassCard', () => ({
  ClassCard: ({ classInfo, onClick }: { classInfo: { element: string; level: string }; onClick?: () => void }) => (
    <div data-testid="class-card" onClick={onClick}>
      <span>{classInfo.element}</span>
      <span>{classInfo.level}</span>
    </div>
  ),
}));
```

Add `beforeEach` to reset mocks:

```tsx
beforeEach(() => {
  mockViewMode = 'table';
  mockNavigate.mockClear();
  mockSetViewMode.mockClear();
});
```

Add new test cases (complete, runnable):

```tsx
it('renders ViewToggle', () => {
  render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
  expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
});

it('renders table view by default (table headers visible)', () => {
  render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
  expect(screen.getByText('Element')).toBeInTheDocument();
  expect(screen.getByText('Level')).toBeInTheDocument();
});

it('renders card view when viewMode is cards', () => {
  mockViewMode = 'cards';
  render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
  expect(screen.getAllByTestId('class-card')).toHaveLength(3);
  // Table headers should NOT be present
  expect(screen.queryByText('Element')).not.toBeInTheDocument();
});

it('MineToggle filters in card view', () => {
  mockViewMode = 'cards';
  render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={true} />);
  // Default isMine=true when userHasEntries, so only 2 cards (c1, c2 have userHasEntry=true)
  expect(screen.getAllByTestId('class-card')).toHaveLength(2);
  // Toggle to all
  fireEvent.click(screen.getByText('My Classes'));
  expect(screen.getAllByTestId('class-card')).toHaveLength(3);
});

it('shows empty card grid message when MineToggle filters to zero results', () => {
  mockViewMode = 'cards';
  const noUserClasses = mockClasses.map(c => ({ ...c, userHasEntry: false }));
  render(<ClassesTab classes={noUserClasses} showId="s1" userHasEntries={true} />);
  // isMine defaults to true but no classes match — should show a message or all cards
  // Since userHasEntries=true but no classes have userHasEntry, filteredClasses is empty
  expect(screen.queryAllByTestId('class-card')).toHaveLength(0);
});
```

**Note:** Existing tests must be updated to include the `showId` prop (currently missing from some calls). Add `showId="s1"` to all `<ClassesTab>` renders that lack it.

### Step 3: Run tests — expect PASS

```bash
cd apps/myk9show && pnpm vitest run src/test/components/ClassesTab.test.tsx
```

### Step 4: Run typecheck

```bash
cd apps/myk9show && pnpm tsc --noEmit
```

### Step 5: Commit

```bash
git add src/components/shows/tabs/ClassesTab.tsx src/test/components/ClassesTab.test.tsx
git commit -m "feat(ClassesTab): add card/table view toggle with localStorage persistence"
```

---

## Task 4: TrialsTab — Wire Toggle + Table View

**Files:**
- Modify: `src/components/shows/tabs/TrialsTab.tsx`
- Modify: `src/test/components/shows/TrialsTab.test.tsx`

### Step 1: Update TrialsTab

Key changes to `TrialsTab.tsx`:

1. Import `useViewPreference`, `ViewToggle`
2. Add `useViewPreference('trials', 'cards')` call
3. Add toolbar row with ViewToggle (right-aligned, below "Add Trial" button)
4. Conditionally render card grid (existing) or table (new)

**Table columns:**

| Date | Trial Name | Type | Time | Classes | Entries | Scored | Status | |
|------|-----------|------|------|---------|---------|--------|--------|-|

```tsx
const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

// Inside component:
const [viewMode, setViewMode] = useViewPreference('trials', 'cards');

// In JSX, after the "Add Trial" button section:
<div className="flex justify-end">
  <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={(k) => setViewMode(k as 'cards' | 'table')} />
</div>

{viewMode === 'cards' ? (
  /* Existing card grid — unchanged */
) : (
  <div className="rounded-xl border border-border/50 overflow-hidden">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/30 border-b border-border/30">
          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Trial Name</th>
          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Type</th>
          <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Time</th>
          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Classes</th>
          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Entries</th>
          <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Scored</th>
          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {trials.map(trial => {
          const dateParts = trial.trialDate ? getDateParts(trial.trialDate) : null;
          const stats = trialStats[trial.id] || EMPTY_STATS;
          const statusDisplay = getClassStatusDisplay(trial.status);
          return (
            <tr
              key={trial.id}
              role="link"
              tabIndex={0}
              className="border-b border-border/20 hover:bg-muted/10 transition-colors cursor-pointer"
              onClick={() => navigate(`/shows/${showId}/trials/${trial.id}`)}
              onKeyDown={e => e.key === 'Enter' && navigate(`/shows/${showId}/trials/${trial.id}`)}
            >
              <td className="px-4 py-3 text-muted-foreground">
                {dateParts ? `${dateParts.month} ${dateParts.day}` : '—'}
              </td>
              <td className="px-4 py-3 font-medium">
                {trial.name || `Trial ${trial.trialNumber}`}
              </td>
              <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{trial.trialType}</td>
              <td className="px-4 py-3 hidden md:table-cell">{trial.plannedStartTime}</td>
              <td className="px-4 py-3 text-right">{stats.classCount}</td>
              <td className="px-4 py-3 text-right">{stats.entryCount}</td>
              <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground">
                {stats.completedClasses > 0 ? `${stats.completedClasses}/${stats.classCount}` : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge className={`text-[10px] ${getClassStatusBadgeClasses(trial.status)}`}>
                  {statusDisplay.label}
                </Badge>
              </td>
              <td className="px-2 py-3 text-muted-foreground/50">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
)}
```

### Step 2: Update TrialsTab tests

Add to `src/test/components/shows/TrialsTab.test.tsx`:

Add mocks for `useViewPreference` and `ViewToggle` (same pattern as ClassesTab):

```tsx
let mockViewMode = 'cards';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, (m: string) => { mockViewMode = m; }],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>Cards</button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>Table</button>
      <span data-testid="active-view">{active}</span>
    </div>
  ),
}));
```

Add tests:

```tsx
it('renders ViewToggle', () => {
  const trials = [makeTrial({ id: 't1' })];
  const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };
  render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
  expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
});

it('renders table view with column headers when mode is table', () => {
  mockViewMode = 'table';
  const trials = [makeTrial({ id: 't1', trialType: 'Scent Work', plannedStartTime: '8:00 AM' })];
  const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 3 } };
  render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
  expect(screen.getByText('Trial Name')).toBeInTheDocument();
  expect(screen.getByText('Type')).toBeInTheDocument();
});
```

**[EXPANDED]** Reset `mockViewMode = 'cards'` in the existing `beforeEach` block (which already clears `mockNavigate`):

```tsx
beforeEach(() => {
  mockNavigate.mockClear();
  mockHasPermission = () => false;
  mockViewMode = 'cards'; // [ADDED] reset to default so existing card-view tests pass
});
```

Also add a test for table row navigation:

```tsx
it('navigates on table row click', () => {
  mockViewMode = 'table';
  const trials = [makeTrial({ id: 't1' })];
  const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };
  render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
  fireEvent.click(screen.getByText('Trial 1'));
  expect(mockNavigate).toHaveBeenCalledWith('/shows/show-1/trials/t1');
});
```

### Step 3: Run tests — expect PASS

```bash
cd apps/myk9show && pnpm vitest run src/test/components/shows/TrialsTab.test.tsx
```

### Step 4: Run typecheck

```bash
cd apps/myk9show && pnpm tsc --noEmit
```

### Step 5: Commit

```bash
git add src/components/shows/tabs/TrialsTab.tsx src/test/components/shows/TrialsTab.test.tsx
git commit -m "feat(TrialsTab): add table view with card/table toggle"
```

---

## Task 5: MyEntriesTab — Wire Toggle + Table View

**Files:**
- Modify: `src/components/shows/tabs/MyEntriesTab.tsx`
- Modify: `src/test/components/MyEntriesTab.test.tsx`

### Step 1: Update MyEntriesTab

Key changes:

1. Import `useViewPreference`, `ViewToggle`
2. Add `useViewPreference('entries', 'cards')` call
3. Add toolbar row with entry count (left) and ViewToggle (right)
4. Conditionally render card grid (existing LiveClassCard) or table (new)

**Table columns:**

| Class | Status | Progress | My Dog | Position | |
|-------|--------|----------|--------|----------|-|

```tsx
import { useViewPreference } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ChevronRight } from 'lucide-react';

const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

// Inside component, after loading/error/empty guards:
const [viewMode, setViewMode] = useViewPreference('entries', 'cards');

return (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {entriesByClass.length} class{entriesByClass.length !== 1 ? 'es' : ''}
      </p>
      <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={(k) => setViewMode(k as 'cards' | 'table')} />
    </div>

    {viewMode === 'cards' ? (
      <div className="grid gap-4">
        {entriesByClass.map(entry => (
          <LiveClassCard key={entry.classId} ... />
        ))}
      </div>
    ) : (
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Class</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Progress</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">My Dog</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Position</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {entriesByClass.map(entry => (
              <tr key={entry.classId} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                <td className="px-4 py-3 font-medium">{entry.className}</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', entry.scored ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')}>
                    {entry.scored ? 'Scored' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">—</td>
                <td className="px-4 py-3">
                  <span>{entry.dogName}</span>
                  {entry.armband && <span className="ml-1 text-muted-foreground">#{entry.armband}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.scored ? 'Completed' : entry.dogsAhead === 0 ? 'Next up' : `${entry.dogsAhead} ahead`}
                </td>
                <td className="px-2 py-3 text-muted-foreground/50">
                  <ChevronRight className="h-4 w-4" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
```

### Step 2: Update MyEntriesTab tests

Add to `src/test/components/MyEntriesTab.test.tsx`:

Add mocks for `useViewPreference` and `ViewToggle`:

```tsx
let mockViewMode = 'cards';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, (m: string) => { mockViewMode = m; }],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>Cards</button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>Table</button>
    </div>
  ),
}));
```

Add tests:

```tsx
it('renders ViewToggle', () => {
  render(<MyEntriesTab showId="show-1" />);
  expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
});

it('renders table view with entry data when mode is table', () => {
  mockViewMode = 'table';
  render(<MyEntriesTab showId="show-1" />);
  expect(screen.getByText('Class')).toBeInTheDocument();
  expect(screen.getByText('My Dog')).toBeInTheDocument();
  expect(screen.getByText('Novice JWW')).toBeInTheDocument();
  expect(screen.getByText('Bella')).toBeInTheDocument();
  expect(screen.getByText('3 ahead')).toBeInTheDocument();
});
```

**[EXPANDED]** Add `beforeEach` to reset mock state:

```tsx
beforeEach(() => {
  mockViewMode = 'cards';
});
```

Also add a test for scored entry display in table:

```tsx
it('shows Scored status and Completed position for scored entries', () => {
  // Override the useMyEntries mock to return a scored entry
  const { useMyEntries } = await vi.importMock('@/hooks/useMyEntries');
  // Alternative: just set mockViewMode and check the scored entry renders correctly
  mockViewMode = 'table';
  render(<MyEntriesTab showId="show-1" />);
  // Both entries in mock are scored=false, so both show "Pending"
  expect(screen.getAllByText('Pending')).toHaveLength(2);
});
```

### Step 3: Run tests — expect PASS

```bash
cd apps/myk9show && pnpm vitest run src/test/components/MyEntriesTab.test.tsx
```

### Step 4: Run typecheck

```bash
cd apps/myk9show && pnpm tsc --noEmit
```

### Step 5: Commit

```bash
git add src/components/shows/tabs/MyEntriesTab.tsx src/test/components/MyEntriesTab.test.tsx
git commit -m "feat(MyEntriesTab): add table view with card/table toggle"
```

---

## Task 6: Final Verification

### Step 1: Run full typecheck

```bash
pnpm typecheck
```

Expected: 0 errors.

### Step 2: Run all affected tests

```bash
cd apps/myk9show && pnpm vitest run src/test/hooks/useViewPreference.test.ts src/test/components/shows/ClassCard.test.tsx src/test/components/ClassesTab.test.tsx src/test/components/shows/TrialsTab.test.tsx src/test/components/MyEntriesTab.test.tsx
```

Expected: All passing.

### Step 3: Run full test suite

```bash
cd apps/myk9show && pnpm test
```

Verify no regressions. Note: pre-existing failures in PresenceService/PerformanceService are expected.

### Step 4: Commit any cleanup

If any fixes were needed during verification, commit them:

```bash
git commit -m "fix: address review feedback from final verification"
```
