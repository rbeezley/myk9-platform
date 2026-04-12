# Quick Actions Section — Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three stat-aware hero cards to Mission Control (PipelineDashboard) showing pending entry count, reports-ready count, and active trial count for the selected show — replacing the existing plain link buttons.

**Architecture:** New `useQuickActionStats(showId)` hook reads synchronously from `entryStore` and `trialStore` (no network calls). New `QuickActionsSection` component renders three cards using Link wrappers. PipelineDashboard consumes both; the old plain buttons are deleted.

**Tech Stack:** TypeScript, React, React Router v6 `<Link>`, Zustand store selectors, shadcn/ui `Button` + `Card`, Vitest, `@testing-library/react`

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-04-11-quick-actions-section-design.md`
- Entry status values: `apps/myk9show/src/store/entry-store-types.ts` — `'submitted'` = awaiting secretary review
- Trial status values: migration `071_simplify_trial_statuses.sql` — `'upcoming' | 'in_progress' | 'completed' | 'cancelled'`
- Existing hook test pattern: `apps/myk9show/src/features/pipeline/hooks/__tests__/useMissionControlData.test.ts`
- Existing component test pattern: `apps/myk9show/src/features/pipeline/components/__tests__/AnnouncementsCard.test.tsx`

---

## Exit Criteria

- `cd apps/myk9show && pnpm typecheck` clean
- `cd apps/myk9show && pnpm lint` clean
- `cd apps/myk9show && npx vitest run src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts` passes (4 tests)
- `cd apps/myk9show && npx vitest run src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx` passes (7 tests)
- The three plain link buttons at the bottom of Mission Control are gone
- Three hero stat cards appear when a show is selected; nothing renders when no show is selected
- TO-DOS.md updated: Phase 1 checkbox ticked, Secretary Dashboard Migration section removed

---

## File Map

| File                                                                                    | Action |
| --------------------------------------------------------------------------------------- | ------ |
| `apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts`                      | Create |
| `apps/myk9show/src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts`       | Create |
| `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`                | Create |
| `apps/myk9show/src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx` | Create |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`                  | Modify |
| `TO-DOS.md`                                                                             | Modify |

---

## Task 1: `useQuickActionStats` hook — tests first

**Files:**

- Create: `apps/myk9show/src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts`
- Create: `apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts`

### Step 1 — Write the failing tests

Create `apps/myk9show/src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trialStore';

// ── Mutable mock state ───────────────────────────────────────────────────────

let mockEntries: SyncableShowEntry[] = [];
let mockTrials: SyncableTrial[] = [];
let mockTrialClasses: Record<string, SyncableTrialClass[]> = {};

vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: { entries: SyncableShowEntry[] }) => unknown) =>
    selector({ entries: mockEntries }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (
    selector: (s: {
      trials: SyncableTrial[];
      trialClasses: Record<string, SyncableTrialClass[]>;
    }) => unknown
  ) => selector({ trials: mockTrials, trialClasses: mockTrialClasses }),
}));

// Import after mocks (vi.mock is hoisted)
import { useQuickActionStats } from '../useQuickActionStats';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<SyncableShowEntry> = {}): SyncableShowEntry {
  return {
    id: 'entry-1',
    showId: 'show-1',
    dogId: 'dog-1',
    classId: 'class-1',
    handlerId: 'handler-1',
    status: 'submitted',
    paymentStatus: 'pending',
    statusHistory: [],
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableShowEntry;
}

function makeTrial(overrides: Partial<SyncableTrial> = {}): SyncableTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    status: 'upcoming',
    trialNumber: 1,
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrial;
}

function makeClass(overrides: Partial<SyncableTrialClass> = {}): SyncableTrialClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    isScoringFinalized: false,
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrialClass;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useQuickActionStats', () => {
  beforeEach(() => {
    mockEntries = [];
    mockTrials = [];
    mockTrialClasses = {};
  });

  it('returns all zeros when showId is empty', () => {
    mockEntries = [makeEntry({ showId: 'show-1', status: 'submitted' })];
    mockTrials = [makeTrial({ showId: 'show-1', status: 'upcoming' })];
    mockTrialClasses = { 'trial-1': [makeClass({ isScoringFinalized: true })] };

    const { result } = renderHook(() => useQuickActionStats(''));

    expect(result.current.pendingEntriesCount).toBe(0);
    expect(result.current.reportsReadyCount).toBe(0);
    expect(result.current.activeTrialsCount).toBe(0);
  });

  it('counts only submitted entries for the show', () => {
    mockEntries = [
      makeEntry({ id: 'e1', showId: 'show-1', status: 'submitted' }),
      makeEntry({ id: 'e2', showId: 'show-1', status: 'submitted' }),
      makeEntry({ id: 'e3', showId: 'show-1', status: 'confirmed' }),
      makeEntry({ id: 'e4', showId: 'show-2', status: 'submitted' }), // different show
    ];

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.pendingEntriesCount).toBe(2);
  });

  it('counts finalized classes across all trials for the show', () => {
    mockTrials = [
      makeTrial({ id: 'trial-1', showId: 'show-1' }),
      makeTrial({ id: 'trial-2', showId: 'show-1' }),
      makeTrial({ id: 'trial-3', showId: 'show-2' }), // different show
    ];
    mockTrialClasses = {
      'trial-1': [
        makeClass({ id: 'c1', isScoringFinalized: true }),
        makeClass({ id: 'c2', isScoringFinalized: true }),
      ],
      'trial-2': [
        makeClass({ id: 'c3', isScoringFinalized: true }),
        makeClass({ id: 'c4', isScoringFinalized: false }),
      ],
      'trial-3': [
        makeClass({ id: 'c5', isScoringFinalized: true }), // different show — excluded
      ],
    };

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.reportsReadyCount).toBe(3);
  });

  it('counts only upcoming and in_progress trials as active', () => {
    mockTrials = [
      makeTrial({ id: 't1', showId: 'show-1', status: 'upcoming' }),
      makeTrial({ id: 't2', showId: 'show-1', status: 'in_progress' }),
      makeTrial({ id: 't3', showId: 'show-1', status: 'completed' }),
      makeTrial({ id: 't4', showId: 'show-1', status: 'cancelled' }),
      makeTrial({ id: 't5', showId: 'show-2', status: 'upcoming' }), // different show
    ];

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.activeTrialsCount).toBe(2);
  });
});
```

### Step 2 — Run tests to confirm they fail

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts
```

Expected: FAIL — `useQuickActionStats` not found.

### Step 3 — Implement the hook

Create `apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts`:

```typescript
import { useEntryStore } from '@/store/entryStore';
import { useTrialStore } from '@/store/trialStore';

export interface QuickActionStats {
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}

/**
 * Derives three show-scoped counts for the Mission Control quick-action cards.
 * Reads synchronously from entryStore and trialStore — no network calls.
 * Returns all zeros when showId is empty.
 */
export function useQuickActionStats(showId: string): QuickActionStats {
  const pendingEntriesCount = useEntryStore(s => {
    if (!showId) return 0;
    return s.entries.filter(e => e.showId === showId && e.status === 'submitted').length;
  });

  const reportsReadyCount = useTrialStore(s => {
    if (!showId) return 0;
    const showTrialIds = s.trials.filter(t => t.showId === showId).map(t => t.id);
    return showTrialIds.reduce((count, trialId) => {
      const classes = s.trialClasses[trialId] ?? [];
      return count + classes.filter(c => c.isScoringFinalized === true).length;
    }, 0);
  });

  const activeTrialsCount = useTrialStore(s => {
    if (!showId) return 0;
    return s.trials.filter(
      t => t.showId === showId && t.status !== 'completed' && t.status !== 'cancelled'
    ).length;
  });

  return { pendingEntriesCount, reportsReadyCount, activeTrialsCount };
}
```

### Step 4 — Run tests to confirm they pass

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts
```

Expected: 4 tests PASS.

### Step 5 — Commit

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && git add apps/myk9show/src/features/pipeline/hooks/useQuickActionStats.ts apps/myk9show/src/features/pipeline/hooks/__tests__/useQuickActionStats.test.ts && git commit -m "feat(mission-control): add useQuickActionStats hook with tests"
```

---

## Task 2: `QuickActionsSection` component — tests first

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`

### Step 1 — Write the failing tests

Create `apps/myk9show/src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QuickActionsSection } from '../QuickActionsSection';

describe('QuickActionsSection', () => {
  it('renders nothing when showId is empty', () => {
    const { container } = render(
      <QuickActionsSection
        showId=""
        pendingEntriesCount={5}
        reportsReadyCount={2}
        activeTrialsCount={3}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders three cards when showId is provided', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={12}
        reportsReadyCount={3}
        activeTrialsCount={2}
      />
    );
    expect(screen.getByText('Pending Entries')).toBeInTheDocument();
    expect(screen.getByText('Reports Ready')).toBeInTheDocument();
    expect(screen.getByText('Active Trials')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={12}
        reportsReadyCount={3}
        activeTrialsCount={2}
      />
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('displays zero counts without hiding them', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={0}
        reportsReadyCount={0}
        activeTrialsCount={0}
      />
    );
    // All three cards show "0"
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
  });

  it('pending entries card links to entries page with showId', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={1}
        reportsReadyCount={0}
        activeTrialsCount={0}
      />
    );
    const link = screen.getByRole('link', { name: /review entries/i });
    expect(link).toHaveAttribute('href', '/secretary/entries?showId=show-abc');
  });

  it('reports ready card links to reports page', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={0}
        reportsReadyCount={1}
        activeTrialsCount={0}
      />
    );
    const link = screen.getByRole('link', { name: /export reports/i });
    expect(link).toHaveAttribute('href', '/secretary/reports');
  });

  it('active trials card links to day of operations', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={0}
        reportsReadyCount={0}
        activeTrialsCount={1}
      />
    );
    const link = screen.getByRole('link', { name: /day of ops/i });
    expect(link).toHaveAttribute('href', '/secretary/day-of-operations');
  });
});
```

### Step 2 — Run tests to confirm they fail

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx
```

Expected: FAIL — `QuickActionsSection` not found.

### Step 3 — Implement the component

Create `apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx`:

```typescript
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface QuickActionsSectionProps {
  showId: string;
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}

interface QuickActionCardProps {
  count: number;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  colorClass: string;
}

function QuickActionCard({
  count,
  title,
  subtitle,
  ctaLabel,
  href,
  colorClass,
}: QuickActionCardProps) {
  return (
    <div className={`flex-1 rounded-lg border-l-4 bg-card p-4 shadow-sm ${colorClass}`}>
      <p className={`text-3xl font-bold ${colorClass.replace('border-', 'text-').replace('-500', '-400')}`}>
        {count}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
        <Link to={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

export function QuickActionsSection({
  showId,
  pendingEntriesCount,
  reportsReadyCount,
  activeTrialsCount,
}: QuickActionsSectionProps) {
  if (!showId) return null;

  return (
    <div className="flex gap-3">
      <QuickActionCard
        count={pendingEntriesCount}
        title="Pending Entries"
        subtitle="awaiting review"
        ctaLabel="Review Entries"
        href={`/secretary/entries?showId=${showId}`}
        colorClass="border-blue-500"
      />
      <QuickActionCard
        count={reportsReadyCount}
        title="Reports Ready"
        subtitle="classes finalized"
        ctaLabel="Export Reports"
        href="/secretary/reports"
        colorClass="border-green-500"
      />
      <QuickActionCard
        count={activeTrialsCount}
        title="Active Trials"
        subtitle="not yet completed"
        ctaLabel="Day of Ops"
        href="/secretary/day-of-operations"
        colorClass="border-amber-500"
      />
    </div>
  );
}
```

### Step 4 — Run tests to confirm they pass

```bash
cd apps/myk9show && npx vitest run src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx
```

Expected: 7 tests PASS.

### Step 5 — Commit

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && git add apps/myk9show/src/features/pipeline/components/QuickActionsSection.tsx apps/myk9show/src/features/pipeline/components/__tests__/QuickActionsSection.test.tsx && git commit -m "feat(mission-control): add QuickActionsSection component with tests"
```

---

## Task 3: Wire into PipelineDashboard + delete old buttons

**Files:**

- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

### Step 1 — Update PipelineDashboard

Open `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`.

**Add imports** (after the existing import block):

```typescript
import { useQuickActionStats } from '../hooks/useQuickActionStats';
import { QuickActionsSection } from './QuickActionsSection';
```

**Remove three icons** that are only used by the deleted buttons. Change the `lucide-react` import from:

```typescript
import { Plus, Settings, Copy, FileText, Download, AlertCircle } from 'lucide-react';
```

to:

```typescript
import { Plus, Settings, Copy } from 'lucide-react';
```

(`FileText`, `Download`, and `AlertCircle` were used only by the three buttons being deleted — `Plus`, `Settings`, and `Copy` remain in use.)

**Add hook call** inside the component, right after `useMissionControlData()`:

```typescript
const { pendingEntriesCount, reportsReadyCount, activeTrialsCount } = useQuickActionStats(
  selectedShow?.id ?? ''
);
```

**Replace the quick-actions section** (the `<div className="flex items-center gap-3 flex-wrap">` block with three Button/Link pairs, currently lines ~259–278) with:

```tsx
<QuickActionsSection
  showId={selectedShow?.id ?? ''}
  pendingEntriesCount={pendingEntriesCount}
  reportsReadyCount={reportsReadyCount}
  activeTrialsCount={activeTrialsCount}
/>
```

Place it immediately after the `{selectedShow && <AnnouncementsCard ... />}` block and before the class pipeline block. The component returns `null` on its own when no show is selected. Final JSX ordering:

1. `{selectedShow && <AnnouncementsCard ... />}`
2. `<QuickActionsSection showId={...} ... />` ← insert here
3. `{shows.length === 0 && ...}` (no-shows empty state)
4. `{selectedShow && trials.length === 0 && ...}` (no-trials empty state)
5. `{selectedTrial && <div>...Class Pipeline...</div>}`

### Step 2 — Run typecheck and lint

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm lint
```

Expected: no errors. If unused import errors appear, remove the unused icon imports identified in Step 1.

### Step 3 — Commit

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && git add apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx && git commit -m "feat(mission-control): wire QuickActionsSection, remove plain link buttons"
```

---

## Task 4: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

### Step 1 — Mark Phase 1 complete and remove Secretary Dashboard Migration section

In `TO-DOS.md`:

1. Find the Phase 1 line:

   ```
   - [ ] **Phase 1 — Quiet the Noise**
   ```

   Change to:

   ```
   - [x] **Phase 1 — Quiet the Noise** ✓ completed 2026-04-11 — Nav pruned, tabs consolidated (Wait List/Check-In/Permission Audit), Clone Show and quick-action cards ported to PipelineDashboard, legacy SecretaryDashboard deleted, completed trials accessible via show picker.
   ```

2. Delete the entire `## Phase 1 — Secretary Dashboard Migration` section (heading + all three `####` items under it).

### Step 2 — Commit

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform" && git add TO-DOS.md && git commit -m "docs(todos): mark Phase 1 complete, remove Secretary Dashboard Migration items"
```

---

## Self-Review

**Spec coverage:**

- ✅ `useQuickActionStats` hook with `showId`, three counts derived from stores — Task 1
- ✅ `pendingEntriesCount` = `status === 'submitted'` — Task 1 Step 3
- ✅ `reportsReadyCount` = `isScoringFinalized === true` across all trials for show — Task 1 Step 3
- ✅ `activeTrialsCount` = not completed/cancelled — Task 1 Step 3
- ✅ Returns all zeros for empty `showId` — Task 1 tests
- ✅ `QuickActionsSection` props + null guard + three cards — Task 2
- ✅ Blue/green/amber color cards, no emojis — Task 2 Step 3
- ✅ Card 1 → `/secretary/entries?showId=<id>` — Task 2 tests + impl
- ✅ Card 2 → `/secretary/reports` — Task 2 tests + impl
- ✅ Card 3 → `/secretary/day-of-operations` — Task 2 tests + impl
- ✅ Zero counts displayed (not hidden) — Task 2 tests
- ✅ Old plain buttons removed from PipelineDashboard — Task 3
- ✅ TO-DOS.md updated — Task 4

**Placeholder scan:** No TBD, no TODO, no "similar to" references. All code blocks are complete.

**Type consistency:** `QuickActionStats` interface defined in `useQuickActionStats.ts` and the three fields (`pendingEntriesCount`, `reportsReadyCount`, `activeTrialsCount`) are used consistently in `QuickActionsSection` props and in `PipelineDashboard`.

**One potential issue:** The `colorClass` string manipulation in `QuickActionCard` (`colorClass.replace(...)`) is fragile. The component spec calls for accent-colored numbers — if Tailwind purges the derived class names, they won't render. Fix: use explicit color classes per card instead of deriving them.

**Fix applied to Task 2 Step 3:** Replace the `QuickActionCard` implementation with explicit per-card color props to avoid Tailwind purge issues:

```typescript
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface QuickActionsSectionProps {
  showId: string;
  pendingEntriesCount: number;
  reportsReadyCount: number;
  activeTrialsCount: number;
}

interface QuickActionCardProps {
  count: number;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  borderClass: string;
  numberClass: string;
}

function QuickActionCard({
  count,
  title,
  subtitle,
  ctaLabel,
  href,
  borderClass,
  numberClass,
}: QuickActionCardProps) {
  return (
    <div className={`flex-1 rounded-lg border-l-4 bg-card p-4 shadow-sm ${borderClass}`}>
      <p className={`text-3xl font-bold ${numberClass}`}>{count}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
        <Link to={href}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

export function QuickActionsSection({
  showId,
  pendingEntriesCount,
  reportsReadyCount,
  activeTrialsCount,
}: QuickActionsSectionProps) {
  if (!showId) return null;

  return (
    <div className="flex gap-3">
      <QuickActionCard
        count={pendingEntriesCount}
        title="Pending Entries"
        subtitle="awaiting review"
        ctaLabel="Review Entries"
        href={`/secretary/entries?showId=${showId}`}
        borderClass="border-blue-500"
        numberClass="text-blue-400"
      />
      <QuickActionCard
        count={reportsReadyCount}
        title="Reports Ready"
        subtitle="classes finalized"
        ctaLabel="Export Reports"
        href="/secretary/reports"
        borderClass="border-green-500"
        numberClass="text-green-400"
      />
      <QuickActionCard
        count={activeTrialsCount}
        title="Active Trials"
        subtitle="not yet completed"
        ctaLabel="Day of Ops"
        href="/secretary/day-of-operations"
        borderClass="border-amber-500"
        numberClass="text-amber-400"
      />
    </div>
  );
}
```

Use this corrected version in Task 2 Step 3 instead of the first version shown above.
