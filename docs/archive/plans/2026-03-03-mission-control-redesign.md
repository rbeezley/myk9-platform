# Mission Control Dashboard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the trial-level 6-column pipeline dashboard with a show-focused, class-level 5-column pipeline workstation for trial secretaries.

**Architecture:** The secretary selects a show and trial via stacked dropdown rows (each with inline stat chips). Classes for the selected trial are fetched via React Query and displayed in a 5-column Kanban: Not Started → Setup → In Progress → Results → Closed. A pure utility maps each DB class status to its pipeline column. Clicking a class card navigates to `/shows/:showId/trials/:trialId/classes/:classId/secretary`.

**Tech Stack:** React, TypeScript, Tailwind CSS, React Query, Zustand (showStore), Supabase, Lucide icons, shadcn/ui components.

**Reference mockup:** `mockup-dashboard.html` in project root — open in browser for visual reference.

---

## Task 1: Class pipeline types & stage mapping utility

**Files:**
- Create: `apps/myk9show/src/features/pipeline/mission-control-types.ts`
- Create: `apps/myk9show/src/features/pipeline/utils/classStageMapping.ts`
- Create: `apps/myk9show/src/features/pipeline/utils/__tests__/classStageMapping.test.ts`

### Step 1: Create the types file

Create `apps/myk9show/src/features/pipeline/mission-control-types.ts`:

```typescript
/**
 * Types for the Mission Control class-level pipeline dashboard.
 */

/** Visual pipeline columns for classes */
export type ClassPipelineStage =
  | 'not-started'
  | 'setup'
  | 'in-progress'
  | 'results'
  | 'closed';

/** Ordered list of class pipeline stages for rendering columns */
export const CLASS_PIPELINE_STAGES: ClassPipelineStage[] = [
  'not-started',
  'setup',
  'in-progress',
  'results',
  'closed',
];

/** Display metadata for each class pipeline stage */
export const CLASS_STAGE_META: Record<
  ClassPipelineStage,
  { label: string; description: string }
> = {
  'not-started': { label: 'Not Started', description: 'Awaiting setup' },
  setup: { label: 'Setup', description: 'Judge is setting up hides' },
  'in-progress': { label: 'In Progress', description: 'Scoring underway' },
  results: { label: 'Results', description: 'Scoring complete — review needed' },
  closed: { label: 'Closed', description: 'Results finalized' },
};

/** Class data shaped for pipeline display */
export interface ClassPipelineItem {
  id: string;
  name: string;
  judge_name: string | null;
  status: string | null;
  stage: ClassPipelineStage;
  scored_count: number;
  total_entries: number;
  is_scoring_finalized: boolean;
  /** [ADDED] True when secretary has reviewed results (enables Publish action) */
  is_results_reviewed: boolean;
  start_time: string | null;
  planned_start_time: string | null;
}

/** Stats computed for a show or trial context row */
export interface ContextStats {
  trialCount: number;
  classCount: number;
  scoredCount: number;
  totalEntries: number;
  percentComplete: number;
  percentQualified: number | null;
}
```

### Step 2: Create the stage mapping utility

Create `apps/myk9show/src/features/pipeline/utils/classStageMapping.ts`:

```typescript
import type { ClassPipelineStage } from '../mission-control-types';

/**
 * Maps a database class status + finalization flag to a visual pipeline stage.
 *
 * DB statuses (from CHECK constraint on classes table):
 *   no-status, setup, briefing, break, start_time, in_progress, offline-scoring, completed
 *
 * Pipeline columns:
 *   not-started  ← no-status (or null)
 *   setup        ← setup
 *   in-progress  ← briefing, start_time, in_progress, break, offline-scoring
 *   results      ← completed AND NOT finalized
 *   closed       ← completed AND finalized (is_scoring_finalized = true)
 */
export function mapClassToStage(
  status: string | null | undefined,
  isScoringFinalized: boolean | null | undefined,
): ClassPipelineStage {
  const s = status ?? 'no-status';

  if (s === 'completed') {
    return isScoringFinalized ? 'closed' : 'results';
  }

  switch (s) {
    case 'setup':
      return 'setup';
    case 'briefing':
    case 'start_time':
    case 'in_progress':
    case 'break':
    case 'offline-scoring':
      return 'in-progress';
    case 'no-status':
    default:
      return 'not-started';
  }
}

/**
 * Groups an array of class items by their pipeline stage.
 */
export function groupClassesByStage<
  T extends { stage: ClassPipelineStage },
>(classes: T[]): Map<ClassPipelineStage, T[]> {
  const map = new Map<ClassPipelineStage, T[]>();
  for (const stage of ['not-started', 'setup', 'in-progress', 'results', 'closed'] as ClassPipelineStage[]) {
    map.set(stage, []);
  }
  for (const cls of classes) {
    map.get(cls.stage)!.push(cls);
  }
  return map;
}
```

### Step 3: Write tests for stage mapping

Create `apps/myk9show/src/features/pipeline/utils/__tests__/classStageMapping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapClassToStage, groupClassesByStage } from '../classStageMapping';

describe('mapClassToStage', () => {
  it('maps null/undefined status to not-started', () => {
    expect(mapClassToStage(null, false)).toBe('not-started');
    expect(mapClassToStage(undefined, null)).toBe('not-started');
  });

  it('maps no-status to not-started', () => {
    expect(mapClassToStage('no-status', false)).toBe('not-started');
  });

  it('maps setup to setup', () => {
    expect(mapClassToStage('setup', false)).toBe('setup');
  });

  it.each(['briefing', 'start_time', 'in_progress', 'break', 'offline-scoring'])(
    'maps %s to in-progress',
    (status) => {
      expect(mapClassToStage(status, false)).toBe('in-progress');
    },
  );

  it('maps completed + not finalized to results', () => {
    expect(mapClassToStage('completed', false)).toBe('results');
    expect(mapClassToStage('completed', null)).toBe('results');
  });

  it('maps completed + finalized to closed', () => {
    expect(mapClassToStage('completed', true)).toBe('closed');
  });

  it('maps unknown status to not-started', () => {
    expect(mapClassToStage('unknown-value', false)).toBe('not-started');
  });
});

describe('groupClassesByStage', () => {
  it('groups items into all 5 stages', () => {
    const items = [
      { id: '1', stage: 'not-started' as const },
      { id: '2', stage: 'in-progress' as const },
      { id: '3', stage: 'in-progress' as const },
      { id: '4', stage: 'closed' as const },
    ];
    const grouped = groupClassesByStage(items);

    expect(grouped.get('not-started')!.length).toBe(1);
    expect(grouped.get('setup')!.length).toBe(0);
    expect(grouped.get('in-progress')!.length).toBe(2);
    expect(grouped.get('results')!.length).toBe(0);
    expect(grouped.get('closed')!.length).toBe(1);
  });

  it('returns empty arrays for all stages when input is empty', () => {
    const grouped = groupClassesByStage([]);
    expect(grouped.size).toBe(5);
    for (const arr of grouped.values()) {
      expect(arr.length).toBe(0);
    }
  });
});
```

### Step 4: Run the test

```bash
cd apps/myk9show && pnpm vitest run src/features/pipeline/utils/__tests__/classStageMapping.test.ts
```

Expected: All tests pass.

### Step 5: Commit

```bash
git add apps/myk9show/src/features/pipeline/mission-control-types.ts \
       apps/myk9show/src/features/pipeline/utils/classStageMapping.ts \
       apps/myk9show/src/features/pipeline/utils/__tests__/classStageMapping.test.ts
git commit -m "feat(pipeline): add class pipeline types and stage mapping utility"
```

---

## Task 2: `useMissionControlData` hook

**Files:**
- Create: `apps/myk9show/src/features/pipeline/hooks/useMissionControlData.ts`

**Dependencies:** Task 1 (types and mapping utility)

### Step 1: Create the data hook

Create `apps/myk9show/src/features/pipeline/hooks/useMissionControlData.ts`:

```typescript
/**
 * Data hook for the Mission Control dashboard.
 *
 * Manages show/trial selection and computes class pipeline data.
 */

import { useState, useMemo, useCallback } from 'react';
import { useShowStore } from '@/store/showStore';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { mapClassToStage, groupClassesByStage } from '../utils/classStageMapping';
import type {
  ClassPipelineItem,
  ClassPipelineStage,
  ContextStats,
} from '../mission-control-types';

export function useMissionControlData() {
  const { shows, isLoading: showsLoading } = useShowStore();

  // Selection state
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);

  // Derive selected show
  const selectedShow = useMemo(
    () => shows.find((s) => s.id === selectedShowId) ?? shows[0] ?? null,
    [shows, selectedShowId],
  );

  // Derive trials for selected show
  const trials = useMemo(
    () => selectedShow?.trials ?? [],
    [selectedShow],
  );

  // Derive selected trial
  const selectedTrial = useMemo(
    () => trials.find((t) => t.id === selectedTrialId) ?? trials[0] ?? null,
    [trials, selectedTrialId],
  );

  // Fetch classes for the selected trial
  const effectiveTrialId = selectedTrial?.id ?? '';
  const {
    data: rawClasses,
    isLoading: classesLoading,
  } = useClassesByTrialQuery(effectiveTrialId, !!effectiveTrialId);

  // Map raw DB classes → ClassPipelineItem[]
  const pipelineClasses = useMemo<ClassPipelineItem[]>(() => {
    if (!rawClasses) return [];
    // [EXPANDED] Robust entry count: prefer scored total_entries_count,
    // fall back to entries relation length from the Supabase join.
    return rawClasses.map((cls: Record<string, unknown>) => {
      const entries = (cls as { entries?: { id: string }[] }).entries;
      const totalEntries = Number(cls.total_entries_count) || entries?.length || 0;

      return {
        id: String(cls.id),
        name: String(cls.name ?? 'Unnamed Class'),
        judge_name: cls.judge_name ? String(cls.judge_name) : null,
        status: cls.status ? String(cls.status) : null,
        stage: mapClassToStage(
          cls.status as string | null,
          cls.is_scoring_finalized as boolean | null,
        ),
        scored_count: Number(cls.scored_count ?? 0),
        total_entries: totalEntries,
        is_scoring_finalized: Boolean(cls.is_scoring_finalized),
        // [ADDED] Track whether secretary has reviewed results
        is_results_reviewed: Boolean((cls as Record<string, unknown>).is_results_reviewed),
        start_time: cls.start_time ? String(cls.start_time) : null,
        planned_start_time: cls.planned_start_time ? String(cls.planned_start_time) : null,
      };
    });
  }, [rawClasses]);

  // Group by stage
  const classesByStage = useMemo(
    () => groupClassesByStage(pipelineClasses),
    [pipelineClasses],
  );

  // Show-level stats (across ALL trials for the selected show)
  const showStats = useMemo<ContextStats>(() => {
    const trialCount = trials.length;
    // For now, we only have class data for the selected trial.
    // Show-level aggregation would need all trials' classes.
    // Use pipeline classes as approximation, clearly mark for future enhancement.
    const classCount = pipelineClasses.length;
    const scoredCount = pipelineClasses.reduce((s, c) => s + c.scored_count, 0);
    const totalEntries = pipelineClasses.reduce((s, c) => s + c.total_entries, 0);
    const percentComplete = totalEntries > 0 ? Math.round((scoredCount / totalEntries) * 100) : 0;

    return {
      trialCount,
      classCount,
      scoredCount,
      totalEntries,
      percentComplete,
      percentQualified: null, // Needs entry-level scoring data — future enhancement
    };
  }, [trials, pipelineClasses]);

  // Trial-level stats
  const trialStats = useMemo<ContextStats>(() => {
    const classCount = pipelineClasses.length;
    const scoredCount = pipelineClasses.reduce((s, c) => s + c.scored_count, 0);
    const totalEntries = pipelineClasses.reduce((s, c) => s + c.total_entries, 0);
    const percentComplete = totalEntries > 0 ? Math.round((scoredCount / totalEntries) * 100) : 0;

    return {
      trialCount: 1,
      classCount,
      scoredCount,
      totalEntries,
      percentComplete,
      percentQualified: null,
    };
  }, [pipelineClasses]);

  // Handle show change — reset trial selection
  const handleShowChange = useCallback((showId: string) => {
    setSelectedShowId(showId);
    setSelectedTrialId(null);
  }, []);

  const handleTrialChange = useCallback((trialId: string) => {
    setSelectedTrialId(trialId);
  }, []);

  // Determine if any class is actively being scored
  const hasLiveClasses = pipelineClasses.some((c) => c.stage === 'in-progress');

  return {
    // Loading
    isLoading: showsLoading,
    classesLoading,

    // Selection
    shows,
    selectedShow,
    selectedTrial,
    trials,
    handleShowChange,
    handleTrialChange,

    // Pipeline data
    pipelineClasses,
    classesByStage,
    hasLiveClasses,

    // Stats
    showStats,
    trialStats,
  };
}
```

### Step 2: Re-export from hooks index

If `apps/myk9show/src/features/pipeline/hooks/index.ts` exists, add the new export. Otherwise create it.

Check for and add:
```typescript
export { useMissionControlData } from './useMissionControlData';
```

### Step 3: Commit

```bash
git add apps/myk9show/src/features/pipeline/hooks/useMissionControlData.ts \
       apps/myk9show/src/features/pipeline/hooks/index.ts
git commit -m "feat(pipeline): add useMissionControlData hook for show/trial/class selection"
```

---

## Task 3: Add `fullWidth` prop to `SecretaryLayout`

**Files:**
- Modify: `apps/myk9show/src/components/secretary/SecretaryLayout.tsx`

### Step 1: Add the prop

In `SecretaryLayout.tsx`, change the interface and the inner div:

```typescript
interface SecretaryLayoutProps {
  children?: React.ReactNode;
  fullWidth?: boolean;
}

export function SecretaryLayout({ children, fullWidth }: SecretaryLayoutProps): React.ReactElement {
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  return (
    <SidebarLayout
      sidebar={<SecretarySidebar onCloseMobile={closeMobile} />}
      sidebarWidth={288}
      mobileMenuLabel="Secretary Dashboard"
      mobileOpen={mobileOpen}
      onMobileOpenChange={setMobileOpen}
    >
      <div className={fullWidth ? 'px-6 py-6' : 'px-6 py-8 max-w-7xl mx-auto'}>
        {children ?? <Outlet />}
      </div>
    </SidebarLayout>
  );
}
```

### Step 2: Commit

```bash
git add apps/myk9show/src/components/secretary/SecretaryLayout.tsx
git commit -m "feat(layout): add fullWidth prop to SecretaryLayout"
```

---

## Task 4: Create `ClassPipelineCard` component

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/ClassPipelineCard.tsx`

**Design:** Matches the myK9Q ClassCard aesthetic — left accent border, status badge (top-right), class name, judge name, progress bar, scored summary. Clicking navigates to the class's secretary dashboard.

### Step 1: Create the component

Create `apps/myk9show/src/features/pipeline/components/ClassPipelineCard.tsx`:

```typescript
/**
 * ClassPipelineCard — Class card for the Mission Control pipeline.
 *
 * Renders a compact card inspired by the myK9Q ClassCard:
 * left accent border, status badge, judge name, progress bar, and scored count.
 * Clicking navigates to the secretary class dashboard.
 */

import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Circle,
  Settings,
  Play,
  CheckCircle,
  Lock,
} from 'lucide-react';
import type { ClassPipelineItem } from '../mission-control-types';

interface ClassPipelineCardProps {
  item: ClassPipelineItem;
  showId: string;
  trialId: string;
}

// [EXPANDED] Two result sub-states: 'results' (done, needs review) and
// 'results-reviewed' (reviewed, ready to publish). The stage is still
// 'results' — the card checks is_results_reviewed for visual distinction.
const STAGE_STYLE: Record<
  string,
  { accent: string; badgeBg: string; badgeText: string; icon: React.ElementType; label: string }
> = {
  'not-started': {
    accent: 'bg-muted-foreground/40',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    icon: Circle,
    label: 'No Status',
  },
  setup: {
    accent: 'bg-yellow-500',
    badgeBg: 'bg-yellow-500/15',
    badgeText: 'text-yellow-500',
    icon: Settings,
    label: 'Setup',
  },
  'in-progress': {
    accent: 'bg-green-500',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-500',
    icon: Play,
    label: 'Active',
  },
  results: {
    accent: 'bg-primary',
    badgeBg: 'bg-primary/15',
    badgeText: 'text-primary',
    icon: CheckCircle,
    label: 'Done',
  },
  'results-reviewed': {
    accent: 'bg-green-500',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-500',
    icon: CheckCircle,
    label: 'Reviewed',
  },
  closed: {
    accent: 'bg-muted-foreground/50',
    badgeBg: 'bg-muted',
    badgeText: 'text-muted-foreground',
    icon: Lock,
    label: 'Published',
  },
};

export const ClassPipelineCard: React.FC<ClassPipelineCardProps> = ({
  item,
  showId,
  trialId,
}) => {
  const navigate = useNavigate();
  // [EXPANDED] Resolve style key: results cards distinguish Done vs Reviewed
  const styleKey =
    item.stage === 'results' && item.is_results_reviewed
      ? 'results-reviewed'
      : item.stage;
  const style = STAGE_STYLE[styleKey] ?? STAGE_STYLE['not-started'];
  const Icon = style.icon;
  const progress =
    item.total_entries > 0
      ? Math.round((item.scored_count / item.total_entries) * 100)
      : 0;
  const isClosed = item.stage === 'closed';
  const isResults = item.stage === 'results';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() =>
        navigate(
          `/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`,
        )
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/shows/${showId}/trials/${trialId}/classes/${item.id}/secretary`);
        }
      }}
      className={cn(
        'relative w-full text-left rounded-lg border border-border/60 bg-card overflow-hidden',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isClosed && 'opacity-60',
      )}
    >
      {/* Left accent bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', style.accent)} />

      {/* Status badge (top-right) */}
      <div
        className={cn(
          'absolute top-0 right-0 flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-bl-lg',
          style.badgeBg,
          style.badgeText,
        )}
      >
        <Icon className="h-3 w-3" />
        {style.label}
      </div>

      {/* Card body */}
      <div className="p-4 pl-4.5 pt-5 space-y-2">
        {/* Class name */}
        <div className="font-semibold text-sm pr-20 leading-tight">
          {item.name}
        </div>

        {/* Judge */}
        {item.judge_name && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <svg
              className="h-3 w-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            Judge: {item.judge_name}
          </div>
        )}

        {/* Progress bar */}
        <div className="h-[3px] bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', style.accent)}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Scored summary */}
        <div className="text-[11px] text-muted-foreground">
          {item.scored_count}/{item.total_entries} scored
          {isClosed && ' \u2022 Results published'}
        </div>

        {/* [ADDED] Action buttons for Results stage cards */}
        {isResults && (
          <div className="flex gap-2 pt-0.5">
            {item.is_results_reviewed ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); /* TODO: publish action */ }}
                className="px-2.5 py-1.5 text-xs bg-green-500/15 text-green-400 rounded-md hover:bg-green-500/25 font-medium"
              >
                Publish
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); /* TODO: review action */ }}
                className="px-2.5 py-1.5 text-xs bg-primary/15 text-primary rounded-md hover:bg-primary/25 font-medium"
              >
                Review
              </button>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); /* TODO: print action */ }}
              className="px-2.5 py-1.5 text-xs border border-border rounded-md hover:bg-muted/50"
            >
              Print
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Step 2: Commit

```bash
git add apps/myk9show/src/features/pipeline/components/ClassPipelineCard.tsx
git commit -m "feat(pipeline): add ClassPipelineCard component for class-level Kanban"
```

---

## Task 5: Create `StatChip` component

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/StatChip.tsx`

### Step 1: Create the reusable stat chip

Create `apps/myk9show/src/features/pipeline/components/StatChip.tsx`:

```typescript
/**
 * StatChip — Compact inline stat display for context rows.
 */

import { cn } from '@/lib/utils';

interface StatChipProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBgClass?: string;
}

export const StatChip: React.FC<StatChipProps> = ({
  icon,
  value,
  label,
  iconBgClass = 'bg-primary/15',
}) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 border border-border/30">
    <div className={cn('p-1 rounded', iconBgClass)}>{icon}</div>
    <div>
      <div className="text-sm font-bold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  </div>
);
```

### Step 2: Commit

```bash
git add apps/myk9show/src/features/pipeline/components/StatChip.tsx
git commit -m "feat(pipeline): add StatChip component for inline dashboard stats"
```

---

## Task 6: Create `ShowContextRow` and `TrialContextRow` components

**Files:**
- Create: `apps/myk9show/src/features/pipeline/components/ShowContextRow.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/TrialContextRow.tsx`

### Step 1: Create ShowContextRow

Create `apps/myk9show/src/features/pipeline/components/ShowContextRow.tsx`:

```typescript
/**
 * ShowContextRow — Show selector + show-level stats in a single row.
 */

import {
  Calendar,
  Zap,
  Grid3X3,
  CheckCircle,
  TrendingUp,
  Award,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatChip } from './StatChip';
import type { ContextStats } from '../mission-control-types';
import type { Show } from '@/types/show-types';

interface ShowContextRowProps {
  shows: Show[];
  selectedShow: Show | null;
  onShowChange: (showId: string) => void;
  stats: ContextStats;
}

export const ShowContextRow: React.FC<ShowContextRowProps> = ({
  shows,
  selectedShow,
  onShowChange,
  stats,
}) => (
  <div className="flex items-center gap-4 rounded-xl bg-muted/20 border border-border/30 px-4 py-3">
    {/* Show selector */}
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className="p-1.5 bg-primary/15 rounded-lg">
        <Calendar className="h-3.5 w-3.5 text-primary" />
      </div>
      <Select value={selectedShow?.id ?? ''} onValueChange={onShowChange}>
        <SelectTrigger className="w-[260px] border-border/60 bg-card">
          <div className="text-left">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Show
            </div>
            <SelectValue placeholder="Select a show" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {shows.map((show) => (
            <SelectItem key={show.id} value={show.id}>
              {show.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Divider */}
    <div className="h-8 w-px bg-border/60 flex-shrink-0" />

    {/* Show-level stats */}
    <div className="flex items-center gap-3 flex-wrap">
      <StatChip
        icon={<Zap className="h-3 w-3 text-primary" />}
        value={stats.trialCount}
        label="Trials"
        iconBgClass="bg-primary/15"
      />
      <StatChip
        icon={<Grid3X3 className="h-3 w-3 text-blue-400" />}
        value={stats.classCount}
        label="Classes"
        iconBgClass="bg-blue-500/15"
      />
      <StatChip
        icon={<CheckCircle className="h-3 w-3 text-green-400" />}
        value={`${stats.scoredCount}/${stats.totalEntries}`}
        label="Scored"
        iconBgClass="bg-green-500/15"
      />
      <StatChip
        icon={<TrendingUp className="h-3 w-3 text-purple-400" />}
        value={`${stats.percentComplete}%`}
        label="Complete"
        iconBgClass="bg-purple-500/15"
      />
      <StatChip
        icon={<Award className="h-3 w-3 text-emerald-400" />}
        value={stats.percentQualified !== null ? `${stats.percentQualified}%` : '–'}
        label="Qualified"
        iconBgClass="bg-emerald-500/15"
      />
    </div>
  </div>
);
```

### Step 2: Create TrialContextRow

Create `apps/myk9show/src/features/pipeline/components/TrialContextRow.tsx`:

```typescript
/**
 * TrialContextRow — Trial selector + trial-level stats in a single row.
 */

import {
  Zap,
  Grid3X3,
  CheckCircle,
  TrendingUp,
  Award,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatChip } from './StatChip';
import type { ContextStats } from '../mission-control-types';
import type { ShowTrial } from '@/types/show-types';

interface TrialContextRowProps {
  trials: ShowTrial[];
  selectedTrial: ShowTrial | null;
  onTrialChange: (trialId: string) => void;
  stats: ContextStats;
}

export const TrialContextRow: React.FC<TrialContextRowProps> = ({
  trials,
  selectedTrial,
  onTrialChange,
  stats,
}) => (
  <div className="flex items-center gap-4 rounded-xl bg-muted/20 border border-border/30 px-4 py-3">
    {/* Trial selector */}
    <div className="flex items-center gap-3 flex-shrink-0">
      <div className="p-1.5 bg-amber-500/15 rounded-lg">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <Select value={selectedTrial?.id ?? ''} onValueChange={onTrialChange}>
        <SelectTrigger className="w-[260px] border-border/60 bg-card">
          <div className="text-left">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Trial
            </div>
            <SelectValue placeholder="Select a trial" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {trials.map((trial) => (
            <SelectItem key={trial.id} value={trial.id}>
              {trial.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    {/* Divider */}
    <div className="h-8 w-px bg-border/60 flex-shrink-0" />

    {/* Trial-level stats */}
    <div className="flex items-center gap-3 flex-wrap">
      <StatChip
        icon={<Zap className="h-3 w-3 text-primary" />}
        value={stats.trialCount}
        label="Trial"
        iconBgClass="bg-primary/15"
      />
      <StatChip
        icon={<Grid3X3 className="h-3 w-3 text-blue-400" />}
        value={stats.classCount}
        label="Classes"
        iconBgClass="bg-blue-500/15"
      />
      <StatChip
        icon={<CheckCircle className="h-3 w-3 text-green-400" />}
        value={`${stats.scoredCount}/${stats.totalEntries}`}
        label="Scored"
        iconBgClass="bg-green-500/15"
      />
      <StatChip
        icon={<TrendingUp className="h-3 w-3 text-purple-400" />}
        value={`${stats.percentComplete}%`}
        label="Complete"
        iconBgClass="bg-purple-500/15"
      />
      <StatChip
        icon={<Award className="h-3 w-3 text-emerald-400" />}
        value={stats.percentQualified !== null ? `${stats.percentQualified}%` : '–'}
        label="Qualified"
        iconBgClass="bg-emerald-500/15"
      />
    </div>
  </div>
);
```

### Step 3: Commit

```bash
git add apps/myk9show/src/features/pipeline/components/ShowContextRow.tsx \
       apps/myk9show/src/features/pipeline/components/TrialContextRow.tsx
git commit -m "feat(pipeline): add ShowContextRow and TrialContextRow with inline stats"
```

---

## Task 7: Update `PipelineColumn` for class cards

**Files:**
- Modify: `apps/myk9show/src/features/pipeline/components/PipelineColumn.tsx`

### Step 1: Rewrite PipelineColumn for class items

Replace the entire file with a new version that renders `ClassPipelineCard` items:

```typescript
/**
 * PipelineColumn — A single column in the class-level pipeline Kanban.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ClassPipelineCard } from './ClassPipelineCard';
import { CLASS_STAGE_META } from '../mission-control-types';
import type { ClassPipelineItem, ClassPipelineStage } from '../mission-control-types';

interface PipelineColumnProps {
  stage: ClassPipelineStage;
  classes: ClassPipelineItem[];
  showId: string;
  trialId: string;
  isLive?: boolean;
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  stage,
  classes,
  showId,
  trialId,
  isLive,
}) => {
  const meta = CLASS_STAGE_META[stage];

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-[220px] max-w-[350px] rounded-lg',
        'bg-muted/30 border border-border/40',
        isLive && 'ring-2 ring-green-500/20',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{meta.label}</h3>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {classes.length}
          </Badge>
          {isLive && (
            <div className="flex items-center gap-1 ml-1">
              <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-green-400 font-medium">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {classes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No classes
          </p>
        ) : (
          classes.map((item) => (
            <ClassPipelineCard
              key={item.id}
              item={item}
              showId={showId}
              trialId={trialId}
            />
          ))
        )}
      </div>
    </div>
  );
};
```

### Step 2: Commit

```bash
git add apps/myk9show/src/features/pipeline/components/PipelineColumn.tsx
git commit -m "refactor(pipeline): update PipelineColumn for class-level cards"
```

---

## Task 8: Rewrite `PipelineDashboard`

**Files:**
- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

**This is the main integration task.** Remove MissionControlSidebar, StatisticsCards, and trial-level pipeline. Replace with show/trial selectors, compact stats, and class-level pipeline.

### Step 1: Rewrite PipelineDashboard

Replace the entire file:

```typescript
/**
 * PipelineDashboard — Mission Control for trial secretaries.
 *
 * Show-focused workstation: select a show and trial, see class-level
 * pipeline progress across 5 columns.
 */

import React from 'react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { useMissionControlData } from '../hooks/useMissionControlData';
import { PipelineColumn } from './PipelineColumn';
import { ShowContextRow } from './ShowContextRow';
import { TrialContextRow } from './TrialContextRow';
import { CLASS_PIPELINE_STAGES } from '../mission-control-types';

export const PipelineDashboard: React.FC = () => {
  const {
    isLoading,
    classesLoading,
    shows,
    selectedShow,
    selectedTrial,
    trials,
    handleShowChange,
    handleTrialChange,
    classesByStage,
    hasLiveClasses,
    showStats,
    trialStats,
  } = useMissionControlData();

  if (isLoading) {
    return (
      <SecretaryLayout fullWidth>
        <DelightfulLoading message="Loading mission control..." />
      </SecretaryLayout>
    );
  }

  const showId = selectedShow?.id ?? '';
  const trialId = selectedTrial?.id ?? '';

  return (
    <SecretaryLayout fullWidth>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            {hasLiveClasses && (
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-400 font-medium">Show Day</span>
              </div>
            )}
          </div>
        </div>

        {/* Show context row */}
        <ShowContextRow
          shows={shows}
          selectedShow={selectedShow}
          onShowChange={handleShowChange}
          stats={showStats}
        />

        {/* Trial context row */}
        {trials.length > 0 && (
          <TrialContextRow
            trials={trials}
            selectedTrial={selectedTrial}
            onTrialChange={handleTrialChange}
            stats={trialStats}
          />
        )}

        {/* Empty state: no shows */}
        {shows.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium mb-1">No shows yet</p>
            <p className="text-sm">Create a show to get started with Mission Control.</p>
          </div>
        )}

        {/* Empty state: show selected but no trials */}
        {selectedShow && trials.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium mb-1">No trials for this show</p>
            <p className="text-sm">Add a trial to see the class pipeline.</p>
          </div>
        )}

        {/* Class pipeline */}
        {selectedTrial && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Class Pipeline
              {classesLoading && (
                <span className="ml-2 text-muted-foreground/50 normal-case font-normal">
                  Loading classes...
                </span>
              )}
            </h2>
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-4">
                {CLASS_PIPELINE_STAGES.map((stage) => (
                  <PipelineColumn
                    key={stage}
                    stage={stage}
                    classes={classesByStage.get(stage) ?? []}
                    showId={showId}
                    trialId={trialId}
                    isLive={stage === 'in-progress' && hasLiveClasses}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </SecretaryLayout>
  );
};

export default PipelineDashboard;
```

### Step 2: Commit

```bash
git add apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx
git commit -m "feat(pipeline): rewrite PipelineDashboard as class-level Mission Control"
```

---

## Task 9: Delete `MissionControlSidebar` and clean up stale imports

**Files:**
- Delete: `apps/myk9show/src/features/pipeline/components/MissionControlSidebar.tsx`
- Check: No other files import `MissionControlSidebar`

### Step 1: Search for stale imports

```bash
cd apps/myk9show && grep -r "MissionControlSidebar" src/
```

Expected: Only the file itself (already removed from PipelineDashboard in Task 8). If any other imports found, remove them.

### Step 2: Delete the file

```bash
rm apps/myk9show/src/features/pipeline/components/MissionControlSidebar.tsx
```

### Step 3: Verify no stale imports to old StatisticsCards or useSecretaryDashboardData from PipelineDashboard

```bash
grep -r "StatisticsCards\|useSecretaryDashboardData" apps/myk9show/src/features/pipeline/
```

Expected: No matches. The old dashboard types (`useSecretaryDashboardData`, `StatisticsCards`) are still used by other pages — don't delete them, just confirm they're no longer imported from pipeline code.

### Step 4: Commit

```bash
git add -A
git commit -m "chore(pipeline): remove MissionControlSidebar and stale imports"
```

---

## Task 10: Update pipeline barrel exports

**Files:**
- Modify: `apps/myk9show/src/features/pipeline/index.ts`

### Step 1: Add new exports

Ensure the barrel export includes the new modules. Check current contents and add:

```typescript
export * from './mission-control-types';
export * from './utils/classStageMapping';
```

### Step 2: Commit

```bash
git add apps/myk9show/src/features/pipeline/index.ts
git commit -m "chore(pipeline): update barrel exports for mission control types"
```

---

## Task 11: Typecheck and verify

### Step 1: Run typecheck

```bash
cd d:/AI-Projects/myk9-platform && pnpm typecheck
```

Expected: Zero errors. Fix any issues found (likely type mismatches between Supabase row types and our `ClassPipelineItem`).

### Step 2: Search for any remaining references to old pipeline patterns

```bash
grep -r "PIPELINE_STAGES\|TrialPipelineCard\|MissionControlSidebar" apps/myk9show/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "node_modules"
```

`PIPELINE_STAGES` and `TrialPipelineCard` are still used by `TrialPipelineDetail.tsx` (the detail page at `/secretary/pipeline/:trialId`). That's fine — we're not touching the detail page in this PR.

### Step 3: Run dev server and verify visually

```bash
pnpm dev:show
```

Navigate to `/secretary/dashboard`. Verify:
- Show selector appears with all shows
- Trial selector appears with trials for selected show
- Stat chips display on both rows
- Classes render in correct pipeline columns
- Clicking a class card navigates to the secretary class dashboard
- No horizontal scroll on 1440px+ viewports
- Left sidebar navigation still works

### Step 4: Final commit if any fixes needed

```bash
git add -A
git commit -m "fix(pipeline): address typecheck issues from Mission Control rewrite"
```

---

## Notes

### What's preserved (not deleted)
- `TrialPipelineDetail.tsx` — Still used for `/secretary/pipeline/:trialId` checklist workflow
- `TrialPipelineCard.tsx` — Still used by TrialPipelineDetail
- `StatisticsCards.tsx` — May be used by other pages
- `useSecretaryDashboardData.ts` — May be used by other pages
- Old pipeline types (`PipelineStage`, `TrialPipelineData`) — Still used by detail page
- `constants.ts` (STAGE_META, CANNED_CHECKLIST) — Still used by detail page

### Future enhancements (not in this PR)
- **Armband number preview** on class cards (needs entry-level query)
- **Qualified %** stat (needs entry scoring data)
- **Drag-and-drop** to move classes between columns
- **Supabase Realtime** subscription for live class status updates
- **Show-level stats aggregation** across all trials (currently only shows selected trial's data)
