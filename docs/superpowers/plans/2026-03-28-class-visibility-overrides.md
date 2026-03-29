# Class-Level Visibility Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-class visibility and self check-in overrides to the Show Settings page, grouped by trial under the existing trial overrides.

**Architecture:** New `useClassOverrides(showId)` query hook fetches all class overrides for a show. `ResultsVisibilitySection` and `SelfCheckinSection` each get a "Class Overrides" collapsible section below trial overrides, with classes grouped by trial. All mutations and cascade logic already exist.

**Tech Stack:** React, React Query, Zustand (classStore), shadcn/ui (Collapsible, Select, Switch, Button), `@myk9/secretary` visibility types, Supabase.

**Spec:** `docs/superpowers/specs/2026-03-28-class-visibility-overrides-design.md`

---

## File Structure

| File                                                                              | Action | Responsibility                                                                                |
| --------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts`                      | Modify | Add `ClassOverrideEntry` type, `useClassOverrides` hook, `classOverrides` query key           |
| `apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts`                   | Modify | Add class overrides query key invalidation to `useUpdateClassOverride` and `useResetOverride` |
| `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`                    | Modify | Fetch class overrides, pass to children alongside class data                                  |
| `apps/myk9show/src/pages/secretary/ShowSettingsPage/ResultsVisibilitySection.tsx` | Modify | Add Class Overrides collapsible section grouped by trial                                      |
| `apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx`       | Modify | Add Class Overrides collapsible section grouped by trial                                      |
| `apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx`             | Create | Tests for class override UI in both sections                                                  |

---

### Task 1: Add `useClassOverrides` Query Hook

**Files:**

- Modify: `apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts`

- [ ] **Step 1: Add `ClassOverrideEntry` interface and `classOverrides` query key**

In `useShowSettingsDatabase.ts`, add to the `settingsQueryKeys` factory:

```typescript
classOverrides: (showId: string) => [...settingsQueryKeys.all, 'classOverrides', showId] as const,
```

Add the interface after `TrialOverrideEntry`:

```typescript
/** All class overrides for a show (for the settings page list) */
export interface ClassOverrideEntry {
  classId: string;
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}
```

- [ ] **Step 2: Add `fetchClassOverrides` function and `useClassOverrides` hook**

Add after `useTrialOverrides`:

```typescript
async function fetchClassOverrides(showId: string): Promise<ClassOverrideEntry[]> {
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id')
    .eq('show_id', showId);

  if (trialsError) throw trialsError;
  if (!trials?.length) return [];

  const trialIds = trials.map(t => t.id);

  // Get all classes for these trials
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, trial_id')
    .in('trial_id', trialIds);

  if (classesError) throw classesError;
  if (!classes?.length) return [];

  const classIds = classes.map(c => c.id);
  const { data: overrides, error } = await untypedSupabase
    .from('class_visibility_overrides')
    .select('*')
    .in('class_id', classIds);

  if (error) throw error;
  if (!overrides) return [];

  // Build a classId→trialId lookup from the classes query
  const classTrialMap = new Map(classes.map(c => [c.id, c.trial_id]));

  return (overrides as OverrideRow[]).map(row => ({
    classId: row.class_id!,
    trialId: classTrialMap.get(row.class_id!) ?? '',
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useClassOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.classOverrides(showId!),
    queryFn: () => fetchClassOverrides(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts
git commit -m "feat: add useClassOverrides query hook for class-level visibility"
```

---

### Task 2: Fix Cache Invalidation for Class Overrides

**Files:**

- Modify: `apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts`

- [ ] **Step 1: Update `useUpdateClassOverride` to invalidate `classOverrides` query**

In the `onSuccess` callback of `useUpdateClassOverride`, add invalidation for the new class overrides query key:

```typescript
onSuccess: (_, variables) => {
  queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.classOverride(variables.classId),
  });
  queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
  queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.classOverrides(variables.showId),
  });
},
```

- [ ] **Step 2: Update `useResetOverride` to invalidate `classOverrides` query**

In the `onSuccess` callback of `useResetOverride`, add:

```typescript
onSuccess: (_, variables) => {
  queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
  queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.trialOverride(variables.entityId),
  });
  queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.classOverride(variables.entityId),
  });
  queryClient.invalidateQueries({
    queryKey: settingsQueryKeys.classOverrides(variables.showId),
  });
},
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts
git commit -m "fix: invalidate classOverrides query on class override mutations"
```

---

### Task 3: Wire Class Data into ShowSettingsPage

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx`

- [ ] **Step 1: Import `useClassOverrides` and `useClassStore`**

Add imports:

```typescript
import {
  useShowSettings,
  useTrialOverrides,
  useClassOverrides,
} from '@/hooks/queries/useShowSettingsDatabase';
import { useClassStore } from '@/store/classStore';
```

Remove the single-import line for `useShowSettings, useTrialOverrides` that already exists.

- [ ] **Step 2: Fetch class overrides and class data, pass to children**

Inside `ShowSettingsPage`, after the existing `useTrialOverrides` call, add:

```typescript
const { data: classOverrides = [], isLoading: classOverridesLoading } = useClassOverrides(
  selectedShowId || null
);
const { classes } = useClassStore();
const showClasses = classes.filter(c => showTrials.some(t => t.id === c.trialId));
```

Update `isLoading`:

```typescript
const isLoading = settingsLoading || overridesLoading || classOverridesLoading;
```

Pass new props to both `ResultsVisibilitySection` and `SelfCheckinSection`:

```tsx
<ResultsVisibilitySection
  showId={selectedShowId}
  settings={settings}
  trialOverrides={trialOverrides}
  classOverrides={classOverrides}
  trials={showTrials}
  classes={showClasses}
/>
```

```tsx
<SelfCheckinSection
  showId={selectedShowId}
  settings={settings}
  trialOverrides={trialOverrides}
  classOverrides={classOverrides}
  trials={showTrials}
  classes={showClasses}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: Errors in `ResultsVisibilitySection` and `SelfCheckinSection` about missing props (expected — will fix in Tasks 4 & 5).

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage/index.tsx
git commit -m "feat: wire class overrides and class data into ShowSettingsPage"
```

---

### Task 4: Add Class Overrides to ResultsVisibilitySection

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/ResultsVisibilitySection.tsx`

- [ ] **Step 1: Update imports and props interface**

Add imports:

```typescript
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
```

Note: `Collapsible` is already imported. Add `ChevronRight` to the lucide imports (alongside existing `ChevronDown`):

```typescript
import { Zap, Clock, Lock, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
```

Add to imports:

```typescript
import type { ClassOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableClassData } from '@/store/classStore';
import {
  useUpdateClassOverride,
  useResetOverride as useResetClassOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
```

Wait — `useResetOverride` is already imported. We just need `useUpdateClassOverride`. Update the existing import:

```typescript
import {
  useUpdateShowVisibility,
  useUpdateTrialOverride,
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
```

Update the props interface:

```typescript
interface ResultsVisibilitySectionProps {
  showId: string;
  settings: ShowSettings;
  trialOverrides: TrialOverrideEntry[];
  classOverrides: ClassOverrideEntry[];
  trials: SyncableTrial[];
  classes: SyncableClassData[];
}
```

Update the destructured props:

```typescript
export function ResultsVisibilitySection({
  showId,
  settings,
  trialOverrides,
  classOverrides,
  trials,
  classes,
}: ResultsVisibilitySectionProps) {
```

- [ ] **Step 2: Add class override handlers**

After the existing `handleResetTrial` function, add:

```typescript
const updateClassOverride = useUpdateClassOverride();

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
```

- [ ] **Step 3: Add class name helper**

Add a helper function inside the component (or above it):

```typescript
function getClassName(cls: SyncableClassData): string {
  const parts = [cls.element, cls.level, cls.section].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : cls.className || 'Unnamed Class';
}
```

- [ ] **Step 4: Add Class Overrides UI after Trial Overrides**

After the trial overrides `</div>` block (the one with `{trials.length > 0 && (...)}`) and before the closing `</div>` of the component's return, add:

```tsx
{
  /* Class overrides */
}
{
  classes.length > 0 && (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Class Overrides</h3>
      {trials.map(trial => {
        const trialClasses = classes.filter(c => c.trialId === trial.id);
        if (trialClasses.length === 0) return null;

        const overrideCount = trialClasses.filter(c =>
          classOverrides.some(o => {
            if (o.classId !== c.id) return false;
            const ov = o.override;
            return (
              ov.preset !== undefined ||
              ov.placement !== undefined ||
              ov.qualification !== undefined ||
              ov.time !== undefined ||
              ov.faults !== undefined
            );
          })
        ).length;

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
              {trialClasses.map(cls => {
                const override = classOverrides.find(o => o.classId === cls.id);
                const hasOverride =
                  override &&
                  (override.override.preset !== undefined ||
                    override.override.placement !== undefined ||
                    override.override.qualification !== undefined ||
                    override.override.time !== undefined ||
                    override.override.faults !== undefined);

                const currentPreset = override?.override.preset ?? null;
                const trialHasOverride = trialOverrides.some(o => o.trialId === trial.id);

                return (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
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

- [ ] **Step 5: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: Errors only in `SelfCheckinSection` (missing new props — will fix in Task 5).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage/ResultsVisibilitySection.tsx
git commit -m "feat: add class-level visibility overrides UI to ResultsVisibilitySection"
```

---

### Task 5: Add Class Overrides to SelfCheckinSection

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx`

- [ ] **Step 1: Update imports and props interface**

Add imports:

```typescript
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ClassOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableClassData } from '@/store/classStore';
import { useUpdateClassOverride } from '@/hooks/mutations/useShowSettingsMutations';
```

Update the props interface:

```typescript
interface SelfCheckinSectionProps {
  showId: string;
  settings: ShowSettings;
  trialOverrides: TrialOverrideEntry[];
  classOverrides: ClassOverrideEntry[];
  trials: SyncableTrial[];
  classes: SyncableClassData[];
}
```

Update the destructured props:

```typescript
export function SelfCheckinSection({
  showId,
  settings,
  trialOverrides,
  classOverrides,
  trials,
  classes,
}: SelfCheckinSectionProps) {
```

- [ ] **Step 2: Add class override handlers**

After `handleResetTrial`, add:

```typescript
const updateClassOverride = useUpdateClassOverride();

function handleClassCheckinToggle(classId: string, trialId: string, enabled: boolean) {
  updateClassOverride.mutate(
    { classId, trialId, showId, selfCheckinEnabled: enabled },
    {
      onSuccess: () => toast.success('Class check-in override saved'),
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
```

- [ ] **Step 3: Add class name helper**

Add the same helper as in Task 4:

```typescript
function getClassName(cls: SyncableClassData): string {
  const parts = [cls.element, cls.level, cls.section].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : cls.className || 'Unnamed Class';
}
```

- [ ] **Step 4: Add Class Overrides UI after Trial Overrides**

After the trial overrides `</div>` block and before the closing `</div>` of the return, add:

```tsx
{
  /* Class overrides */
}
{
  classes.length > 0 && (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Class Overrides</h3>
      {trials.map(trial => {
        const trialClasses = classes.filter(c => c.trialId === trial.id);
        if (trialClasses.length === 0) return null;

        const overrideCount = trialClasses.filter(c =>
          classOverrides.some(o => o.classId === c.id && o.selfCheckinEnabled !== null)
        ).length;

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
              {trialClasses.map(cls => {
                const override = classOverrides.find(o => o.classId === cls.id);
                const hasOverride = override && override.selfCheckinEnabled !== null;

                // Resolve effective value: class ?? trial ?? show
                const trialOverride = trialOverrides.find(o => o.trialId === trial.id);
                const trialCheckin = trialOverride?.selfCheckinEnabled ?? null;
                const effective =
                  override?.selfCheckinEnabled ?? trialCheckin ?? settings.selfCheckinEnabled;

                const trialHasOverride = trialCheckin !== null;

                return (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{getClassName(cls)}</p>
                      <p className="text-xs text-muted-foreground">
                        {hasOverride
                          ? 'Override active'
                          : trialHasOverride
                            ? 'Inheriting from trial'
                            : 'Inheriting from show'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={effective}
                        onCheckedChange={v => handleClassCheckinToggle(cls.id, trial.id, v)}
                        disabled={updateClassOverride.isPending}
                      />
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

- [ ] **Step 5: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage/SelfCheckinSection.tsx
git commit -m "feat: add class-level check-in overrides UI to SelfCheckinSection"
```

---

### Task 6: Write Tests

**Files:**

- Create: `apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx`

- [ ] **Step 1: Write test file**

```typescript
import { screen, within } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ShowSettings, TrialOverrideEntry, ClassOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';

// Mock mutations
const mockUpdateClassOverride = { mutate: vi.fn(), isPending: false };
const mockResetOverride = { mutate: vi.fn(), isPending: false };
const mockUpdateShowVisibility = { mutate: vi.fn(), isPending: false };
const mockUpdateTrialOverride = { mutate: vi.fn(), isPending: false };
const mockUpdateShowCheckin = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => mockUpdateShowVisibility,
  useUpdateTrialOverride: () => mockUpdateTrialOverride,
  useUpdateClassOverride: () => mockUpdateClassOverride,
  useResetOverride: () => mockResetOverride,
  useUpdateShowCheckin: () => mockUpdateShowCheckin,
}));

// Test fixtures
const mockSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    preset: 'standard',
    inheritedFrom: 'show',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

const mockTrials: SyncableTrial[] = [
  {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Saturday Trial 1',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableTrial,
];

const mockClasses: SyncableClassData[] = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    trial: 'Saturday Trial 1',
    trialDate: '2026-05-09',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'Judge Smith',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableClassData,
  {
    id: 'class-2',
    trialId: 'trial-1',
    trial: 'Saturday Trial 1',
    trialDate: '2026-05-09',
    trialNumber: '1',
    classOrder: '2',
    status: 'Scheduled',
    judge: 'Judge Smith',
    element: 'Interior',
    level: 'Advanced',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableClassData,
];

const emptyTrialOverrides: TrialOverrideEntry[] = [];
const emptyClassOverrides: ClassOverrideEntry[] = [];

const classOverrideWithPreset: ClassOverrideEntry[] = [
  {
    classId: 'class-1',
    trialId: 'trial-1',
    override: { preset: 'open' },
    selfCheckinEnabled: null,
  },
];

const classOverrideWithCheckin: ClassOverrideEntry[] = [
  {
    classId: 'class-1',
    trialId: 'trial-1',
    override: {},
    selfCheckinEnabled: false,
  },
];

describe('ResultsVisibilitySection — Class Overrides', () => {
  let ResultsVisibilitySection: typeof import('../ShowSettingsPage/ResultsVisibilitySection').ResultsVisibilitySection;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ShowSettingsPage/ResultsVisibilitySection');
    ResultsVisibilitySection = mod.ResultsVisibilitySection;
  });

  it('renders class overrides section with trial grouping', () => {
    render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('2 classes')).toBeInTheDocument();
  });

  it('shows class names from element/level/section', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    // Expand the trial collapsible
    await user.click(screen.getByText('Saturday Trial 1'));

    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
  });

  it('shows override indicator when class has visibility override', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText(/1 overridden/)).toBeInTheDocument();

    await user.click(screen.getByText('Saturday Trial 1'));

    expect(screen.getByText('Override: open')).toBeInTheDocument();
    expect(screen.getByText('Inheriting from show')).toBeInTheDocument();
  });

  it('calls useUpdateClassOverride when preset is selected', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByText('Saturday Trial 1'));

    // Find the first class's select trigger and click it
    const classRow = screen.getByText('Container Novice A').closest('[class*="rounded-md"]')!;
    const selectTrigger = within(classRow).getByRole('combobox');
    await user.click(selectTrigger);

    // Select "Open" preset
    await user.click(screen.getByText('Open'));

    expect(mockUpdateClassOverride.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        trialId: 'trial-1',
        showId: 'show-1',
        preset: 'open',
      }),
      expect.any(Object)
    );
  });

  it('shows reset button only for overridden classes', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByText('Saturday Trial 1'));

    // Only class-1 has override, so only 1 reset button should exist in class section
    const resetButtons = screen.getAllByTitle('Reset to inherited settings');
    expect(resetButtons.length).toBe(1);
  });

  it('calls resetOverride with level class on reset click', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByText('Saturday Trial 1'));

    const resetButton = screen.getByTitle('Reset to inherited settings');
    await user.click(resetButton);

    expect(mockResetOverride.mutate).toHaveBeenCalledWith(
      { entityId: 'class-1', showId: 'show-1', level: 'class' },
      expect.any(Object)
    );
  });
});

describe('SelfCheckinSection — Class Overrides', () => {
  let SelfCheckinSection: typeof import('../ShowSettingsPage/SelfCheckinSection').SelfCheckinSection;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ShowSettingsPage/SelfCheckinSection');
    SelfCheckinSection = mod.SelfCheckinSection;
  });

  it('renders class check-in overrides grouped by trial', () => {
    render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
  });

  it('shows override indicator for class with check-in override', async () => {
    const { user } = render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithCheckin}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText(/1 overridden/)).toBeInTheDocument();

    await user.click(screen.getByText('Saturday Trial 1'));

    expect(screen.getByText('Override active')).toBeInTheDocument();
  });

  it('calls useUpdateClassOverride on check-in toggle', async () => {
    const { user } = render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByText('Saturday Trial 1'));

    // Toggle the first class's switch (currently inheriting show=true, so toggling to false)
    const classRow = screen.getByText('Container Novice A').closest('[class*="rounded-md"]')!;
    const switchEl = within(classRow).getByRole('switch');
    await user.click(switchEl);

    expect(mockUpdateClassOverride.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        trialId: 'trial-1',
        showId: 'show-1',
        selfCheckinEnabled: false,
      }),
      expect.any(Object)
    );
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ClassOverrides.test.tsx`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/secretary/__tests__/ClassOverrides.test.tsx
git commit -m "test: add class-level override tests for visibility and check-in sections"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `cd apps/myk9show && npx eslint src/pages/secretary/ShowSettingsPage/ src/hooks/queries/useShowSettingsDatabase.ts src/hooks/mutations/useShowSettingsMutations.ts --ext .ts,.tsx`
Expected: No errors.

- [ ] **Step 3: Run all settings-related tests**

Run: `cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/`
Expected: All tests pass (both existing ShowSettingsPage tests and new ClassOverrides tests).

- [ ] **Step 4: Manual smoke test**

1. Run `pnpm dev:show`
2. Navigate to `/secretary/settings`
3. Verify "Class Overrides" section appears below Trial Overrides in both Results Visibility and Self Check-In cards
4. Expand a trial to see its classes listed
5. Select a preset for a class — verify toast and "Override" label appears
6. Click reset — verify it returns to "Inheriting from show/trial"
7. Toggle a class's self check-in — verify it saves

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any issues found during final verification"
```
