# Stat Card Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 19 ad-hoc stat card implementations with shared `StatCard` and `StatsGrid` components in `@myk9/ui`.

**Architecture:** Two new components (`StatCard`, `StatsGrid`) in `packages/ui` following existing folder-per-component convention. Each of the 19 consumer files gets migrated independently — same data, new markup. Old CSS and component files deleted after all migrations complete.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide icons, Vitest + Testing Library, class-variance-authority (for color variants)

**Spec:** `docs/superpowers/specs/2026-03-23-stat-card-standardization-design.md`

---

## File Structure

### New Files

| File                                                      | Responsibility                         |
| --------------------------------------------------------- | -------------------------------------- |
| `packages/ui/src/components/StatCard/StatCard.tsx`        | StatCard + StatCardSkeleton components |
| `packages/ui/src/components/StatCard/statCardVariants.ts` | Color variant definitions (CVA)        |
| `packages/ui/src/components/StatCard/StatCard.test.tsx`   | Unit tests                             |
| `packages/ui/src/components/StatCard/index.ts`            | Barrel export                          |
| `packages/ui/src/components/StatsGrid/StatsGrid.tsx`      | StatsGrid container component          |
| `packages/ui/src/components/StatsGrid/StatsGrid.test.tsx` | Unit tests                             |
| `packages/ui/src/components/StatsGrid/index.ts`           | Barrel export                          |

### Modified Files

| File                                  | Change                                               |
| ------------------------------------- | ---------------------------------------------------- |
| `packages/ui/package.json`            | Add `lucide-react` peer dep                          |
| `packages/ui/src/components/index.ts` | Add exports for StatCard + StatsGrid                 |
| 19 consumer files (see Tasks 4-10)    | Replace old markup with `<StatsGrid>` + `<StatCard>` |

### Deleted Files (Task 11)

| File                                                                         | Reason                          |
| ---------------------------------------------------------------------------- | ------------------------------- |
| `apps/myk9show/src/components/ui/stat-card.tsx`                              | Replaced by `@myk9/ui` StatCard |
| `apps/myk9show/src/pages/admin/AdminDashboard/StatsCard.tsx`                 | Replaced by `@myk9/ui` StatCard |
| `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/StatCard.tsx` | Replaced by `@myk9/ui` StatCard |

---

## Task 1: Build StatCard Component (TDD)

**Files:**

- Create: `packages/ui/src/components/StatCard/statCardVariants.ts`
- Create: `packages/ui/src/components/StatCard/StatCard.test.tsx`
- Create: `packages/ui/src/components/StatCard/StatCard.tsx`
- Create: `packages/ui/src/components/StatCard/index.ts`

- [ ] **Step 1: Create color variant definitions**

Create `packages/ui/src/components/StatCard/statCardVariants.ts`:

```typescript
import { cva } from 'class-variance-authority';

export const STAT_COLORS = {
  primary: {
    iconBg: 'bg-indigo-500/12 dark:bg-indigo-500/12',
    iconStroke: 'text-indigo-500',
    progressFill: 'bg-indigo-500',
  },
  emerald: {
    iconBg: 'bg-emerald-500/8 dark:bg-emerald-500/12',
    iconStroke: 'text-emerald-500',
    progressFill: 'bg-emerald-500',
  },
  amber: {
    iconBg: 'bg-amber-500/8 dark:bg-amber-500/12',
    iconStroke: 'text-amber-500',
    progressFill: 'bg-amber-500',
  },
  red: {
    iconBg: 'bg-red-500/8 dark:bg-red-500/12',
    iconStroke: 'text-red-500',
    progressFill: 'bg-red-500',
  },
  purple: {
    iconBg: 'bg-violet-500/8 dark:bg-violet-500/12',
    iconStroke: 'text-violet-500',
    progressFill: 'bg-violet-500',
  },
  blue: {
    iconBg: 'bg-blue-500/8 dark:bg-blue-500/12',
    iconStroke: 'text-blue-500',
    progressFill: 'bg-blue-500',
  },
} as const;

export type StatColor = keyof typeof STAT_COLORS;
```

**[EXPANDED] Tailwind opacity fallback:** The `bg-indigo-500/12` syntax requires Tailwind v3.1+. If it doesn't work with the project's Tailwind version, replace with arbitrary values: `bg-[rgba(99,102,241,0.12)]` for dark, `bg-[rgba(99,102,241,0.08)]` for light. Use `dark:` prefix for theme-specific opacities. Verify by running `pnpm dev:show` and visually checking icon backgrounds render correctly in both themes.

- [ ] **Step 2: Write failing tests**

Create `packages/ui/src/components/StatCard/StatCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users, CheckCircle } from 'lucide-react';
import { StatCard, StatCardSkeleton } from './StatCard';

describe('StatCard', () => {
  it('should render icon, title, and value', () => {
    render(<StatCard icon={Users} title="Total Entries" value={142} />);
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('should render string values', () => {
    render(<StatCard icon={Users} title="Rate" value="62.7%" />);
    expect(screen.getByText('62.7%')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    render(<StatCard icon={Users} title="Entries" value={42} subtitle="Active: 38" />);
    expect(screen.getByText('Active: 38')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    render(<StatCard icon={Users} title="Entries" value={42} />);
    expect(screen.queryByText('Active:')).not.toBeInTheDocument();
  });

  it('should render progress bar when progress provided', () => {
    const { container } = render(
      <StatCard icon={Users} title="Entries" value={42} progress={75} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });

  it('should not render progress bar when progress not provided', () => {
    const { container } = render(
      <StatCard icon={Users} title="Entries" value={42} />
    );
    expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument();
  });

  it('should clamp progress to 0-100', () => {
    const { container } = render(
      <StatCard icon={Users} title="Entries" value={42} progress={150} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('should render trend badge when provided', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="+12%" />);
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('should style positive trends in emerald', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="+12%" />);
    const trend = screen.getByText('+12%');
    expect(trend.className).toMatch(/emerald/);
  });

  it('should style negative trends in red', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="-5%" />);
    const trend = screen.getByText('-5%');
    expect(trend.className).toMatch(/red/);
  });

  // [ADDED] Neutral trend test
  it('should style neutral trends in muted', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="8 total" />);
    const trend = screen.getByText('8 total');
    expect(trend.className).toMatch(/muted/);
    expect(trend.className).not.toMatch(/emerald/);
    expect(trend.className).not.toMatch(/red/);
  });

  it('should add cursor-pointer when onClick provided', () => {
    const handleClick = vi.fn();
    render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = screen.getByText('Users').closest('[class]')!.parentElement!;
    expect(card.className).toContain('cursor-pointer');
  });

  it('should call onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    await user.click(screen.getByText('100'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  // [ADDED] Keyboard accessibility tests
  it('should add role=button and tabIndex when onClick provided', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('should fire onClick on Enter key', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = container.firstChild as HTMLElement;
    card.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should not add role=button when onClick not provided', () => {
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} />
    );
    expect(container.firstChild).not.toHaveAttribute('role');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <StatCard icon={Users} title="Test" value={1} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  describe('color variants', () => {
    it.each(['primary', 'emerald', 'amber', 'red', 'purple', 'blue'] as const)(
      'should render %s color variant',
      (color) => {
        render(<StatCard icon={Users} title="Test" value={1} color={color} />);
        expect(screen.getByText('Test')).toBeInTheDocument();
      }
    );

    it('should default to primary when no color specified', () => {
      const { container } = render(
        <StatCard icon={Users} title="Test" value={1} />
      );
      const iconBg = container.querySelector('[data-slot="icon"]');
      expect(iconBg?.className).toMatch(/indigo/);
    });
  });
});

describe('StatCardSkeleton', () => {
  it('should render skeleton placeholders', () => {
    const { container } = render(<StatCardSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('should have same outer dimensions as StatCard', () => {
    const { container } = render(<StatCardSkeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toContain('rounded-xl');
    expect(skeleton.className).toContain('p-5');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- --run src/components/StatCard/StatCard.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement StatCard and StatCardSkeleton**

Create `packages/ui/src/components/StatCard/StatCard.tsx`:

```typescript
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../utils/cn';
import { STAT_COLORS, type StatColor } from './statCardVariants';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  value: string | number;
  color?: StatColor;
  subtitle?: string;
  progress?: number;
  trend?: string;
  onClick?: () => void;
}

function StatCard({
  icon: Icon,
  title,
  value,
  color = 'primary',
  subtitle,
  progress,
  trend,
  onClick,
  className,
  ...props
}: StatCardProps) {
  const colors = STAT_COLORS[color];
  const clampedProgress = progress != null ? Math.min(100, Math.max(0, progress)) : undefined;
  // [EXPANDED] Handle positive (+), negative (-), and neutral trends
  const isPositiveTrend = trend?.startsWith('+');
  const isNegativeTrend = trend?.startsWith('-');

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-5',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-md',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      // [ADDED] Keyboard accessibility for clickable cards
      {...(onClick && {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      })}
      {...props}
    >
      <div className="flex gap-4 items-start">
        <div
          data-slot="icon"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
            colors.iconBg
          )}
        >
          <Icon className={cn('h-5 w-5', colors.iconStroke)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            {/* [EXPANDED] Neutral trends render in muted style */}
            {trend && (
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium',
                  isPositiveTrend && 'bg-emerald-500/10 text-emerald-500',
                  isNegativeTrend && 'bg-red-500/10 text-red-500',
                  !isPositiveTrend && !isNegativeTrend && 'bg-muted text-muted-foreground'
                )}
              >
                {trend}
              </span>
            )}
          </div>
          <div className="mt-1 text-[28px] font-bold leading-none text-foreground">
            {value}
          </div>
          {subtitle && (
            <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>

      {clampedProgress != null && (
        <div
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-[3px] overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-500', colors.progressFill)}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card p-5',
        className
      )}
    >
      <div className="flex gap-4 items-start">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-7 w-2/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export { StatCard, StatCardSkeleton };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- --run src/components/StatCard/StatCard.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Create barrel export**

Create `packages/ui/src/components/StatCard/index.ts`:

```typescript
export { StatCard, StatCardSkeleton, type StatCardProps } from './StatCard';
export { STAT_COLORS, type StatColor } from './statCardVariants';
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/StatCard/
git commit -m "feat(ui): add StatCard and StatCardSkeleton components"
```

---

## Task 2: Build StatsGrid Component (TDD)

**Files:**

- Create: `packages/ui/src/components/StatsGrid/StatsGrid.test.tsx`
- Create: `packages/ui/src/components/StatsGrid/StatsGrid.tsx`
- Create: `packages/ui/src/components/StatsGrid/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/components/StatsGrid/StatsGrid.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsGrid } from './StatsGrid';

describe('StatsGrid', () => {
  it('should render children', () => {
    render(
      <StatsGrid>
        <div>Card 1</div>
        <div>Card 2</div>
      </StatsGrid>
    );
    expect(screen.getByText('Card 1')).toBeInTheDocument();
    expect(screen.getByText('Card 2')).toBeInTheDocument();
  });

  it('should apply grid classes', () => {
    const { container } = render(
      <StatsGrid>
        <div>Card</div>
      </StatsGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('gap-4');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <StatsGrid className="custom">
        <div>Card</div>
      </StatsGrid>
    );
    expect(container.firstChild).toHaveClass('custom');
  });

  it('should apply column classes for columns=2', () => {
    const { container } = render(
      <StatsGrid columns={2}>
        <div>Card</div>
      </StatsGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('lg:grid-cols-2');
  });

  it('should apply column classes for columns=4', () => {
    const { container } = render(
      <StatsGrid columns={4}>
        <div>Card</div>
      </StatsGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('lg:grid-cols-4');
  });

  it('should default to 4 columns when not specified', () => {
    const { container } = render(
      <StatsGrid>
        <div>Card</div>
      </StatsGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('lg:grid-cols-4');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/ui && pnpm test -- --run src/components/StatsGrid/StatsGrid.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement StatsGrid**

Create `packages/ui/src/components/StatsGrid/StatsGrid.tsx`:

```typescript
import * as React from 'react';

import { cn } from '../../utils/cn';

const COLUMN_CLASSES = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
} as const;

export interface StatsGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4 | 5;
}

function StatsGrid({ columns = 4, className, children, ...props }: StatsGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 gap-4',
        COLUMN_CLASSES[columns],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { StatsGrid };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/ui && pnpm test -- --run src/components/StatsGrid/StatsGrid.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Create barrel export**

Create `packages/ui/src/components/StatsGrid/index.ts`:

```typescript
export { StatsGrid, type StatsGridProps } from './StatsGrid';
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/StatsGrid/
git commit -m "feat(ui): add StatsGrid container component"
```

---

## Task 3: Wire Up Exports and Peer Dependency

**Files:**

- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/components/index.ts`

- [ ] **Step 1: Add lucide-react as peer dependency**

In `packages/ui/package.json`, add to `peerDependencies`:

```json
"lucide-react": ">=0.300.0"
```

- [ ] **Step 2: Add barrel exports**

In `packages/ui/src/components/index.ts`, add:

```typescript
export * from './StatCard';
export * from './StatsGrid';
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: Run full UI test suite**

Run: `cd packages/ui && pnpm test`
Expected: All tests pass, including new StatCard and StatsGrid tests

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/ui/src/components/index.ts
git commit -m "feat(ui): export StatCard and StatsGrid, add lucide-react peer dep"
```

---

## Task 4: Migrate Show Pages (3 files)

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowStatistics.tsx`
- Modify: `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/index.tsx`
- Modify: `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/StatCard.tsx` (will be deleted in Task 11)

**Context:** ShowStatistics renders 3 simple text-only cards (no icons currently — add Lucide icons per spec). ShowDetails/ShowStatistics renders stat objects through its local StatCard which uses Font Awesome icons and has progress bars.

**[ADDED] Test impact:** If any test files assert the old Card/stat markup for these components, update them to query for the new StatCard output (e.g., `getByText('Total Entries')` still works, but structural queries like `getByRole('progressbar')` or Card-specific selectors may need updating). Search for test files with `grep -r "ShowStatistics\|ShowDetails.*stat" apps/myk9show/src/test/` before migrating.

- [ ] **Step 1: Migrate ShowStatistics.tsx**

Replace the inline Card markup with `StatsGrid` + `StatCard`. Add Lucide icons (Trophy for trials, ListChecks for classes, Users for entries). These cards have no progress bars or trends — just title + value + subtitle.

```typescript
import { StatsGrid, StatCard } from '@myk9/ui';
import { Trophy, ListChecks, Users } from 'lucide-react';
```

- [ ] **Step 2: Migrate ShowDetails/ShowStatistics/index.tsx**

Replace the mapping over stat objects → local `StatCard` with the new `@myk9/ui` `StatCard`. Map Font Awesome icon classes to Lucide icon components. Map `progress` CSS percentage strings to numeric values. Map color classes to `StatColor` values. Keep the role-based filtering logic unchanged.

- [ ] **Step 3: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/
git commit -m "refactor(show): migrate show stat cards to @myk9/ui StatCard"
```

---

## Task 5: Migrate Trial Pages (2 files)

**Files:**

- Modify: `apps/myk9show/src/components/trials/TrialDetail/TrialStatistics.tsx`
- Modify: `apps/myk9show/src/components/trials/TrialDetailsMain.tsx`

**Context:** TrialStatistics has 4 cards with Lucide icons, progress bars, and trend percentages. TrialDetailsMain has 3-4 dynamically built stat cards using `myk9-show-*` CSS classes.

**[ADDED] Test impact:** `TrialDetailsMain.test.tsx` has 21 tests that already fail due to component redesigns (listed in TO-DOS.md). After migration, update these tests to assert against the new StatCard output. Similarly check `TrialStatistics` for tests. The stat card markup changes mean any test querying CardHeader, CardTitle, or `myk9-show-stat-*` CSS classes must be updated to query by text content or `role="progressbar"` instead.

- [ ] **Step 1: Migrate TrialStatistics.tsx**

Replace inline Card + Progress markup with `StatsGrid` + `StatCard`. Icons already Lucide (Users, ClipboardList, ListChecks, Medal). Map existing progress calculations to `progress` prop. Map percent change values to `trend` prop.

Color mapping:

- Judges → `primary`
- Total Classes → `purple`
- Total Entries → `primary`
- Qualified Rate → `emerald`

- [ ] **Step 2: Migrate TrialDetailsMain.tsx**

Replace the stat object array + CSS class rendering with `StatsGrid` + `StatCard`. The component dynamically builds stats — keep the same data logic, replace the JSX template. Remove `myk9-show-*` class references.

Color mapping:

- Judges (Gavel) → `amber`
- Total Classes (Trophy) → `purple`
- Total Entries (Users) → `primary`
- Qualified Rate (Trophy) → `emerald`

- [ ] **Step 3: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/trials/
git commit -m "refactor(trial): migrate trial stat cards to @myk9/ui StatCard"
```

---

## Task 6: Migrate Class Pages (2 files)

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassStatistics.tsx`
- Modify: `apps/myk9show/src/components/classes/EntriesStatisticsPanel.tsx`

**Context:** ClassStatistics uses `myk9-class-*` CSS classes with 4 cards. EntriesStatisticsPanel uses `myk9-show-*` classes with 4-5 cards plus a summary section below.

- [ ] **Step 1: Migrate ClassStatistics.tsx**

Replace CSS class rendering with `StatsGrid` + `StatCard`. Keep same data calculations.

Color mapping:

- Total Entries (Users) → `primary`
- Qualified (CheckCircle) → `emerald`
- Avg Score (Target) → `amber`
- Avg Time (Clock) → `blue`

- [ ] **Step 2: Migrate EntriesStatisticsPanel.tsx**

Replace CSS class rendering with `StatsGrid` + `StatCard`. Keep the useMemo stat-building logic and the summary section below. The 5th conditional card (Pending Changes) uses `Edit3` icon.

Color mapping:

- Total Entries (Users) → `primary`
- With Results (CheckCircle) → `emerald`
- Qualified (Trophy) → `emerald`
- Pending (Clock) → `amber`
- Pending Changes (Edit3) → `red`

- [ ] **Step 3: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/
git commit -m "refactor(class): migrate class stat cards to @myk9/ui StatCard"
```

---

## Task 7: Migrate Entry Pages (2 files)

**Files:**

- Modify: `apps/myk9show/src/components/entries/management/EntryStatsCards.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntriesStatsCards.tsx`

**Context:** EntryStatsCards has 5 simple shadcn Card-based cards (no progress bars). MyEntriesStatsCards has 4 cards with `myk9-show-*` CSS and progress bars.

- [ ] **Step 1: Migrate EntryStatsCards.tsx**

Replace shadcn Card markup with `StatsGrid columns={5}` + `StatCard`.

Color mapping:

- Total Entries (Users) → `primary`
- Pending (AlertCircle) → `amber`
- Accepted (CheckCircle2) → `emerald`
- Waitlist (Clock) → `blue`
- Revenue (DollarSign) → `emerald`

- [ ] **Step 2: Migrate MyEntriesStatsCards.tsx**

Replace `myk9-show-*` CSS markup with `StatsGrid` + `StatCard`. Convert inline progress width calculations to `progress` prop.

Color mapping:

- Total Entries (Users) → `primary`
- Accepted (CheckCircle2) → `emerald`
- Needs Action (AlertCircle) → `red`
- Total Fees (DollarSign) → `blue`

- [ ] **Step 3: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/entries/ apps/myk9show/src/pages/MyEntriesPage/
git commit -m "refactor(entries): migrate entry stat cards to @myk9/ui StatCard"
```

---

## Task 8: Migrate Secretary Pages (4 files)

**Files:**

- Modify: `apps/myk9show/src/pages/SecretaryDashboard/StatisticsCards.tsx`
- Modify: `apps/myk9show/src/pages/secretary/WaitlistManagementPage/ClassStatsCards.tsx`
- Modify: `apps/myk9show/src/pages/secretary/RunOrderPage/RunOrderQuickStats.tsx`
- Modify: `apps/myk9show/src/components/secretary/bulk-result-entry/SummaryCards.tsx`

**Context:** SecretaryDashboard has the most premium cards (gradient hover, animated pulse). WaitlistManagement and RunOrderQuickStats are simple shadcn cards. SummaryCards uses `myk9-show-*` CSS.

**[ADDED] Test impact:** Check for existing tests for these components. SecretaryDashboard/StatisticsCards may have tests asserting gradient classes, animated pulse, or shadcn Card/CardHeader structure. Update any structural assertions to match the new flat StatCard output.

- [ ] **Step 1: Migrate SecretaryDashboard/StatisticsCards.tsx**

Replace premium gradient cards with `StatsGrid` + `StatCard`. Drop the gradient hover overlays, animated pulse status, and custom progress visualizations. Keep progress bars where they have `progress` data.

Color mapping:

- Active Trials (ClipboardList) → `primary`
- Total Entries (Users) → `blue`
- Results Published (Target) → `emerald`
- Avg Processing (Timer) → `purple`

- [ ] **Step 2: Migrate WaitlistManagementPage/ClassStatsCards.tsx**

Replace shadcn Card markup with `StatsGrid` + `StatCard`.

Color mapping:

- Entry Limit (Users) → `primary`
- Accepted (CheckCircle2) → `emerald`
- Waitlist (Clock) → `amber`
- Available (ArrowUpCircle) → `blue`

- [ ] **Step 3: Migrate RunOrderPage/RunOrderQuickStats.tsx**

Replace inline text-center stats with `StatsGrid columns={5}` + `StatCard`. Add Lucide icons (currently text-only): LayoutGrid for Classes, Clock for Duration, Users for Judges, AlertTriangle for Conflicts, Calendar for Schedule.

Color mapping:

- Classes → `blue`
- Duration → `emerald`
- Judges → `purple`
- Conflicts → `red` (or `emerald` when 0)
- Schedule → `primary`

- [ ] **Step 4: Migrate bulk-result-entry/SummaryCards.tsx**

Replace `myk9-show-*` CSS markup with `StatsGrid` + `StatCard`.

Color mapping:

- Total Entries (Users) → `primary`
- With Data (FileText) → `blue`
- Valid (CheckCircle) → `emerald`
- Invalid (AlertCircle) → `red`

- [ ] **Step 5: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/SecretaryDashboard/ apps/myk9show/src/pages/secretary/ apps/myk9show/src/components/secretary/
git commit -m "refactor(secretary): migrate secretary stat cards to @myk9/ui StatCard"
```

---

## Task 9: Migrate Admin Pages (3 files)

**Files:**

- Modify: `apps/myk9show/src/pages/admin/AdminDashboard/PlatformStatisticsSection.tsx`
- Modify: `apps/myk9show/src/pages/admin/UserManagementStats.tsx`
- Modify: `apps/myk9show/src/components/admin/PerformanceDashboard/StatsCards.tsx`

**Context:** PlatformStatisticsSection uses the local premium StatsCard (which will be deleted). UserManagementStats has inline StatCard. PerformanceDashboard has custom gradient cards.

- [ ] **Step 1: Migrate PlatformStatisticsSection.tsx**

Replace `StatsCard` import (from `./StatsCard`) with `StatCard` from `@myk9/ui`. Map props: `trend`/`trendValue` → `trend` (combine as string), `actionable` + `onClick` → `onClick`.

Color mapping:

- Total Users (Users) → `primary` (onClick → navigate to /admin/users)
- Active Shows (Calendar) → `emerald`
- Total Shows (Calendar) → `blue`
- Registered Dogs (Dog) → `purple`

- [ ] **Step 2: Migrate UserManagementStats.tsx**

Replace inline StatCard component with `StatsGrid` + `StatCard` from `@myk9/ui`.

Color mapping:

- Total Users (Users) → `primary`
- Active Users (UserCheck) → `emerald`
- Roles Assigned (Shield) → `purple`
- Selected (CheckSquare) → `blue`

- [ ] **Step 3: Migrate PerformanceDashboard/StatsCards.tsx**

Replace custom gradient cards with `StatsGrid` + `StatCard`.

Color mapping:

- Performance Score (Gauge) → `emerald`
- Budget Violations (AlertTriangle) → `amber`
- Session Duration (Users) → `purple`
- Monitoring Status (Activity) → `emerald`

- [ ] **Step 4: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/admin/ apps/myk9show/src/components/admin/
git commit -m "refactor(admin): migrate admin stat cards to @myk9/ui StatCard"
```

---

## Task 10: Migrate Remaining Detail Pages (3 files)

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/ClubStatistics.tsx`
- Modify: `apps/myk9show/src/components/offline-checkin/StatisticsPanel.tsx`
- Modify: `apps/myk9show/src/components/dogs/DogDetails/Statistics/StatsSummaryCards.tsx`

**Context:** ClubStatistics has 2 clickable cards. OfflineCheckin has 4 minimal cards (no icons — add them). DogDetails has 4 gradient cards.

- [ ] **Step 1: Migrate ClubStatistics.tsx**

Replace custom card markup with `StatsGrid columns={2}` + `StatCard`. Keep `onClick` handler (tab switching). Keep keyboard accessibility (the new StatCard handles click via div).

Color mapping:

- Shows (Calendar) → `blue`
- Members (Users) → `emerald`

- [ ] **Step 2: Migrate OfflineCheckin/StatisticsPanel.tsx**

Replace minimal shadcn Card markup with `StatsGrid` + `StatCard`. Add Lucide icons (currently text-only): Users for Total, CheckCircle for Checked In, XCircle for Scratched, AlertTriangle for Conflicts.

Color mapping:

- Total Entries (Users) → `primary`
- Checked In (CheckCircle) → `emerald`
- Scratched (XCircle) → `amber`
- Conflicts (AlertTriangle) → `red`

- [ ] **Step 3: Migrate DogDetails/StatsSummaryCards.tsx**

Replace gradient cards with `StatsGrid` + `StatCard`.

Color mapping:

- Total Entries (BarChart3) → `blue`
- Q Rate (Award) → `emerald`
- Fastest Time (Clock) → `amber`
- Avg Time (TrendingUp) → `purple`

- [ ] **Step 4: Verify typecheck and test**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/clubs/ apps/myk9show/src/components/offline-checkin/ apps/myk9show/src/components/dogs/
git commit -m "refactor: migrate club, checkin, and dog stat cards to @myk9/ui StatCard"
```

---

## Task 11: Clean Up Old Components and CSS

**Files:**

- Delete: `apps/myk9show/src/components/ui/stat-card.tsx`
- Delete: `apps/myk9show/src/pages/admin/AdminDashboard/StatsCard.tsx`
- Delete: `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/StatCard.tsx`
- Modify: `apps/myk9show/src/styles/myk9-show-details.css` (remove stat CSS)
- Modify: `apps/myk9show/src/styles/myk9-class-details.css` (remove stat CSS)

- [ ] **Step 1: Verify no remaining imports of old components**

Search for imports of the three files being deleted:

```bash
grep -r "from.*ui/stat-card" apps/myk9show/src/
grep -r "from.*AdminDashboard/StatsCard" apps/myk9show/src/
grep -r "from.*ShowStatistics/StatCard" apps/myk9show/src/
```

Expected: No matches (all migrated in Tasks 4-10)

- [ ] **Step 2: Verify no remaining usage of CSS stat classes**

```bash
grep -r "myk9-show-stat-" apps/myk9show/src/ --include="*.tsx" --include="*.ts"
grep -r "myk9-class-stat-" apps/myk9show/src/ --include="*.tsx" --include="*.ts"
```

Expected: No matches in `.tsx`/`.ts` files (only in `.css` files being cleaned)

- [ ] **Step 3: Delete old component files**

Delete the 3 component files listed above.

- [ ] **Step 4: Remove stat CSS from myk9-show-details.css**

Remove the `myk9-show-stat-*` classes (approximately lines 113-273). Keep all non-stat CSS in the file. Audit each class before removal — search for any remaining usage.

- [ ] **Step 5: Remove stat CSS from myk9-class-details.css**

Remove the `myk9-class-stat-*` classes (approximately lines 224-341). Keep all non-stat CSS.

- [ ] **Step 6: Verify typecheck and full test suite**

Run: `pnpm typecheck && cd apps/myk9show && pnpm test -- --run`
Expected: PASS

- [ ] **Step 7: Verify build succeeds**

Run: `pnpm build`
Expected: PASS (all packages build, no missing imports)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove old stat card components and CSS classes"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full monorepo typecheck**

Run: `pnpm typecheck`
Expected: 0 errors

- [ ] **Step 2: Run full monorepo lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: Run full test suite**

Run: `cd packages/ui && pnpm test && cd ../../apps/myk9show && pnpm test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: All packages and apps build successfully

- [ ] **Step 5: Update TO-DOS.md**

Mark the "Standardize statistics cards across detail pages" todo as done with a summary of what was accomplished.
