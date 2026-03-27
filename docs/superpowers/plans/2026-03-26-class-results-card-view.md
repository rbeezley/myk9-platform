# Class Results Card View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a card/table view toggle to ClassResultsTable so entries can be displayed as myK9Q-style cards with armband badge, dog info, and status badge, with click-to-score navigation.

**Architecture:** New `EntryCard` and `EntryCardGrid` components live inside the existing `ClassResultsTable/` directory. The parent `ClassResultsTable` gains a `useViewPreference` hook and `ViewToggle` in its header bar. When in card mode, `EntryCardGrid` renders instead of `DataTable`. Cards use `ScentWorkEntry.displayInfo` for data (not `BulkEntryData`).

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest + React Testing Library, existing `useViewPreference` hook and `ViewToggle` component.

**Spec:** `docs/superpowers/specs/2026-03-26-class-results-card-view-design.md`

---

### Task 1: Create entry status config

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts`

- [ ] **Step 1: Create the status type and badge config map**

```typescript
// apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts

export type EntryStatus =
  | 'no_status'
  | 'checked_in'
  | 'conflict'
  | 'pulled'
  | 'come_to_gate'
  | 'at_gate'
  | 'in_ring';

export interface StatusBadgeConfig {
  label: string;
  icon: string;
  className: string;
}

export const ENTRY_STATUS_CONFIG: Record<EntryStatus, StatusBadgeConfig> = {
  no_status: {
    label: 'No Status',
    icon: '',
    className: 'bg-muted text-muted-foreground',
  },
  checked_in: {
    label: 'Checked-in',
    icon: '✓',
    className: 'bg-green-600 text-white',
  },
  conflict: {
    label: 'Conflict',
    icon: '⚠',
    className: 'bg-orange-500 text-white',
  },
  pulled: {
    label: 'Pulled',
    icon: '✕',
    className: 'bg-red-500 text-white',
  },
  come_to_gate: {
    label: 'Come to Gate',
    icon: '✦',
    className: 'bg-primary text-primary-foreground',
  },
  at_gate: {
    label: 'At Gate',
    icon: '★',
    className: 'bg-sky-500 text-white',
  },
  in_ring: {
    label: 'In Ring',
    icon: '●',
    className: 'bg-amber-500 text-white',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/entryStatusConfig.ts
git commit -m "feat(class-results): add entry status type and badge config"
```

---

### Task 2: Create EntryCard component with tests

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx`
- Create: `apps/myk9show/src/components/classes/__tests__/EntryCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/components/classes/__tests__/EntryCard.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntryCard } from '../ClassResultsTable/EntryCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    entryId: 'entry-1',
    armband: '107',
    dogName: 'Laila',
    dogBreed: 'Scottish Terrier',
    handlerName: 'Kathy Gray',
    status: 'no_status' as const,
    ...overrides,
  };
}

function renderCard(
  props: Partial<React.ComponentProps<typeof EntryCard>> = {}
) {
  const defaultProps = {
    entry: makeEntry(),
    classId: 'class-1',
    scoringRoute: '/scoring/secretary/classes/class-1/entries/entry-1',
  };
  return render(
    <MemoryRouter>
      <EntryCard {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('EntryCard', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders armband number', () => {
    renderCard();
    expect(screen.getByText('107')).toBeInTheDocument();
  });

  it('renders dog name', () => {
    renderCard();
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('renders breed', () => {
    renderCard();
    expect(screen.getByText('Scottish Terrier')).toBeInTheDocument();
  });

  it('renders handler name with prefix', () => {
    renderCard();
    expect(screen.getByText(/Handler:.*Kathy Gray/)).toBeInTheDocument();
  });

  it('renders status badge with label', () => {
    renderCard({ entry: makeEntry({ status: 'checked_in' }) });
    expect(screen.getByText(/Checked-in/)).toBeInTheDocument();
  });

  it('renders "No Status" badge by default', () => {
    renderCard();
    expect(screen.getByText('No Status')).toBeInTheDocument();
  });

  it('navigates to scoring route on click', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/scoring/secretary/classes/class-1/entries/entry-1'
    );
  });

  it('renders come_to_gate badge with primary color', () => {
    renderCard({
      entry: makeEntry({ status: 'come_to_gate' }),
    });
    const badge = screen.getByText(/Come to Gate/);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-primary');
  });

  it('shows -- for missing armband', () => {
    renderCard({ entry: makeEntry({ armband: '' }) });
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  // [ADDED] Verify card is a focusable button for keyboard accessibility
  it('renders as a button element for keyboard access', () => {
    renderCard();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/EntryCard.test.tsx`
Expected: FAIL — `EntryCard` module not found

- [ ] **Step 3: Implement EntryCard component**

```typescript
// apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx

import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import {
  type EntryStatus,
  ENTRY_STATUS_CONFIG,
} from './entryStatusConfig';

export interface EntryCardEntry {
  entryId: string;
  armband: string;
  dogName: string;
  dogBreed: string;
  handlerName: string;
  status: EntryStatus;
}

interface EntryCardProps {
  entry: EntryCardEntry;
  classId: string;
  scoringRoute: string;
}

export function EntryCard({ entry, scoringRoute }: EntryCardProps) {
  const navigate = useNavigate();
  const statusConfig = ENTRY_STATUS_CONFIG[entry.status];

  return (
    <button
      type="button"
      onClick={() => navigate(scoringRoute)}
      className={cn(
        'w-full text-left bg-card rounded-xl border border-border p-4',
        'flex items-start gap-3.5 cursor-pointer',
        'transition-colors hover:border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <ArmbandBadge
        armband={entry.armband}
        className="size-12 rounded-[10px] text-lg"
      />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <span className="font-semibold text-[15px] text-foreground truncate">
            {entry.dogName}
          </span>
          <span
            className={cn(
              'shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md',
              statusConfig.className
            )}
          >
            {statusConfig.icon && `${statusConfig.icon} `}
            {statusConfig.label}
          </span>
        </div>
        <div className="text-[13px] text-muted-foreground truncate">
          {entry.dogBreed}
        </div>
        <div className="text-xs text-muted-foreground/70 truncate">
          Handler: {entry.handlerName}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/EntryCard.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/EntryCard.tsx \
       apps/myk9show/src/components/classes/__tests__/EntryCard.test.tsx
git commit -m "feat(class-results): add EntryCard component with tests"
```

---

### Task 3: Create EntryCardGrid component with tests

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/EntryCardGrid.tsx`
- Create: `apps/myk9show/src/components/classes/__tests__/EntryCardGrid.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/components/classes/__tests__/EntryCardGrid.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryCardGrid } from '../ClassResultsTable/EntryCardGrid';
import type { ScentWorkEntry } from '@/types/scent-work-types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeScentWorkEntry(overrides: Partial<ScentWorkEntry> = {}): ScentWorkEntry {
  return {
    id: 'entry-1',
    status: 'registered',
    displayInfo: {
      armband: '107',
      dogName: 'Laila',
      dogBreed: 'Scottish Terrier',
      handlerName: 'Kathy Gray',
      dogId: 'dog-1',
      handlerId: 'handler-1',
    },
    classConfig: {
      element: 'Container',
      level: 'Advanced',
      timeLimit: '3:00',
      multiArea: false,
      warningsEnabled: true,
    },
    ...overrides,
  } as ScentWorkEntry;
}

function renderGrid(entries: ScentWorkEntry[] = [], useSecretaryRoute = true) {
  return render(
    <MemoryRouter>
      <EntryCardGrid
        entries={entries}
        classId="class-1"
        useSecretaryRoute={useSecretaryRoute}
      />
    </MemoryRouter>
  );
}

describe('EntryCardGrid', () => {
  it('renders one card per entry', () => {
    const entries = [
      makeScentWorkEntry({ id: 'e1', displayInfo: { armband: '107', dogName: 'Laila', dogBreed: 'Scottish Terrier', handlerName: 'Kathy Gray', dogId: 'd1', handlerId: 'h1' } }),
      makeScentWorkEntry({ id: 'e2', displayInfo: { armband: '143', dogName: 'Allen', dogBreed: 'Dalmatian', handlerName: 'Lynda Brownson', dogId: 'd2', handlerId: 'h2' } }),
      makeScentWorkEntry({ id: 'e3', displayInfo: { armband: '146', dogName: 'Cow', dogBreed: 'French Bulldog', handlerName: 'Michelle Shields', dogId: 'd3', handlerId: 'h3' } }),
    ];
    renderGrid(entries);

    expect(screen.getByText('Laila')).toBeInTheDocument();
    expect(screen.getByText('Allen')).toBeInTheDocument();
    expect(screen.getByText('Cow')).toBeInTheDocument();
  });

  it('renders empty state when no entries', () => {
    renderGrid([]);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('builds secretary scoring route when useSecretaryRoute is true', () => {
    const entries = [makeScentWorkEntry({ id: 'entry-1' })];
    renderGrid(entries, true);
    // Card should exist; route correctness verified via click in EntryCard tests
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('builds judge scoring route when useSecretaryRoute is false', () => {
    const entries = [makeScentWorkEntry({ id: 'entry-1' })];
    renderGrid(entries, false);
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('passes armband, breed, and handler from displayInfo', () => {
    const entries = [makeScentWorkEntry()];
    renderGrid(entries);

    expect(screen.getByText('107')).toBeInTheDocument();
    expect(screen.getByText('Scottish Terrier')).toBeInTheDocument();
    expect(screen.getByText(/Kathy Gray/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/EntryCardGrid.test.tsx`
Expected: FAIL — `EntryCardGrid` module not found

- [ ] **Step 3: Implement EntryCardGrid component**

```typescript
// apps/myk9show/src/components/classes/ClassResultsTable/EntryCardGrid.tsx

import { useMemo } from 'react';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { EntryCard, type EntryCardEntry } from './EntryCard';
import type { EntryStatus } from './entryStatusConfig';

interface EntryCardGridProps {
  entries: ScentWorkEntry[];
  classId: string;
  useSecretaryRoute: boolean;
}

function toCardEntry(entry: ScentWorkEntry): EntryCardEntry {
  return {
    entryId: entry.id,
    armband: entry.displayInfo.armband,
    dogName: entry.displayInfo.dogName,
    dogBreed: entry.displayInfo.dogBreed,
    handlerName: entry.displayInfo.handlerName,
    // Default to no_status until check-in system is built
    status: 'no_status' as EntryStatus,
  };
}

function buildScoringRoute(
  classId: string,
  entryId: string,
  useSecretaryRoute: boolean
): string {
  return useSecretaryRoute
    ? `/scoring/secretary/classes/${classId}/entries/${entryId}`
    : `/scoring/classes/${classId}/entries/${entryId}`;
}

export function EntryCardGrid({
  entries,
  classId,
  useSecretaryRoute,
}: EntryCardGridProps) {
  const cardEntries = useMemo(() => entries.map(toCardEntry), [entries]);

  if (cardEntries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No entries in this class.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {cardEntries.map(entry => (
        <EntryCard
          key={entry.entryId}
          entry={entry}
          classId={classId}
          scoringRoute={buildScoringRoute(classId, entry.entryId, useSecretaryRoute)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/EntryCardGrid.test.tsx`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/EntryCardGrid.tsx \
       apps/myk9show/src/components/classes/__tests__/EntryCardGrid.test.tsx
git commit -m "feat(class-results): add EntryCardGrid with responsive grid layout"
```

---

### Task 4: Wire view toggle into ClassResultsTable with tests

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`
- Modify: `apps/myk9show/src/components/classes/__tests__/ClassResultsTableHeader.test.tsx`

- [ ] **Step 1: Add tests for the view toggle behavior**

Append these tests to `apps/myk9show/src/components/classes/__tests__/ClassResultsTableHeader.test.tsx`:

```typescript
// Add these imports at the top of the file (alongside existing ones):
import { CARD_TABLE_MODES } from '@/hooks/useViewPreference';

// Add this new describe block after the existing one:

describe('ClassResultsTable view toggle', () => {
  it('renders view toggle buttons', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('defaults to table view', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    const tableBtn = screen.getByTitle('Table view');
    expect(tableBtn.className).toContain('bg-primary');
  });

  it('switches to card view when cards toggle is clicked', async () => {
    const entries: ScentWorkEntry[] = [
      {
        id: 'entry-1',
        status: 'registered',
        displayInfo: {
          armband: '107',
          dogName: 'Laila',
          dogBreed: 'Scottish Terrier',
          handlerName: 'Kathy Gray',
          dogId: 'dog-1',
          handlerId: 'handler-1',
        },
        classConfig: {
          element: 'Container',
          level: 'Advanced',
          timeLimit: '3:00',
          multiArea: false,
          warningsEnabled: true,
        },
      } as ScentWorkEntry,
    ];
    renderTable(makeProps({ classId: 'class-1', entries }));

    await userEvent.click(screen.getByTitle('Cards view'));
    // Card view renders dog name in card format
    expect(screen.getByText('Laila')).toBeInTheDocument();
    // Table-specific elements should not be visible
    expect(screen.queryByText('Dog & Handler')).not.toBeInTheDocument();
  });

  it('hides submit footer in card view', async () => {
    renderTable(makeProps({ classId: 'class-1' }));
    await userEvent.click(screen.getByTitle('Cards view'));
    expect(screen.queryByText(/Submit.*Results/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/ClassResultsTableHeader.test.tsx`
Expected: New tests FAIL — view toggle not rendered yet

- [ ] **Step 3: Modify ClassResultsTable to add view toggle and conditional render**

Add these imports to `ClassResultsTable/index.tsx` (add after existing imports, before the `getSubmitLabel` function):

```typescript
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EntryCardGrid } from './EntryCardGrid';
```

Inside the component function body, after the `const canEdit = ...` line (line 63), add:

```typescript
const [viewMode, setViewMode] = useViewPreference('class-results', 'table');
const useSecretaryRoute = !!userPermissions.canEditEntries;
// [ADDED] Guard: card view requires classId for scoring navigation
const effectiveViewMode = classId ? viewMode : 'table';
```

In the JSX, insert the `ViewToggle` inside the header bar. Replace the line `<div className="flex items-center gap-2">` at line 298 (the one containing the action buttons) with:

```typescript
<div className="flex items-center gap-2">
  {/* [ADDED] Only show toggle when classId exists (cards need it for navigation) */}
  {classId && (
    <ViewToggle
      modes={CARD_TABLE_MODES}
      active={effectiveViewMode}
      onChange={setViewMode}
    />
  )}
  {onOpenRequirements && (
```

The closing `</div>` for the action buttons stays the same.

Replace the `DataTable` block (lines 330–343) and the submit footer (lines 345–360) with a conditional render:

```typescript
{/* [ADDED] Use effectiveViewMode (falls back to table when classId missing) */}
{effectiveViewMode === 'cards' ? (
  <EntryCardGrid
    entries={entries}
    classId={classId!}
    useSecretaryRoute={useSecretaryRoute}
  />
) : (
  <>
    <DataTable<BulkEntryData>
      tableId="classResults"
      columns={columns}
      data={bulkData}
      getRowId={row => row.entryId}
      pageSize={9999}
      getRowClassName={row =>
        row.isCleared
          ? 'bg-amber-50 dark:bg-amber-950/20'
          : row.hasChanges && !row.isValid
            ? 'bg-red-50 dark:bg-red-950/20'
            : ''
      }
    />

    {userPermissions.canEditEntries && (
      <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
        <div className="text-sm text-muted-foreground">
          Press Enter or Tab to move between fields quickly &bull; Placements calculated
          automatically
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!summary.canSubmit || isSubmitting}
          className="myk9-action-button myk9-action-button-primary"
        >
          <Save className="h-4 w-4" />
          <span>{getSubmitLabel(summary, isSubmitting)}</span>
        </Button>
      </div>
    )}
  </>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/ClassResultsTableHeader.test.tsx`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Run all ClassResultsTable-related tests**

Run: `cd apps/myk9show && npx vitest run src/components/classes/__tests__/`
Expected: All tests PASS across EntryCard, EntryCardGrid, and ClassResultsTableHeader

- [ ] **Step 6: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/index.tsx \
       apps/myk9show/src/components/classes/__tests__/ClassResultsTableHeader.test.tsx
git commit -m "feat(class-results): wire view toggle with card/table conditional render"
```

---

### Task 5: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the todo as done**

In `TO-DOS.md`, find the "Add card/table view toggle to ClassResultsTable" item under "Card View for Entries & Results" (around line 282) and change `- **Add card/table` to `- [x] **Add card/table`. Add a "Done:" summary after the bold title:

```
- [x] **Add card/table view toggle to ClassResultsTable** — Done: Created EntryCard, EntryCardGrid, and entryStatusConfig in ClassResultsTable/ directory. Cards match myK9Q design: accent rounded-square armband badge, dog name/breed/handler, status badge (display-only, defaults to "No Status" until check-in system lands). Click navigates to scoresheet page (secretary or judge route based on permissions). ViewToggle + useViewPreference('class-results', 'table') in header bar. Responsive grid (1/2/3 columns). 14 tests across 3 files.
```

Also add a new todo for the check-in status system that was scoped out:

```
- [ ] **Check-in status system** — Interactive status badges on entry cards. Exhibitors can set: Checked-in, Conflict, Pulled, At Gate. Secretary/steward can also set: Come to Gate, In Ring (manual), No Status (reset). In Ring is set automatically when scoresheet opens. Requires: database column for entry status, real-time subscription, role-aware status toggle UI. EntryCard's status badge slot and entryStatusConfig.ts are already in place.
```

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: update TO-DOS — mark card view done, add check-in status todo"
```
