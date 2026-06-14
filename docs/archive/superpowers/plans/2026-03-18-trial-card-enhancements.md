# Trial Card Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance trial cards with a date element, class/entry counts, and a scoring progress bar.

**Architecture:** Compute `trialStats` (classCount, entryCount, completedClasses) in ShowDetailsPage from existing `trialClasses` store data, pass to TrialsTab as a new prop. Rewrite TrialsTab card layout to horizontal: date rounded-square on left, content with progress bar divider and counts on right.

**Tech Stack:** React, Tailwind CSS, Lucide icons, `@myk9/core` status constants, vitest

**Spec:** `docs/superpowers/specs/2026-03-18-trial-card-enhancements-design.md`

---

## File Map

| File                                                         | Action  | Responsibility                                                        |
| ------------------------------------------------------------ | ------- | --------------------------------------------------------------------- |
| `apps/myk9show/src/pages/ShowDetailsPage.tsx`                | Modify  | Compute `trialStats` memo, pass to `TrialsTab`                        |
| `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`      | Rewrite | New card layout with date element, progress bar, counts               |
| `apps/myk9show/src/test/components/shows/TrialsTab.test.tsx` | Create  | Tests for card rendering, counts, progress bar, role-based Add button |

---

### Task 1: Rewrite TrialsTab and wire up trialStats from ShowDetailsPage

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Rewrite: `apps/myk9show/src/components/shows/tabs/TrialsTab.tsx`

- [ ] **Step 1: Add trialStats useMemo to ShowDetailsPage**

In `apps/myk9show/src/pages/ShowDetailsPage.tsx`, add this memo after the `showClasses` memo (around line 146), before the tab management section. `CLASS_STATUS` is already imported on line 32.

```typescript
// Trial statistics for card display (class counts, entry counts, scoring progress)
const trialStats = useMemo(() => {
  const stats: Record<
    string,
    { classCount: number; entryCount: number; completedClasses: number }
  > = {};
  for (const trial of associatedTrials) {
    const classes = trialClasses[trial.id] || [];
    stats[trial.id] = {
      classCount: classes.length,
      entryCount: classes.reduce((sum, cls) => sum + (cls.entries ?? 0), 0),
      completedClasses: classes.filter(cls => cls.status === CLASS_STATUS.COMPLETED).length,
    };
  }
  return stats;
}, [associatedTrials, trialClasses]);
```

- [ ] **Step 2: Pass trialStats to TrialsTab**

Change the TrialsTab usage (around line 331) from:

```tsx
<TrialsTab trials={associatedTrials} showId={actualCurrentShow.id} />
```

To:

```tsx
<TrialsTab trials={associatedTrials} showId={actualCurrentShow.id} trialStats={trialStats} />
```

- [ ] **Step 3: Rewrite TrialsTab component**

```tsx
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Plus } from 'lucide-react';
import type { Trial } from '@/components/trials/types/trial.types';
import { useRBAC } from '@/hooks/useRBAC';
import { getClassStatusBadgeClasses, getClassStatusDisplay, CLASS_STATUS } from '@myk9/core';
import { parseLocalDateString } from '@/utils/dateLocal';

interface TrialStats {
  classCount: number;
  entryCount: number;
  completedClasses: number;
}

interface TrialsTabProps {
  trials: Trial[];
  showId: string;
  trialStats: Record<string, TrialStats>;
}

function getDateParts(dateStr: string): { month: string; day: string } | null {
  const date = parseLocalDateString(dateStr);
  if (!date) return null;
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function getTrialStatusColor(status: string): { border: string; text: string } {
  const normalized = getClassStatusDisplay(status).label;
  if (normalized === 'Complete') {
    return { border: 'border-green-600', text: 'text-green-600' };
  }
  if (normalized === 'In Progress') {
    return { border: 'border-blue-500', text: 'text-blue-500' };
  }
  return { border: 'border-border', text: 'text-blue-500' };
}

function getProgressBarColor(status: string): string {
  const normalized = getClassStatusDisplay(status).label;
  if (normalized === 'Complete') return 'bg-green-600';
  return 'bg-blue-500';
}

export function TrialsTab({ trials, showId, trialStats }: TrialsTabProps) {
  const navigate = useNavigate();
  const { hasPermission } = useRBAC();

  const canManage = hasPermission('admin:manage') || hasPermission('show:manage');

  const openWizard = () =>
    navigate(`/secretary/create-show/wizard?showId=${showId}&mode=add-trials`);

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openWizard()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Trial
          </Button>
        </div>
      )}

      {trials.length === 0 ? (
        <div className="py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">No Trials</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No trials have been created for this show yet.
          </p>
          {canManage && (
            <Button variant="outline" className="mt-4 gap-1.5" onClick={() => openWizard()}>
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trials.map(trial => {
            const dateParts = trial.trialDate ? getDateParts(trial.trialDate) : null;
            const stats = trialStats[trial.id] || {
              classCount: 0,
              entryCount: 0,
              completedClasses: 0,
            };
            const statusColor = getTrialStatusColor(trial.status);
            const progressPct =
              stats.classCount > 0 ? (stats.completedClasses / stats.classCount) * 100 : 0;
            const showScored = stats.completedClasses > 0;

            // Build type/time line
            const detailParts = [trial.trialType, trial.plannedStartTime].filter(Boolean);
            const detailLine = detailParts.join(' \u00B7 ');

            return (
              <Card
                key={trial.id}
                className="cursor-pointer overflow-hidden border border-border bg-card shadow-sm transition-all hover:shadow-md hover:border-primary/30"
                onClick={() => navigate(`/shows/${showId}/trials/${trial.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={e =>
                  e.key === 'Enter' && navigate(`/shows/${showId}/trials/${trial.id}`)
                }
              >
                <div className="p-4">
                  <div className="flex gap-4 items-start">
                    {/* Date element */}
                    {dateParts && (
                      <div
                        className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border-2 bg-background ${statusColor.border}`}
                      >
                        <span
                          className={`text-[10px] font-semibold uppercase leading-none tracking-wide ${statusColor.text}`}
                        >
                          {dateParts.month}
                        </span>
                        <span className="text-[22px] font-bold leading-tight text-card-foreground">
                          {dateParts.day}
                        </span>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + status badge */}
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-card-foreground truncate">
                          {trial.name || `Trial ${trial.trialNumber}`}
                        </h3>
                        <Badge
                          className={`shrink-0 text-[10px] ${getClassStatusBadgeClasses(trial.status)}`}
                        >
                          {getClassStatusDisplay(trial.status).label}
                        </Badge>
                      </div>

                      {/* Row 2: Type + time */}
                      {detailLine && (
                        <p className="text-xs text-muted-foreground mb-2">{detailLine}</p>
                      )}

                      {/* Row 3: Progress bar divider */}
                      <div className="h-[3px] rounded-full bg-border overflow-hidden mb-2">
                        {progressPct > 0 && (
                          <div
                            className={`h-full rounded-full ${getProgressBarColor(trial.status)}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        )}
                      </div>

                      {/* Row 4: Counts + scored */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex gap-3">
                          <span>
                            <strong className="text-card-foreground">{stats.classCount}</strong>{' '}
                            classes
                          </span>
                          <span>
                            <strong className="text-card-foreground">{stats.entryCount}</strong>{' '}
                            entries
                          </span>
                        </div>
                        {showScored && (
                          <span className={`text-[11px] ${statusColor.text}`}>
                            {stats.completedClasses}/{stats.classCount} scored
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: Zero errors. Both files are updated so the `trialStats` prop types align.

- [ ] **Step 5: Commit both files together**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx apps/myk9show/src/components/shows/tabs/TrialsTab.tsx
git commit -m "feat(trials): rewrite trial cards with date element, counts, and progress bar

New horizontal layout: rounded-square date on left, content on right.
Compute trialStats (classCount, entryCount, completedClasses) in
ShowDetailsPage from trialClasses store data. Progress bar divider
shifts from blue to green as scoring completes.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Write tests for TrialsTab

**Files:**

- Create: `apps/myk9show/src/test/components/shows/TrialsTab.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrialsTab } from '@/components/shows/tabs/TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

let mockHasPermission = (_p: string) => false;
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: (p: string) => mockHasPermission(p),
  }),
}));

vi.mock('@myk9/core', () => ({
  getClassStatusBadgeClasses: () => 'bg-gray-100 text-gray-800',
  getClassStatusDisplay: (status: string) => {
    if (status === 'In Progress') return { label: 'In Progress' };
    if (status === 'Completed') return { label: 'Complete' };
    return { label: 'Upcoming' };
  },
  CLASS_STATUS: {
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In Progress',
    SCHEDULED: 'Scheduled',
  },
}));

vi.mock('@/utils/dateLocal', () => ({
  parseLocalDateString: (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return isNaN(d.getTime()) ? undefined : d;
  },
}));

function makeTrial(overrides: Partial<Trial> & { id: string }): Trial {
  return {
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-05-10',
    trialNumber: '1',
    status: 'Upcoming',
    ...overrides,
  } as Trial;
}

describe('TrialsTab', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockHasPermission = () => false;
  });

  it('renders date element with month and day', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('MAY')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays class and entry counts', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('classes')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('shows scored text when completedClasses > 0', () => {
    const trials = [makeTrial({ id: 't1', status: 'In Progress' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 3 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('3/5 scored')).toBeInTheDocument();
  });

  it('hides scored text when completedClasses is 0', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.queryByText(/scored/)).not.toBeInTheDocument();
  });

  it('shows empty state when no trials', () => {
    render(<TrialsTab trials={[]} showId="show-1" trialStats={{}} />);

    expect(screen.getByText('No Trials')).toBeInTheDocument();
  });

  it('displays trial type and start time', () => {
    const trials = [makeTrial({ id: 't1', trialType: 'Scent Work', plannedStartTime: '8:00 AM' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText(/Scent Work/)).toBeInTheDocument();
    expect(screen.getByText(/8:00 AM/)).toBeInTheDocument();
  });

  it('handles missing trialStats gracefully', () => {
    const trials = [makeTrial({ id: 't1' })];
    // No stats for t1
    render(<TrialsTab trials={trials} showId="show-1" trialStats={{}} />);

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('classes')).toBeInTheDocument();
  });

  // [ADDED] Verify completed trial shows full scored count
  it('shows full scored count for completed trial', () => {
    const trials = [makeTrial({ id: 't1', status: 'Completed' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 5 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('5/5 scored')).toBeInTheDocument();
  });

  it('renders without date element when trialDate is empty', () => {
    const trials = [makeTrial({ id: 't1', trialDate: '' })];
    const stats = { t1: { classCount: 3, entryCount: 20, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    // Card renders but no month/day text from date element
    expect(screen.queryByText('MAY')).not.toBeInTheDocument();
    // Counts still render
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Add Trial button when user has manage permission', () => {
    mockHasPermission = (p: string) => p === 'admin:manage';
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('Add Trial')).toBeInTheDocument();
  });

  it('hides Add Trial button when user lacks permissions', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.queryByText('Add Trial')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && npx vitest --run src/test/components/shows/TrialsTab.test.tsx`

Expected: All tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `cd apps/myk9show && npx vitest --run`

Expected: No regressions. All existing tests pass.

- [ ] **Step 4: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`

Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/test/components/shows/TrialsTab.test.tsx
git commit -m "test(trials): add tests for enhanced trial cards

Tests date element rendering, class/entry counts, scored text visibility,
empty state, type/time display, and graceful handling of missing stats.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
