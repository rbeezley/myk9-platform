# Show Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign show cards with date circle, progress bar, and discipline tags — horizontal cards for browse/dashboard, vertical cards for landing carousel.

**Architecture:** Two card variants (`ShowCardHorizontal`, `ShowCardVertical`) built on shared primitives (`DateCircle`, `ShowProgressBar`). Utility functions handle status mapping and progress computation. Existing `ShowCard.tsx` and cover image infrastructure are deleted.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-18-show-card-redesign-design.md`
**Mockups:** `.superpowers/brainstorm/72834-1773883401/show-card-option-b.html`

---

## File Structure

```
apps/myk9show/src/
├── utils/
│   └── showCardUtils.ts                          # NEW — getShowCardStatus, computeShowProgress, countUserEntries
├── components/shows/
│   ├── DateCircle.tsx                             # NEW — shared date circle primitive
│   ├── ShowProgressBar.tsx                        # NEW — shared progress bar primitive
│   ├── ShowCardVertical.tsx                       # NEW — vertical card for carousel
│   ├── ShowCard.tsx                               # DELETE — replaced by ShowCardVertical
│   ├── show-card-placeholders.ts                  # DELETE — no more cover images
│   ├── UpcomingShows.tsx                          # MODIFY — use ShowCardVertical, remove local Show type
│   ├── index.ts                                   # MODIFY — update exports
│   ├── __tests__/
│   │   ├── ShowCard.branding.test.tsx             # DELETE — tests for deleted component
│   │   ├── showCardUtils.test.ts                  # NEW
│   │   ├── DateCircle.test.tsx                    # NEW
│   │   ├── ShowProgressBar.test.tsx               # NEW
│   │   └── ShowCardVertical.test.tsx              # NEW
│   └── browse/
│       ├── ShowCardHorizontal.tsx                 # NEW — horizontal card for browse/dashboard
│       ├── ShowCardGrid.tsx                       # REWRITE — thin wrapper
│       ├── __tests__/
│       │   └── ShowCardHorizontal.test.tsx        # NEW
│       └── index.ts                               # MODIFY — add export
├── components/landing/
│   └── UpcomingShowsSection.tsx                   # MODIFY — use ShowCardVertical
├── components/clubs/
│   ├── ClubDetails/BrandingTab.tsx                # MODIFY — update ShowCard import to ShowCardVertical
│   └── ShowCard.tsx                               # NO CHANGE — separate concern, different Show type (club context)
│   └── ShowsList.tsx                              # NO CHANGE — uses clubs/ShowCard, not main ShowCard
└── types/
    └── index.ts                                   # MODIFY — remove LandingShow
```

---

### Task 1: Utility Functions — `showCardUtils.ts`

**Files:**

- Create: `apps/myk9show/src/utils/showCardUtils.ts`
- Test: `apps/myk9show/src/components/shows/__tests__/showCardUtils.test.ts`

- [ ] **Step 1: Write tests for `getShowCardStatus`**

Create `apps/myk9show/src/components/shows/__tests__/showCardUtils.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getShowCardStatus, computeShowProgress } from '@/utils/showCardUtils';
import type { Show } from '@/types/show-types';

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: '1',
    name: 'Test Show',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    trials: [],
    // Fill remaining required fields with defaults
    organization: 'AKC',
    location: 'Test Location',
    status: 'Published',
    events: [],
    source: 'myK9Show',
    preEntryFee: '10.00',
    clubId: 'c1',
    clubName: '',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    chairman: '',
    secretary: '',
    chiefSteward: '',
    assignedJudges: [],
    stats: [],
    ...overrides,
  } as Show;
}

describe('getShowCardStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('returns "completed" when show end date is in the past', () => {
    vi.setSystemTime(new Date('2026-06-10'));
    const show = makeShow({ endDate: '2026-06-03' });
    expect(getShowCardStatus(show, 'closed')).toBe('completed');
  });

  it('returns "in_progress" when now is between start and end dates', () => {
    vi.setSystemTime(new Date('2026-06-02'));
    const show = makeShow({ startDate: '2026-06-01', endDate: '2026-06-03' });
    expect(getShowCardStatus(show, 'closed')).toBe('in_progress');
  });

  it('returns "accepting" when show is in future and entries are open', () => {
    vi.setSystemTime(new Date('2026-04-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'accepting')).toBe('accepting');
  });

  it('returns "closing_soon" when show is in future and entries closing soon', () => {
    vi.setSystemTime(new Date('2026-05-12'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'closing_soon')).toBe('closing_soon');
  });

  it('returns "closed" when show is in future but entries are closed', () => {
    vi.setSystemTime(new Date('2026-05-20'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'closed')).toBe('closed');
  });

  it('returns "upcoming" when show is in future and entries not yet open', () => {
    vi.setSystemTime(new Date('2026-03-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'not_yet_open')).toBe('upcoming');
  });

  it('returns "upcoming" for submitted status (user already entered)', () => {
    vi.setSystemTime(new Date('2026-04-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'submitted')).toBe('upcoming');
  });
});

describe('computeShowProgress', () => {
  it('returns zeros when show has no trials', () => {
    const show = makeShow({ trials: [] });
    expect(computeShowProgress(show)).toEqual({ totalTrials: 0, scoredTrials: 0 });
  });

  it('counts completed trials case-insensitively', () => {
    const show = makeShow({
      trials: [
        { id: '1', status: 'completed' },
        { id: '2', status: 'Completed' },
        { id: '3', status: 'in_progress' },
      ] as any,
    });
    expect(computeShowProgress(show)).toEqual({ totalTrials: 3, scoredTrials: 2 });
  });

  it('handles undefined trials array', () => {
    const show = makeShow();
    (show as any).trials = undefined;
    expect(computeShowProgress(show)).toEqual({ totalTrials: 0, scoredTrials: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/showCardUtils.test.ts`
Expected: FAIL — module `@/utils/showCardUtils` not found

- [ ] **Step 3: Implement `showCardUtils.ts`**

Create `apps/myk9show/src/utils/showCardUtils.ts`:

```typescript
import type { Show } from '@/types/show-types';
import type { EntryStatus } from '@/utils/entryStatusUtils';

export type ShowCardStatus =
  | 'upcoming'
  | 'accepting'
  | 'closing_soon'
  | 'in_progress'
  | 'completed'
  | 'closed';

export function getShowCardStatus(show: Show, entryStatus: EntryStatus): ShowCardStatus {
  const now = new Date();
  const startDate = new Date(show.startDate);
  const endDate = new Date(show.endDate);

  if (now > endDate) return 'completed';
  if (now >= startDate && now <= endDate) return 'in_progress';

  if (entryStatus === 'accepting') return 'accepting';
  if (entryStatus === 'closing_soon') return 'closing_soon';
  if (entryStatus === 'closed') return 'closed';

  return 'upcoming';
}

export function computeShowProgress(show: Show): { totalTrials: number; scoredTrials: number } {
  const totalTrials = show.trials?.length ?? 0;
  const scoredTrials =
    show.trials?.filter(t => t.status?.toLowerCase() === 'completed').length ?? 0;
  return { totalTrials, scoredTrials };
}

/** Count user entries for a specific show */
export function countUserEntries(
  showId: string,
  entries: Array<{ showId?: string; show_id?: string }>
): number {
  return entries.filter(e => e.showId === showId || e.show_id === showId).length;
}

/** Tailwind classes for DateCircle border and month text by status */
export const STATUS_STYLES: Record<
  ShowCardStatus,
  { border: string; monthText: string; badgeBg: string }
> = {
  upcoming: { border: 'border-border/15', monthText: 'text-muted-foreground', badgeBg: 'bg-muted' },
  accepting: {
    border: 'border-green-500',
    monthText: 'text-green-500',
    badgeBg: 'bg-green-500/15',
  },
  closing_soon: {
    border: 'border-orange-500',
    monthText: 'text-orange-500',
    badgeBg: 'bg-orange-500/15',
  },
  in_progress: { border: 'border-blue-500', monthText: 'text-blue-500', badgeBg: 'bg-blue-500/15' },
  completed: {
    border: 'border-green-500',
    monthText: 'text-green-500',
    badgeBg: 'bg-green-500/15',
  },
  closed: { border: 'border-border/15', monthText: 'text-muted-foreground', badgeBg: 'bg-muted' },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/showCardUtils.test.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/showCardUtils.ts apps/myk9show/src/components/shows/__tests__/showCardUtils.test.ts
git commit -m "feat(show-cards): add showCardUtils with status mapping and progress computation"
```

---

### Task 2: `DateCircle` Component

**Files:**

- Create: `apps/myk9show/src/components/shows/DateCircle.tsx`
- Test: `apps/myk9show/src/components/shows/__tests__/DateCircle.test.tsx`

**Note:** If the trial card work has already created a DateCircle component, reuse and extend it instead of creating a new one. Check for existing files first.

- [ ] **Step 1: Write tests for DateCircle**

Create `apps/myk9show/src/components/shows/__tests__/DateCircle.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateCircle } from '../DateCircle';

describe('DateCircle', () => {
  it('renders month abbreviation and day number', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.getByText('MAY')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows days badge for multi-day events', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-10" status="upcoming" />);
    expect(screen.getByText('2 days')).toBeInTheDocument();
  });

  it('hides days badge for single-day events', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });

  it('hides days badge when endDate is not provided', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });

  it('applies green border for accepting status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="accepting" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-green-500');
  });

  it('applies orange border for closing_soon status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="closing_soon" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-orange-500');
  });

  it('applies blue border for in_progress status', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="in_progress" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('border-blue-500');
  });

  it('has accessible aria-label for multi-day show', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-11" status="upcoming" />);
    expect(screen.getByLabelText('May 9, 3 day show')).toBeInTheDocument();
  });

  it('has accessible aria-label for single-day show', () => {
    render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    expect(screen.getByLabelText('May 9')).toBeInTheDocument();
  });

  it('renders sm size by default (56px)', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="upcoming" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('w-14'); // 56px = w-14
  });

  it('renders md size when specified (60px)', () => {
    const { container } = render(<DateCircle startDate="2026-05-09" status="upcoming" size="md" />);
    const dateBox = container.querySelector('[data-testid="date-box"]');
    expect(dateBox?.className).toContain('w-[60px]');
  });

  // [ADDED] Edge case: endDate before startDate should not show negative days
  it('hides days badge when endDate equals startDate', () => {
    render(<DateCircle startDate="2026-05-09" endDate="2026-05-09" status="upcoming" />);
    expect(screen.queryByText(/day/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/DateCircle.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `DateCircle.tsx`**

Create `apps/myk9show/src/components/shows/DateCircle.tsx`:

```tsx
import React from 'react';
import { cn } from '@/lib/utils';
import { STATUS_STYLES, type ShowCardStatus } from '@/utils/showCardUtils';

interface DateCircleProps {
  startDate: string;
  endDate?: string;
  status: ShowCardStatus;
  size?: 'sm' | 'md';
}

function computeDays(startDate: string, endDate?: string): number | null {
  if (!endDate || endDate === startDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 1 ? diff : null;
}

function formatMonth(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return String(date.getDate());
}

function formatMonthLong(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long' });
}

export const DateCircle: React.FC<DateCircleProps> = ({
  startDate,
  endDate,
  status,
  size = 'sm',
}) => {
  const styles = STATUS_STYLES[status];
  const days = computeDays(startDate, endDate);
  const month = formatMonth(startDate);
  const day = formatDay(startDate);
  const monthLong = formatMonthLong(startDate);

  const ariaLabel = days ? `${monthLong} ${day}, ${days} day show` : `${monthLong} ${day}`;

  const sizeClasses = size === 'md' ? 'w-[60px] h-[60px]' : 'w-14 h-14';
  const monthSize = size === 'md' ? 'text-[11px]' : 'text-[10px]';
  const daySize = size === 'md' ? 'text-[22px]' : 'text-xl';

  return (
    <div
      className="flex flex-col items-center gap-1 flex-shrink-0"
      aria-label={ariaLabel}
      role="group"
    >
      <div
        data-testid="date-box"
        className={cn(
          sizeClasses,
          'rounded-xl border-2 flex flex-col items-center justify-center bg-card/50',
          styles.border
        )}
      >
        <span className={cn(monthSize, 'font-bold tracking-wider leading-none', styles.monthText)}>
          {month}
        </span>
        <span className={cn(daySize, 'font-extrabold leading-tight text-foreground')}>{day}</span>
      </div>
      {days && (
        <span
          className={cn(
            'text-[9px] font-semibold px-2 py-0.5 rounded-full',
            styles.badgeBg,
            styles.monthText
          )}
        >
          {days} days
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests, fix any failures, verify all pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/DateCircle.test.tsx`
Expected: PASS. May need to adjust size classes (`w-14` vs `w-[56px]`) based on what Tailwind supports. Fix test assertions to match actual output.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/DateCircle.tsx apps/myk9show/src/components/shows/__tests__/DateCircle.test.tsx
git commit -m "feat(show-cards): add DateCircle component with status-colored borders"
```

---

### Task 3: `ShowProgressBar` Component

**Files:**

- Create: `apps/myk9show/src/components/shows/ShowProgressBar.tsx`
- Test: `apps/myk9show/src/components/shows/__tests__/ShowProgressBar.test.tsx`

- [ ] **Step 1: Write tests for ShowProgressBar**

Create `apps/myk9show/src/components/shows/__tests__/ShowProgressBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowProgressBar } from '../ShowProgressBar';

describe('ShowProgressBar', () => {
  it('renders trial and entry counts', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/trials/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(/entries/)).toBeInTheDocument();
  });

  it('shows scored text when scoredTrials > 0', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />);
    expect(screen.getByText('3/5 scored')).toBeInTheDocument();
  });

  it('does not show scored text when scoredTrials is 0', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />);
    expect(screen.queryByText(/scored/)).not.toBeInTheDocument();
  });

  it('shows green color when all trials scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={5} />
    );
    const scoredText = screen.getByText('5/5 scored');
    expect(scoredText.className).toContain('text-green-500');
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill?.className).toContain('bg-green-500');
  });

  it('shows orange color when partially scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />
    );
    const scoredText = screen.getByText('3/5 scored');
    expect(scoredText.className).toContain('text-orange-500');
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill?.className).toContain('bg-orange-500');
  });

  it('renders empty progress track when 0 scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={0} />
    );
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('renders 100% width when all scored', () => {
    const { container } = render(
      <ShowProgressBar totalTrials={4} totalEntries={30} scoredTrials={4} />
    );
    const fill = container.querySelector('[data-testid="progress-fill"]');
    expect(fill).toHaveStyle({ width: '100%' });
  });

  it('has aria-label when trials are scored', () => {
    render(<ShowProgressBar totalTrials={5} totalEntries={42} scoredTrials={3} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', '3 of 5 trials scored');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowProgressBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `ShowProgressBar.tsx`**

Create `apps/myk9show/src/components/shows/ShowProgressBar.tsx`:

```tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface ShowProgressBarProps {
  scoredTrials: number;
  totalTrials: number;
  totalEntries: number;
}

export const ShowProgressBar: React.FC<ShowProgressBarProps> = ({
  scoredTrials,
  totalTrials,
  totalEntries,
}) => {
  const percent = totalTrials > 0 ? Math.round((scoredTrials / totalTrials) * 100) : 0;
  const allScored = scoredTrials > 0 && scoredTrials === totalTrials;
  const colorClass = allScored ? 'text-green-500' : 'text-orange-500';
  const fillClass = allScored ? 'bg-green-500' : 'bg-orange-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex gap-2.5">
          <span>
            <span className="font-bold text-foreground/75">{totalTrials}</span> trials
          </span>
          <span>
            <span className="font-bold text-foreground/75">{totalEntries}</span> entries
          </span>
        </div>
        {scoredTrials > 0 && (
          <span className={cn('font-semibold', colorClass)}>
            {scoredTrials}/{totalTrials} scored
          </span>
        )}
      </div>
      <div
        className="h-[3px] bg-border/30 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={
          scoredTrials > 0 ? `${scoredTrials} of ${totalTrials} trials scored` : undefined
        }
      >
        <div
          data-testid="progress-fill"
          className={cn(
            'h-full rounded-full transition-all duration-300',
            scoredTrials > 0 && fillClass
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run tests, fix any failures, verify all pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowProgressBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowProgressBar.tsx apps/myk9show/src/components/shows/__tests__/ShowProgressBar.test.tsx
git commit -m "feat(show-cards): add ShowProgressBar component with scored/total display"
```

---

### Task 4: `ShowCardHorizontal` Component

**Files:**

- Create: `apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx`
- Test: `apps/myk9show/src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx`
- Reference: `apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx` (current card logic to port)
- Reference: `apps/myk9show/src/utils/entryStatusUtils.ts` (entry status)
- Reference: `apps/myk9show/src/utils/show-actions.ts` (role-based actions)

- [ ] **Step 1: Write tests for ShowCardHorizontal**

Create `apps/myk9show/src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx`:

Test coverage:

- Renders show title, club name, location
- Renders DateCircle with correct dates
- Renders discipline tags from `show.events` (uses `getTypeBadge` from `@/utils/browseShowsUtils` for org badge)
- Renders organization badge
- Renders entry status badge via `EntryStatusBadge`
- Shows entry count badge when user has entries
- Click navigates to `/shows/{id}`
- Shows checkbox when `onToggleSelect` provided
- Applies `ring-2` when `isSelected` is true
- Renders action buttons from `getShowActions`
- [ADDED] Handles show with empty `events` array (no discipline tags rendered, no crash)
- [ADDED] Handles show with 0 trials (progress section shows "0 trials · 0 entries", empty track)
- [ADDED] Skeleton renders without crashing and has `animate-pulse` class

Use `vi.mock('react-router-dom')` for navigation. Mock `getShowActions` to return controlled action list. Build a `makeEnhancedShow()` helper similar to Task 1's `makeShow()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `ShowCardHorizontal.tsx`**

Port logic from current `ShowCardGrid.tsx` card markup into a standalone component. Key structure:

```tsx
// Three-column flex layout: [DateCircle] [card-middle] [card-right]
// At < md: flex-col to stack vertically
// Uses: DateCircle, ShowProgressBar, EntryStatusBadge, getShowActions, getEntryStatus,
//        computeShowProgress, getShowCardStatus, countUserEntries, formatDateRange, formatFee
```

The component handles:

- Computing `entryStatus` via `getEntryStatus(show, userHasEntries)`
- Computing `showCardStatus` via `getShowCardStatus(show, entryStatus.status)`
- Computing `{ totalTrials, scoredTrials }` via `computeShowProgress(show)`
- Computing `entryCount` via `countUserEntries(show.id, entries)`
- Internal `useNavigate()` for click-to-navigate
- Rendering `EntryStatusBadge` in the title row
- Rendering action buttons from `getShowActions(show, selectedTab, user)`

Include a `ShowCardHorizontalSkeleton` export for loading states. Add a test that verifies the skeleton renders (renders without crashing, has `animate-pulse` class).

- [ ] **Step 4: Run tests, fix any failures, verify all pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowCardHorizontal.tsx apps/myk9show/src/components/shows/browse/__tests__/ShowCardHorizontal.test.tsx
git commit -m "feat(show-cards): add ShowCardHorizontal with date circle and progress bar"
```

---

### Task 5: Rewrite `ShowCardGrid` as Thin Wrapper

**Files:**

- Rewrite: `apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx`
- Modify: `apps/myk9show/src/components/shows/browse/index.ts`

- [ ] **Step 1: Rewrite `ShowCardGrid.tsx`**

Replace all inline card rendering with delegation to `ShowCardHorizontal`. Keep the same `ShowCardGridProps` interface for BrowseShowsPage compatibility.

```tsx
import React from 'react';
import { ShowCardHorizontal } from './ShowCardHorizontal';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { UserWithRoles } from '@/types/auth-types';

interface ShowCardGridProps {
  shows: EnhancedShow[];
  entries: SyncableShowEntry[];
  selectedTab: string;
  user: UserWithRoles | null;
  isSelected?: (item: EnhancedShow) => boolean;
  onToggleSelect?: (item: EnhancedShow) => void;
}

export const ShowCardGrid: React.FC<ShowCardGridProps> = ({
  shows,
  entries,
  selectedTab,
  user,
  isSelected,
  onToggleSelect,
}) => (
  <div className="flex flex-col gap-3">
    {shows.map(show => (
      <ShowCardHorizontal
        key={show.id}
        show={show}
        entries={entries}
        selectedTab={selectedTab}
        user={user}
        isSelected={isSelected?.(show) ?? false}
        onToggleSelect={onToggleSelect ? () => onToggleSelect(show) : undefined}
      />
    ))}
  </div>
);

export default ShowCardGrid;
```

- [ ] **Step 2: Update `browse/index.ts` to export `ShowCardHorizontal`**

Add: `export { ShowCardHorizontal } from './ShowCardHorizontal';`

- [ ] **Step 3: Run typecheck to verify no breakage**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No new errors. `BrowseShowsPage` should work unchanged since `ShowCardGridProps` interface is preserved.

- [ ] **Step 4: Run existing tests**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: All existing tests pass (except the `ShowCard.branding.test.tsx` which we'll remove in Task 7)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx apps/myk9show/src/components/shows/browse/index.ts
git commit -m "refactor(show-cards): rewrite ShowCardGrid as thin wrapper over ShowCardHorizontal"
```

---

### Task 6: `ShowCardVertical` Component

**Files:**

- Create: `apps/myk9show/src/components/shows/ShowCardVertical.tsx`
- Test: `apps/myk9show/src/components/shows/__tests__/ShowCardVertical.test.tsx`

- [ ] **Step 1: Write tests for ShowCardVertical**

Create `apps/myk9show/src/components/shows/__tests__/ShowCardVertical.test.tsx`:

Test coverage:

- Renders show name, club name
- Renders DateCircle with startDate/endDate
- Renders location with MapPin icon
- Renders organization badge and discipline tags
- Renders ShowProgressBar with trial/entry counts
- Handles missing optional `totalEntries` / `scoredTrials` (defaults to 0, shows empty track)
- Calls `onViewDetails` when clicked
- Has fixed width class (~280px)
- [ADDED] Handles show with empty events array (no crash)
- [ADDED] Skeleton renders without crashing and has `animate-pulse` class

Include a `ShowCardVerticalSkeleton` export.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowCardVertical.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `ShowCardVertical.tsx`**

Layout: date circle + title side by side at top, metadata stacked below, tags, progress section as footer. Fixed width `w-[280px]`. Uses `DateCircle` (size `md`), `ShowProgressBar`, `getShowCardStatus`, `getEntryStatus`.

`ShowCardVertical` computes `entryStatus` internally via `getEntryStatus(show, false)` — the vertical card is for public/browse contexts where we don't know if the current user has entries. If user-specific status is needed later, add an optional `userHasEntries` prop.

Include `ShowCardVerticalSkeleton` component — a `280px` wide skeleton with `animate-pulse` blocks matching the vertical layout (date box placeholder, title lines, meta lines, tags row, progress track).

- [ ] **Step 4: Run tests, verify all pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowCardVertical.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowCardVertical.tsx apps/myk9show/src/components/shows/__tests__/ShowCardVertical.test.tsx
git commit -m "feat(show-cards): add ShowCardVertical for landing page carousel"
```

---

### Task 7: Delete Old Components + Migrate Consumers

**Files:**

- Delete: `apps/myk9show/src/components/shows/ShowCard.tsx`
- Delete: `apps/myk9show/src/components/shows/show-card-placeholders.ts`
- Delete: `apps/myk9show/src/components/shows/__tests__/ShowCard.branding.test.tsx`
- Modify: `apps/myk9show/src/components/shows/index.ts`
- Modify: `apps/myk9show/src/components/shows/UpcomingShows.tsx`
- Modify: `apps/myk9show/src/components/landing/UpcomingShowsSection.tsx`
- Modify: `apps/myk9show/src/components/clubs/ClubDetails/BrandingTab.tsx`
- Modify: `apps/myk9show/src/types/index.ts`
- Modify: `apps/myk9show/src/types.ts`

- [ ] **Step 1: Update `shows/index.ts` barrel exports**

Replace `ShowCard` exports with `ShowCardVertical` exports:

```typescript
export { ShowCardVertical } from './ShowCardVertical';
export { DateCircle } from './DateCircle';
export { ShowProgressBar } from './ShowProgressBar';
export { default as UpcomingShows } from './UpcomingShows';
export type { UpcomingShowsVariant, UpcomingShowsProps } from './UpcomingShows';
```

- [ ] **Step 2: Update `UpcomingShows.tsx`**

- Remove local `Show` interface (lines 7-17) — this type has `title`, `date`, `imageUrl` which differ from domain `Show` (`name`, `startDate`/`endDate`)
- Import `Show` from `@/types/show-types`
- Replace `<ShowCard>` with `<ShowCardVertical>`
- Update `UpcomingShowsProps` to use domain `Show` type
- Keep all carousel mechanics unchanged
- **Important:** Identify and update all parent components that create the `shows` array for `UpcomingShows`. Search for `<UpcomingShows` usages — they currently map data to the old local `Show` shape with `title`/`date`/`imageUrl` and must be updated to pass domain `Show` objects instead. Use `grep -r "UpcomingShows" apps/myk9show/src/ --include="*.tsx"` to find all consumers.

- [ ] **Step 3: Update `UpcomingShowsSection.tsx`**

- Replace `LandingShow` import with `Show` from `@/types/show-types`
- Replace inline card markup with `<ShowCardVertical show={show} onViewDetails={...} />`
- Update `UpcomingShowsSectionProps` to use `Show[]`

- [ ] **Step 4: Update `BrandingTab.tsx`**

- Replace `import { ShowCard } from '@/components/shows/ShowCard'` with `import { ShowCardVertical } from '@/components/shows/ShowCardVertical'`
- Update the preview card usage to use `ShowCardVertical` (or create a minimal mock show object)

- [ ] **Step 5: Remove `LandingShow` type**

- Remove `LandingShow` interface from `apps/myk9show/src/types/index.ts`
- Remove `LandingShow` re-export from `apps/myk9show/src/types.ts`
- Search for any remaining `LandingShow` imports and fix them

- [ ] **Step 6: Delete old files**

```bash
rm apps/myk9show/src/components/shows/ShowCard.tsx
rm apps/myk9show/src/components/shows/show-card-placeholders.ts
rm apps/myk9show/src/components/shows/__tests__/ShowCard.branding.test.tsx
```

- [ ] **Step 7: Run typecheck + lint + tests**

Run: `pnpm typecheck && pnpm lint`
Then: `cd apps/myk9show && pnpm vitest run`
Expected: Zero errors, all tests pass. Fix any import issues found.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/shows/index.ts \
  apps/myk9show/src/components/shows/UpcomingShows.tsx \
  apps/myk9show/src/components/landing/UpcomingShowsSection.tsx \
  apps/myk9show/src/components/clubs/ClubDetails/BrandingTab.tsx \
  apps/myk9show/src/types/index.ts \
  apps/myk9show/src/types.ts
git rm apps/myk9show/src/components/shows/ShowCard.tsx \
  apps/myk9show/src/components/shows/show-card-placeholders.ts \
  apps/myk9show/src/components/shows/__tests__/ShowCard.branding.test.tsx
git commit -m "refactor(show-cards): delete old ShowCard, migrate UpcomingShows and landing page to ShowCardVertical"
```

---

### Task 8: Verify `clubs/ShowCard.tsx` is Unaffected

**Files:** None (verification only)

`clubs/ShowCard.tsx` and `clubs/ShowsList.tsx` are separate club-context components with their own local `Show` type (`id, name, date, location, description, image`). They are NOT the same as `shows/ShowCard.tsx` which we deleted. They are used only within club detail pages and have different data requirements. **Leave as-is in this iteration** — migrating club components to the new design pattern is a separate future task.

- [ ] **Step 1: Verify no import breakage**

Run: `pnpm typecheck`
Confirm that `clubs/ShowCard.tsx` and `clubs/ShowsList.tsx` still compile correctly and are not affected by the deletion of `shows/ShowCard.tsx`.

---

### Task 9: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: Zero errors across monorepo

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: Zero errors

- [ ] **Step 3: Run myK9Show test suite**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: All tests pass, no regressions

- [ ] **Step 4: Run dev server and visually verify**

Run: `pnpm dev:show`
Check:

- BrowseShowsPage → horizontal cards with date circles, progress bars, discipline tags
- Landing page → vertical carousel cards without cover images
- Mobile viewport → horizontal cards stack to vertical layout
- All card states: upcoming, accepting entries, closing soon, in progress, completed

- [ ] **Step 5: Search for stale imports**

```bash
# Check no remaining references to deleted files
grep -r "show-card-placeholders" apps/myk9show/src/
grep -r "getShowPlaceholder" apps/myk9show/src/
grep -r "LandingShow" apps/myk9show/src/
grep -r "from.*ShowCard'" apps/myk9show/src/components/shows/
```

Expected: No results (all references cleaned up)
