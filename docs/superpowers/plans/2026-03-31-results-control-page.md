# Results Control Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone secretary page for controlling result visibility, self check-in, and releasing results — with bulk class operations.

**Architecture:** Refactor the existing 488-line `ResultsVisibilitySection` into focused sub-components (`PresetSelector`, `TrialOverrides`, `ClassOverrides`), add new `BulkOperationsBar` and `useReleaseResults` hook, compose everything in a new `ResultsControlPage`. Reuse existing `SelfCheckinSection` as-is. All data flows through existing React Query hooks (`useShowSettings`, `useTrialOverrides`, `useClassOverrides`) and mutation hooks (`useUpdateShowVisibility`, `useUpdateTrialOverride`, `useUpdateClassOverride`, `useResetOverride`).

**Tech Stack:** React, TypeScript, React Query, Zustand stores, shadcn/ui components, Vitest, `@myk9/secretary` shared package

**Spec:** `docs/superpowers/specs/2026-03-31-results-control-page-design.md`

---

## File Structure

### New files (in `apps/myk9show/src/`)

| File                                                        | Responsibility                                    |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `pages/secretary/ResultsControlPage/index.tsx`              | Page component: data fetching, composition        |
| `pages/secretary/ResultsControlPage/PresetSelector.tsx`     | 3 preset cards + advanced per-field accordion     |
| `pages/secretary/ResultsControlPage/TrialOverrides.tsx`     | Per-trial preset dropdowns + reset                |
| `pages/secretary/ResultsControlPage/ClassOverrides.tsx`     | Per-class dropdowns grouped by trial + checkboxes |
| `pages/secretary/ResultsControlPage/BulkOperationsBar.tsx`  | Sticky bottom bar with bulk actions               |
| `pages/secretary/ResultsControlPage/resultsControlUtils.ts` | Shared helpers, types, constants                  |
| `hooks/mutations/useReleaseResults.ts`                      | React Query mutation for releasing results        |
| `hooks/useBulkClassOperations.ts`                           | Selection state + batch mutation orchestration    |
| `pages/secretary/__tests__/ResultsControlPage.test.tsx`     | Integration test for the full page                |
| `pages/secretary/__tests__/PresetSelector.test.tsx`         | Unit tests for PresetSelector                     |
| `pages/secretary/__tests__/ClassOverrides.test.tsx`         | Unit tests for ClassOverrides with checkboxes     |
| `pages/secretary/__tests__/BulkOperationsBar.test.tsx`      | Unit tests for BulkOperationsBar                  |
| `pages/secretary/__tests__/useBulkClassOperations.test.ts`  | Hook test for bulk operations                     |
| `pages/secretary/__tests__/useReleaseResults.test.ts`       | Hook test for release results mutation            |

### Modified files

| File                                         | Change                                                       |
| -------------------------------------------- | ------------------------------------------------------------ |
| `routes/secretaryRoutes.tsx`                 | Add `/secretary/results-control` route                       |
| `routes/routeRegistry.ts`                    | Add route preloading entry (medium priority)                 |
| `pages/secretary/ShowSettingsPage/index.tsx` | Replace full sections with summary + link to Results Control |

### Moved files (re-exported from old path)

| File                                                      | Change                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx` | Move to `ResultsControlPage/SelfCheckinSection.tsx`, re-export from old path |

---

## Task 1: Extract shared utils from ResultsVisibilitySection

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/resultsControlUtils.ts`

- [ ] **Step 1: Create the utils file with extracted helpers**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/resultsControlUtils.ts
/**
 * Shared helpers for Results Control sub-components.
 */

import { type ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, Clock, Lock } from 'lucide-react';
import { PRESET_CONFIGS, type VisibilityPreset, type VisibilityTiming } from '@myk9/secretary';
import { TIMING_LABELS } from '@/components/secretary/settingsConstants';
import type { VisibilityOverride } from '@myk9/secretary';

export const PRESET_ICONS: Record<VisibilityPreset, ReactNode> = {
  open: <Zap className="h-5 w-5 text-green-500" />,
  standard: <Clock className="h-5 w-5 text-blue-500" />,
  review: <Lock className="h-5 w-5 text-orange-500" />,
};

export const ALL_TIMINGS: VisibilityTiming[] = ['immediate', 'class_complete', 'manual_release'];
export const PLACEMENT_TIMINGS: VisibilityTiming[] = ['class_complete', 'manual_release'];

export interface FieldTimings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}

export function fieldTimingsFromVisibility(visibility: {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}): FieldTimings {
  return {
    placement: visibility.placement,
    qualification: visibility.qualification,
    time: visibility.time,
    faults: visibility.faults,
  };
}

/** Detect which preset (if any) matches the given field timings */
export function detectPreset(timings: FieldTimings): VisibilityPreset | null {
  for (const [name, cfg] of Object.entries(PRESET_CONFIGS)) {
    if (
      cfg.placement === timings.placement &&
      cfg.qualification === timings.qualification &&
      cfg.time === timings.time &&
      cfg.faults === timings.faults
    ) {
      return name as VisibilityPreset;
    }
  }
  return null;
}

/** Check if an override has any visibility field set (non-null) */
export function hasVisibilityOverride(ov: VisibilityOverride): boolean {
  return (
    ov.preset !== undefined ||
    ov.placement !== undefined ||
    ov.qualification !== undefined ||
    ov.time !== undefined ||
    ov.faults !== undefined
  );
}

interface TimingSelectProps {
  value: VisibilityTiming;
  timings: VisibilityTiming[];
  onChange: (value: VisibilityTiming) => void;
  disabled?: boolean;
}

export function TimingSelect({ value, timings, onChange, disabled = false }: TimingSelectProps) {
  return (
    <Select value={value} onValueChange={v => onChange(v as VisibilityTiming)} disabled={disabled}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {timings.map(t => (
          <SelectItem key={t} value={t}>
            {TIMING_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (no errors related to new file)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/resultsControlUtils.ts
git commit -m "refactor: extract results control shared utils"
```

---

## Task 2: Extract PresetSelector component

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/PresetSelector.tsx`
- Create: `apps/myk9show/src/pages/secretary/__tests__/PresetSelector.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/PresetSelector.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PresetSelector } from '../ResultsControlPage/PresetSelector';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

// Mock mutation hooks
const mockMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const defaultSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    inheritedFrom: 'show',
    preset: 'standard',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

function renderPresetSelector(props?: Partial<{ showId: string; settings: ShowSettings }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PresetSelector
        showId={props?.showId ?? 'show-1'}
        settings={props?.settings ?? defaultSettings}
      />
    </QueryClientProvider>
  );
}

describe('PresetSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three preset cards', () => {
    renderPresetSelector();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('highlights the active preset', () => {
    renderPresetSelector();
    // Standard preset should have the ring class
    const standardCard = screen.getByText('After Class').closest('[class*="card"]');
    expect(standardCard?.className).toContain('ring-2');
  });

  it('calls mutation when clicking a preset', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    await user.click(screen.getByText('Immediately'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', preset: 'open' }),
      expect.any(Object)
    );
  });

  it('shows advanced accordion when toggled', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/PresetSelector.test.tsx`
Expected: FAIL — `PresetSelector` module not found

- [ ] **Step 3: Write PresetSelector component**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/PresetSelector.tsx
/**
 * PresetSelector — 3 clickable preset cards + advanced per-field timing accordion.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import { useUpdateShowVisibility } from '@/hooks/mutations/useShowSettingsMutations';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import {
  PRESET_ICONS,
  ALL_TIMINGS,
  PLACEMENT_TIMINGS,
  TimingSelect,
  detectPreset,
  fieldTimingsFromVisibility,
  type FieldTimings,
} from './resultsControlUtils';

interface PresetSelectorProps {
  showId: string;
  settings: ShowSettings;
}

export function PresetSelector({ showId, settings }: PresetSelectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const updateVisibility = useUpdateShowVisibility();

  const serverTimingsKey = useMemo(
    () =>
      `${settings.visibility.placement}|${settings.visibility.qualification}|${settings.visibility.time}|${settings.visibility.faults}`,
    [
      settings.visibility.placement,
      settings.visibility.qualification,
      settings.visibility.time,
      settings.visibility.faults,
    ]
  );

  const [customTimings, setCustomTimings] = useState<FieldTimings>(() =>
    fieldTimingsFromVisibility(settings.visibility)
  );

  const [prevKey, setPrevKey] = useState(serverTimingsKey);
  if (serverTimingsKey !== prevKey) {
    setPrevKey(serverTimingsKey);
    setCustomTimings(fieldTimingsFromVisibility(settings.visibility));
  }

  function applyPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateVisibility.mutate(
      {
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success(`Applied "${PRESET_INFO[preset].title}" preset`),
        onError: () => toast.error('Failed to update visibility settings'),
      }
    );
    setCustomTimings(cfg);
  }

  function applyCustomTimings() {
    const matched = detectPreset(customTimings);
    updateVisibility.mutate(
      {
        showId,
        preset: matched ?? 'standard',
        placementTiming: customTimings.placement,
        qualificationTiming: customTimings.qualification,
        timeTiming: customTimings.time,
        faultsTiming: customTimings.faults,
      },
      {
        onSuccess: () => toast.success('Visibility settings saved'),
        onError: () => toast.error('Failed to update visibility settings'),
      }
    );
  }

  const activePreset = detectPreset(fieldTimingsFromVisibility(settings.visibility));

  return (
    <div className="space-y-4">
      {/* Preset cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(preset => {
          const info = PRESET_INFO[preset];
          const isActive = activePreset === preset;
          return (
            <Card
              key={preset}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
              onClick={() => applyPreset(preset)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {PRESET_ICONS[preset]}
                  <CardTitle className="text-base">{info.title}</CardTitle>
                </div>
                <CardDescription className="text-xs">{info.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{info.details}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Advanced accordion */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
            Advanced
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Card>
            <CardContent className="pt-4 space-y-4">
              {(
                [
                  { field: 'placement', label: 'Placement', timings: PLACEMENT_TIMINGS },
                  { field: 'qualification', label: 'Qualification', timings: ALL_TIMINGS },
                  { field: 'time', label: 'Time', timings: ALL_TIMINGS },
                  { field: 'faults', label: 'Faults', timings: ALL_TIMINGS },
                ] as const
              ).map(({ field, label, timings }) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <TimingSelect
                    value={customTimings[field]}
                    timings={timings}
                    onChange={v => setCustomTimings(prev => ({ ...prev, [field]: v }))}
                  />
                </div>
              ))}
              <Button size="sm" onClick={applyCustomTimings} disabled={updateVisibility.isPending}>
                Save Custom Timings
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/PresetSelector.test.tsx`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/PresetSelector.tsx apps/myk9show/src/pages/secretary/__tests__/PresetSelector.test.tsx
git commit -m "feat: add PresetSelector component with tests"
```

---

## Task 3: Extract TrialOverrides component

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/TrialOverrides.tsx`

- [ ] **Step 1: Create TrialOverrides component**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/TrialOverrides.tsx
/**
 * TrialOverrides — per-trial preset dropdown + reset buttons.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import {
  useUpdateTrialOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type { TrialOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import { hasVisibilityOverride } from './resultsControlUtils';

interface TrialOverridesProps {
  showId: string;
  trials: SyncableTrial[];
  trialOverrides: TrialOverrideEntry[];
}

export function TrialOverrides({ showId, trials, trialOverrides }: TrialOverridesProps) {
  const updateTrialOverride = useUpdateTrialOverride();
  const resetOverride = useResetOverride();

  if (trials.length === 0) return null;

  function handleTrialPreset(trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateTrialOverride.mutate(
      {
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Trial override saved'),
        onError: () => toast.error('Failed to save trial override'),
      }
    );
  }

  function handleResetTrial(trialId: string) {
    resetOverride.mutate(
      { entityId: trialId, showId, level: 'trial' },
      {
        onSuccess: () => toast.success('Trial reset to show defaults'),
        onError: () => toast.error('Failed to reset trial override'),
      }
    );
  }

  return (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Trial Overrides</h3>
      {trials.map(trial => {
        const override = trialOverrides.find(o => o.trialId === trial.id);
        const hasOverride = override && hasVisibilityOverride(override.override);
        const currentPreset = override?.override.preset ?? null;

        return (
          <div
            key={trial.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{trial.name}</p>
              <p className="text-xs text-muted-foreground">
                {hasOverride
                  ? `Override: ${currentPreset ?? 'custom'}`
                  : 'Inheriting from show'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={currentPreset ?? ''}
                onValueChange={v => handleTrialPreset(trial.id, v as VisibilityPreset)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Inherit" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(p => (
                    <SelectItem key={p} value={p}>
                      {PRESET_INFO[p].title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasOverride && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reset to show defaults"
                  onClick={() => handleResetTrial(trial.id)}
                  disabled={resetOverride.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/TrialOverrides.tsx
git commit -m "feat: add TrialOverrides component"
```

---

## Task 4: Extract ClassOverrides component with checkboxes

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/ClassOverrides.tsx`
- Create: `apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClassOverrides } from '../ResultsControlPage/ClassOverrides';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import type { ClassOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';

// Mock mutations
const mockClassMutate = vi.fn();
const mockResetMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const trials: SyncableTrial[] = [
  { id: 'trial-1', name: 'Trial A', showId: 'show-1', _version: 1, _lastModified: new Date(), _lastModifiedBy: '', _syncStatus: 'synced' } as SyncableTrial,
];

const classes: SyncableClassData[] = [
  { id: 'class-1', trialId: 'trial-1', element: 'Standard', level: 'Novice' } as SyncableClassData,
  { id: 'class-2', trialId: 'trial-1', element: 'Standard', level: 'Open' } as SyncableClassData,
];

function renderClassOverrides(overrides?: {
  selectedClasses?: Set<string>;
  onToggleClass?: (id: string) => void;
  onToggleAllInTrial?: (trialId: string, classIds: string[]) => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const selectedClasses = overrides?.selectedClasses ?? new Set<string>();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClassOverrides
        showId="show-1"
        trials={trials}
        classes={classes}
        classOverrides={[]}
        trialOverrides={[]}
        selectedClasses={selectedClasses}
        onToggleClass={overrides?.onToggleClass ?? vi.fn()}
        onToggleAllInTrial={overrides?.onToggleAllInTrial ?? vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('ClassOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders class names grouped by trial', async () => {
    const user = userEvent.setup();
    renderClassOverrides();
    // Expand the trial collapsible
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    expect(screen.getByText(/novice/i)).toBeInTheDocument();
    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });

  it('calls onToggleClass when checkbox is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderClassOverrides({ onToggleClass: onToggle });
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]); // first class checkbox (index 0 is select-all)
    expect(onToggle).toHaveBeenCalledWith('class-1');
  });

  it('calls onToggleAllInTrial when select-all checkbox is clicked', async () => {
    const onToggleAll = vi.fn();
    const user = userEvent.setup();
    renderClassOverrides({ onToggleAllInTrial: onToggleAll });
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]); // select-all checkbox
    expect(onToggleAll).toHaveBeenCalledWith('trial-1', ['class-1', 'class-2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassOverrides.test.tsx`
Expected: FAIL — `ClassOverrides` module not found

- [ ] **Step 3: Write ClassOverrides component**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/ClassOverrides.tsx
/**
 * ClassOverrides — per-class preset dropdowns grouped by trial, with checkboxes for bulk selection.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import {
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type {
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import { getClassName } from '@/components/classes/types/classTypes';
import { hasVisibilityOverride } from './resultsControlUtils';

interface ClassOverridesProps {
  showId: string;
  trials: SyncableTrial[];
  classes: SyncableClassData[];
  classOverrides: ClassOverrideEntry[];
  trialOverrides: TrialOverrideEntry[];
  selectedClasses: Set<string>;
  onToggleClass: (classId: string) => void;
  onToggleAllInTrial: (trialId: string, classIds: string[]) => void;
}

export function ClassOverrides({
  showId,
  trials,
  classes,
  classOverrides,
  trialOverrides,
  selectedClasses,
  onToggleClass,
  onToggleAllInTrial,
}: ClassOverridesProps) {
  const updateClassOverride = useUpdateClassOverride();
  const resetOverride = useResetOverride();

  if (classes.length === 0) return null;

  function handleClassPreset(classId: string, trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateClassOverride.mutate(
      {
        classId,
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Class override saved'),
        onError: () => toast.error('Failed to save class override'),
      }
    );
  }

  function handleResetClass(classId: string) {
    resetOverride.mutate(
      { entityId: classId, showId, level: 'class' },
      {
        onSuccess: () => toast.success('Class reset to inherited settings'),
        onError: () => toast.error('Failed to reset class override'),
      }
    );
  }

  return (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Class Overrides</h3>
      {trials.map(trial => {
        const trialClasses = classes.filter(c => c.trialId === trial.id);
        if (trialClasses.length === 0) return null;

        const trialHasOverride = trialOverrides.some(o => o.trialId === trial.id);
        const overrideCount = trialClasses.filter(c =>
          classOverrides.some(o => o.classId === c.id && hasVisibilityOverride(o.override))
        ).length;
        const trialClassIds = trialClasses.map(c => c.id);
        const allSelected = trialClassIds.every(id => selectedClasses.has(id));

        return (
          <Collapsible key={trial.id}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex w-full items-center justify-between px-3 py-2"
              >
                <span className="text-sm font-medium">{trial.name}</span>
                <span className="text-xs text-muted-foreground">
                  {trialClasses.length} classes
                  {overrideCount > 0 && ` · ${overrideCount} overridden`}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pl-3 pt-1">
              {/* Select all for trial */}
              <div className="flex items-center gap-2 px-3 py-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleAllInTrial(trial.id, trialClassIds)}
                  aria-label={`Select all classes in ${trial.name}`}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {trialClasses.map(cls => {
                const override = classOverrides.find(o => o.classId === cls.id);
                const hasOverride = override && hasVisibilityOverride(override.override);
                const currentPreset = override?.override.preset ?? null;

                return (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedClasses.has(cls.id)}
                        onCheckedChange={() => onToggleClass(cls.id)}
                        aria-label={`Select ${getClassName(cls)}`}
                      />
                      <div>
                        <p className="text-sm font-medium">{getClassName(cls)}</p>
                        <p className="text-xs text-muted-foreground">
                          {hasOverride
                            ? `Override: ${currentPreset ?? 'custom'}`
                            : trialHasOverride
                              ? 'Inheriting from trial'
                              : 'Inheriting from show'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentPreset ?? ''}
                        onValueChange={v =>
                          handleClassPreset(cls.id, trial.id, v as VisibilityPreset)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Inherit" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(p => (
                            <SelectItem key={p} value={p}>
                              {PRESET_INFO[p].title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {hasOverride && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reset to inherited settings"
                          onClick={() => handleResetClass(cls.id)}
                          disabled={resetOverride.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassOverrides.test.tsx`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/ClassOverrides.tsx apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx
git commit -m "feat: add ClassOverrides component with checkboxes and tests"
```

---

## Task 5: Create useBulkClassOperations hook

**Files:**

- Create: `apps/myk9show/src/hooks/useBulkClassOperations.ts`
- Create: `apps/myk9show/src/pages/secretary/__tests__/useBulkClassOperations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/useBulkClassOperations.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkClassOperations } from '@/hooks/useBulkClassOperations';

describe('useBulkClassOperations', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    expect(result.current.selectedClasses.size).toBe(0);
  });

  it('toggles a class selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.toggleClass('class-1'));
    expect(result.current.selectedClasses.has('class-1')).toBe(true);
    act(() => result.current.toggleClass('class-1'));
    expect(result.current.selectedClasses.has('class-1')).toBe(false);
  });

  it('toggles all classes in a trial', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.toggleAllInTrial('trial-1', ['class-1', 'class-2', 'class-3']));
    expect(result.current.selectedClasses.size).toBe(3);
    // Toggle again deselects all
    act(() => result.current.toggleAllInTrial('trial-1', ['class-1', 'class-2', 'class-3']));
    expect(result.current.selectedClasses.size).toBe(0);
  });

  it('selects all provided class IDs', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.selectAll(['class-1', 'class-2']));
    expect(result.current.selectedClasses.size).toBe(2);
  });

  it('clears selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.selectAll(['class-1', 'class-2']));
    act(() => result.current.clearSelection());
    expect(result.current.selectedClasses.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/useBulkClassOperations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```typescript
// apps/myk9show/src/hooks/useBulkClassOperations.ts
/**
 * useBulkClassOperations — manages class selection state for bulk operations.
 */

import { useState, useCallback } from 'react';

export function useBulkClassOperations() {
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());

  const toggleClass = useCallback((classId: string) => {
    setSelectedClasses(prev => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  }, []);

  const toggleAllInTrial = useCallback((_trialId: string, classIds: string[]) => {
    setSelectedClasses(prev => {
      const allSelected = classIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        classIds.forEach(id => next.delete(id));
      } else {
        classIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((classIds: string[]) => {
    setSelectedClasses(new Set(classIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClasses(new Set());
  }, []);

  return {
    selectedClasses,
    toggleClass,
    toggleAllInTrial,
    selectAll,
    clearSelection,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/useBulkClassOperations.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useBulkClassOperations.ts apps/myk9show/src/pages/secretary/__tests__/useBulkClassOperations.test.ts
git commit -m "feat: add useBulkClassOperations hook with tests"
```

---

## Task 6: Create useReleaseResults mutation hook

**Files:**

- Create: `apps/myk9show/src/hooks/mutations/useReleaseResults.ts`
- Create: `apps/myk9show/src/pages/secretary/__tests__/useReleaseResults.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/useReleaseResults.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

// Mock supabase
const mockUpdate = vi.fn();
const mockIn = vi.fn(() => ({ data: null, error: null }));
mockUpdate.mockReturnValue({ in: mockIn });

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({ update: mockUpdate }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useReleaseResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ in: mockIn });
    mockIn.mockResolvedValue({ data: null, error: null });
  });

  it('updates classes table with results_released_at', async () => {
    const { result } = renderHook(() => useReleaseResults(), { wrapper: createWrapper() });

    result.current.mutate({ classIds: ['class-1', 'class-2'], showId: 'show-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ results_released_at: expect.any(String) })
    );
    expect(mockIn).toHaveBeenCalledWith('id', ['class-1', 'class-2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/useReleaseResults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```typescript
// apps/myk9show/src/hooks/mutations/useReleaseResults.ts
/**
 * useReleaseResults — mutation to set results_released_at on classes.
 * Used for manual release when classes are set to review/manual_release timing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { toast } from 'sonner';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';

interface ReleaseResultsInput {
  classIds: string[];
  showId: string;
}

export function useReleaseResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ classIds }: ReleaseResultsInput) => {
      const { error } = await supabase
        .from('classes')
        .update({ results_released_at: new Date().toISOString() })
        .in('id', classIds);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(
        `Results released for ${variables.classIds.length} class${variables.classIds.length === 1 ? '' : 'es'}`
      );
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverrides(variables.showId),
      });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
    onError: () => {
      toast.error('Failed to release results');
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/useReleaseResults.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/useReleaseResults.ts apps/myk9show/src/pages/secretary/__tests__/useReleaseResults.test.ts
git commit -m "feat: add useReleaseResults mutation hook with tests"
```

---

## Task 7: Create BulkOperationsBar component

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/BulkOperationsBar.tsx`
- Create: `apps/myk9show/src/pages/secretary/__tests__/BulkOperationsBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/BulkOperationsBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkOperationsBar } from '../ResultsControlPage/BulkOperationsBar';

// Mock mutations
const mockClassMutate = vi.fn();
const mockReleaseMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
}));
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: mockReleaseMutate, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

function renderBar(selectedCount: number, options?: { hasManualReleaseClasses?: boolean }) {
  const selectedClasses = new Set(
    Array.from({ length: selectedCount }, (_, i) => `class-${i + 1}`)
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const clearSelection = vi.fn();
  return {
    clearSelection,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BulkOperationsBar
          showId="show-1"
          selectedClasses={selectedClasses}
          allClassIds={['class-1', 'class-2', 'class-3']}
          onSelectAll={vi.fn()}
          onClearSelection={clearSelection}
          hasManualReleaseClasses={options?.hasManualReleaseClasses ?? false}
        />
      </QueryClientProvider>
    ),
  };
}

describe('BulkOperationsBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render when no classes are selected', () => {
    renderBar(0);
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('shows selection count', () => {
    renderBar(2);
    expect(screen.getByText(/2 classes selected/i)).toBeInTheDocument();
  });

  it('disables Release Results when no manual_release classes', () => {
    renderBar(2, { hasManualReleaseClasses: false });
    expect(screen.getByRole('button', { name: /release results/i })).toBeDisabled();
  });

  it('enables Release Results when manual_release classes exist', () => {
    renderBar(2, { hasManualReleaseClasses: true });
    expect(screen.getByRole('button', { name: /release results/i })).toBeEnabled();
  });

  it('calls clearSelection when Clear is clicked', async () => {
    const { clearSelection } = renderBar(2);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearSelection).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/BulkOperationsBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write BulkOperationsBar component**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/BulkOperationsBar.tsx
/**
 * BulkOperationsBar — sticky bottom bar with bulk actions for selected classes.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import { useUpdateClassOverride } from '@/hooks/mutations/useShowSettingsMutations';
import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';

interface BulkOperationsBarProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  hasManualReleaseClasses: boolean;
}

export function BulkOperationsBar({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
  hasManualReleaseClasses,
}: BulkOperationsBarProps) {
  const updateClassOverride = useUpdateClassOverride();
  const releaseResults = useReleaseResults();

  if (selectedClasses.size === 0) return null;

  function handleBulkPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    const classIds = Array.from(selectedClasses);
    const promises = classIds.map(classId =>
      new Promise<void>((resolve, reject) => {
        updateClassOverride.mutate(
          {
            classId,
            trialId: '', // trial ID not needed for cache invalidation at show level
            showId,
            preset,
            placementTiming: cfg.placement,
            qualificationTiming: cfg.qualification,
            timeTiming: cfg.time,
            faultsTiming: cfg.faults,
          },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          }
        );
      })
    );
    Promise.all(promises)
      .then(() => {
        toast.success(`Applied "${PRESET_INFO[preset].title}" to ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`);
        onClearSelection();
      })
      .catch(() => toast.error('Failed to apply preset to some classes'));
  }

  function handleBulkCheckin(enabled: boolean) {
    const classIds = Array.from(selectedClasses);
    const promises = classIds.map(classId =>
      new Promise<void>((resolve, reject) => {
        updateClassOverride.mutate(
          {
            classId,
            trialId: '',
            showId,
            selfCheckinEnabled: enabled,
          },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          }
        );
      })
    );
    Promise.all(promises)
      .then(() => {
        toast.success(`Self check-in ${enabled ? 'enabled' : 'disabled'} for ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`);
        onClearSelection();
      })
      .catch(() => toast.error('Failed to update check-in for some classes'));
  }

  function handleReleaseResults() {
    const classIds = Array.from(selectedClasses);
    releaseResults.mutate(
      { classIds, showId },
      { onSuccess: () => onClearSelection() }
    );
  }

  const count = selectedClasses.size;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {count} class{count === 1 ? '' : 'es'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            Select All ({allClassIds.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={v => handleBulkPreset(v as VisibilityPreset)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Apply Preset" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(p => (
                <SelectItem key={p} value={p}>
                  {PRESET_INFO[p].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkCheckin(true)}
          >
            Enable Check-in
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkCheckin(false)}
          >
            Disable Check-in
          </Button>
          <Button
            size="sm"
            onClick={handleReleaseResults}
            disabled={!hasManualReleaseClasses || releaseResults.isPending}
          >
            Release Results
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/BulkOperationsBar.test.tsx`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/BulkOperationsBar.tsx apps/myk9show/src/pages/secretary/__tests__/BulkOperationsBar.test.tsx
git commit -m "feat: add BulkOperationsBar with preset, check-in, and release actions"
```

---

## Task 8: Move SelfCheckinSection to ResultsControlPage directory

**Files:**

- Move: `apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx` → `apps/myk9show/src/pages/secretary/ResultsControlPage/SelfCheckinSection.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx` (update import)

- [ ] **Step 1: Copy file to new location**

```bash
cp apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx apps/myk9show/src/pages/secretary/ResultsControlPage/SelfCheckinSection.tsx
```

- [ ] **Step 2: Replace old file with re-export**

Replace the contents of `apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx` with:

```typescript
// Re-export from new location for backwards compatibility
export { SelfCheckinSection } from '../ResultsControlPage/SelfCheckinSection';
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS — imports resolve through re-export

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/SelfCheckinSection.tsx apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx
git commit -m "refactor: move SelfCheckinSection to ResultsControlPage directory"
```

---

## Task 9: Create ResultsControlPage and wire route

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`

- [ ] **Step 1: Create the page component**

```typescript
// apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx
/**
 * Results Control Page
 *
 * Standalone secretary page for managing result visibility,
 * self check-in, and releasing results with bulk operations.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, UserCheck, Settings } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import {
  useShowSettings,
  useTrialOverrides,
  useClassOverrides,
} from '@/hooks/queries/useShowSettingsDatabase';
import { useBulkClassOperations } from '@/hooks/useBulkClassOperations';
import { PresetSelector } from './PresetSelector';
import { TrialOverrides } from './TrialOverrides';
import { ClassOverrides } from './ClassOverrides';
import { BulkOperationsBar } from './BulkOperationsBar';
import { SelfCheckinSection } from './SelfCheckinSection';

export default function ResultsControlPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const { classes } = useClassStore();
  const bulkOps = useBulkClassOperations();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = trials.filter(t => t.showId === selectedShowId);
  const showClasses = classes.filter(c => showTrials.some(t => t.id === c.trialId));
  const allClassIds = showClasses.map(c => c.id);

  const { data: settings, isLoading: settingsLoading } = useShowSettings(selectedShowId || null);
  const { data: trialOverrides = [], isLoading: overridesLoading } = useTrialOverrides(
    selectedShowId || null
  );
  const { data: classOverrides = [], isLoading: classOverridesLoading } = useClassOverrides(
    selectedShowId || null
  );

  const isLoading = settingsLoading || overridesLoading || classOverridesLoading;

  // Check if any selected class has manual_release timing (for Release Results button)
  const hasManualReleaseClasses = Array.from(bulkOps.selectedClasses).some(classId => {
    const override = classOverrides.find(o => o.classId === classId);
    const trialId = showClasses.find(c => c.id === classId)?.trialId;
    const trialOverride = trialId ? trialOverrides.find(o => o.trialId === trialId) : undefined;

    // Check class override first, then trial, then show
    const preset =
      override?.override.preset ??
      trialOverride?.override.preset ??
      settings?.visibility.preset;

    return preset === 'review';
  });

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to manage results.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-8 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Results Control</h1>
        {selectedShow && <p className="text-muted-foreground">{selectedShow.name}</p>}
      </div>

      {/* Results Visibility */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Results Visibility</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !settings ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <PresetSelector showId={selectedShowId} settings={settings} />
              <TrialOverrides
                showId={selectedShowId}
                trials={showTrials}
                trialOverrides={trialOverrides}
              />
              <ClassOverrides
                showId={selectedShowId}
                trials={showTrials}
                classes={showClasses}
                classOverrides={classOverrides}
                trialOverrides={trialOverrides}
                selectedClasses={bulkOps.selectedClasses}
                onToggleClass={bulkOps.toggleClass}
                onToggleAllInTrial={bulkOps.toggleAllInTrial}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Self Check-In */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Self Check-In</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !settings ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <SelfCheckinSection
              showId={selectedShowId}
              settings={settings}
              trialOverrides={trialOverrides}
              classOverrides={classOverrides}
              trials={showTrials}
              classes={showClasses}
            />
          )}
        </CardContent>
      </Card>

      {/* Bulk Operations Bar */}
      <BulkOperationsBar
        showId={selectedShowId}
        selectedClasses={bulkOps.selectedClasses}
        allClassIds={allClassIds}
        onSelectAll={() => bulkOps.selectAll(allClassIds)}
        onClearSelection={bulkOps.clearSelection}
        hasManualReleaseClasses={hasManualReleaseClasses}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add route to secretaryRoutes.tsx**

In `apps/myk9show/src/routes/secretaryRoutes.tsx`, add after the existing lazy imports (around line 54):

```typescript
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
```

Add the route element after the `/secretary/settings` route (around line 224):

```tsx
<Route
  path="/secretary/results-control"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <SuspenseWrapper>
        <PageTransition>
          <ResultsControlPage />
        </PageTransition>
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx apps/myk9show/src/routes/secretaryRoutes.tsx
git commit -m "feat: add ResultsControlPage with route"
```

---

## Task 10: Update ShowSettingsPage to link to Results Control

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`

- [ ] **Step 1: Replace ShowSettingsPage with summary + links**

Replace the full contents of `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`:

```typescript
// apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx
/**
 * Show Settings Page
 *
 * Summary page with links to detailed settings pages.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, UserCheck, Settings, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { PRESET_INFO, type VisibilityPreset } from '@myk9/secretary';

export default function ShowSettingsPage() {
  const { selectedShowId, shows } = useShowStore();
  const navigate = useNavigate();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const { data: settings, isLoading } = useShowSettings(selectedShowId || null);

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to configure its settings.</p>
        </div>
      </div>
    );
  }

  const presetName = settings?.visibility.preset as VisibilityPreset | undefined;
  const presetLabel = presetName ? PRESET_INFO[presetName]?.title : 'Custom';

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Show Settings</h1>
        {selectedShow && <p className="text-muted-foreground">{selectedShow.name}</p>}
      </div>

      {/* Results Visibility Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Results Visibility</CardTitle>
                <CardDescription>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32" />
                  ) : (
                    `Current preset: ${presetLabel}`
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/secretary/results-control')}
            >
              Manage <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Self Check-In Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Self Check-In</CardTitle>
                <CardDescription>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32" />
                  ) : (
                    settings?.selfCheckinEnabled ? 'Enabled' : 'Disabled'
                  )}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/secretary/results-control')}
            >
              Manage <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Update ShowSettingsPage test**

The existing test at `apps/myk9show/src/pages/secretary/__tests__/ShowSettingsPage.test.tsx` mocks the old sections. Update it to test the new summary + link behavior. Replace the test assertions that reference `ResultsVisibilitySection` and `SelfCheckinSection` with:

```typescript
it('shows summary cards with links to Results Control', async () => {
  mockUseShowSettings.mockReturnValue({
    data: {
      visibility: { placement: 'class_complete', qualification: 'immediate', time: 'class_complete', faults: 'class_complete', inheritedFrom: 'show', preset: 'standard' },
      selfCheckinEnabled: true,
      hasExplicitSettings: true,
    },
    isLoading: false,
  });
  mockUseTrialOverrides.mockReturnValue({ data: [], isLoading: false });

  render(<ShowSettingsPage />, { wrapper });
  expect(screen.getByText(/after class/i)).toBeInTheDocument();
  expect(screen.getByText(/enabled/i)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /manage/i })).toHaveLength(2);
});
```

- [ ] **Step 4: Run tests**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ShowSettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx apps/myk9show/src/pages/secretary/__tests__/ShowSettingsPage.test.tsx
git commit -m "refactor: simplify ShowSettingsPage to summary with link to Results Control"
```

---

## Task 11: Integration test for ResultsControlPage

**Files:**

- Create: `apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx`

- [ ] **Step 1: Write the integration test**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

// --- Store mocks ---
const mockSelectedShowId = { value: 'show-1' };
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: mockSelectedShowId.value,
    shows: [{ id: 'show-1', name: 'Spring Agility Trial' }],
  }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    trials: [
      { id: 'trial-1', name: 'Trial A', showId: 'show-1', _version: 1, _lastModified: new Date(), _lastModifiedBy: '', _syncStatus: 'synced' },
    ],
  }),
}));

vi.mock('@/store/classStore', () => ({
  useClassStore: () => ({
    classes: [
      { id: 'class-1', trialId: 'trial-1', element: 'Standard', level: 'Novice', _version: 1, _lastModified: new Date(), _lastModifiedBy: '', _syncStatus: 'synced' },
      { id: 'class-2', trialId: 'trial-1', element: 'Standard', level: 'Open', _version: 1, _lastModified: new Date(), _lastModifiedBy: '', _syncStatus: 'synced' },
    ],
  }),
}));

// --- Query mocks ---
const defaultSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    inheritedFrom: 'show',
    preset: 'standard',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({ data: defaultSettings, isLoading: false }),
  useTrialOverrides: () => ({ data: [], isLoading: false }),
  useClassOverrides: () => ({ data: [], isLoading: false }),
  settingsQueryKeys: {
    all: ['showSettings'],
    show: (id: string) => ['showSettings', 'show', id],
    trials: (id: string) => ['showSettings', 'trials', id],
    classOverrides: (id: string) => ['showSettings', 'classOverrides', id],
    classOverride: (id: string) => ['showSettings', 'class', id],
    trialOverride: (id: string) => ['showSettings', 'trial', id],
  },
}));

// --- Mutation mocks ---
const mockVisibilityMutate = vi.fn();
const mockTrialMutate = vi.fn();
const mockClassMutate = vi.fn();
const mockResetMutate = vi.fn();
const mockCheckinMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate: mockVisibilityMutate, isPending: false }),
  useUpdateTrialOverride: () => ({ mutate: mockTrialMutate, isPending: false }),
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useResetOverride: () => ({ mutate: mockResetMutate, isPending: false }),
  useUpdateShowCheckin: () => ({ mutate: mockCheckinMutate, isPending: false }),
}));

vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import ResultsControlPage from '../ResultsControlPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResultsControlPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ResultsControlPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders page title and show name', () => {
    renderPage();
    expect(screen.getByText('Results Control')).toBeInTheDocument();
    expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
  });

  it('renders all three preset cards', () => {
    renderPage();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('renders self check-in section', () => {
    renderPage();
    expect(screen.getByText('Self Check-In')).toBeInTheDocument();
  });

  it('clicking a preset calls the visibility mutation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Immediately'));
    expect(mockVisibilityMutate).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'open' }),
      expect.any(Object)
    );
  });

  it('shows no-show state when no show selected', () => {
    mockSelectedShowId.value = '';
    renderPage();
    expect(screen.getByText(/select a show/i)).toBeInTheDocument();
    mockSelectedShowId.value = 'show-1'; // reset
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ResultsControlPage.test.tsx`
Expected: PASS — all 5 tests

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/__tests__/ResultsControlPage.test.tsx
git commit -m "test: add ResultsControlPage integration tests"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run all new tests together**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/PresetSelector.test.tsx src/pages/secretary/__tests__/ClassOverrides.test.tsx src/pages/secretary/__tests__/BulkOperationsBar.test.tsx src/pages/secretary/__tests__/useBulkClassOperations.test.ts src/pages/secretary/__tests__/useReleaseResults.test.ts src/pages/secretary/__tests__/ResultsControlPage.test.tsx src/pages/secretary/__tests__/ShowSettingsPage.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Run lint**

Run: `cd apps/myk9show && pnpm lint`
Expected: PASS — no new lint errors

- [ ] **Step 4: Verify no stale imports from old ResultsVisibilitySection**

Search for any remaining direct imports of the old file (the file still exists since other code may reference it, but nothing in the new page should import it):

Run: `grep -r "from.*ShowSettingsPage/ResultsVisibilitySection" apps/myk9show/src/pages/secretary/ResultsControlPage/`
Expected: No matches

- [ ] **Step 5: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass (existing + new). If tests hang beyond 30 seconds, stop and report.

- [ ] **Step 6: Commit any remaining fixes, then final commit**

```bash
git add -A
git commit -m "feat: results control page — complete implementation"
```
