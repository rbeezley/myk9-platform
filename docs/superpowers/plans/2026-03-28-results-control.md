# Results Control & Self Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give secretaries cascading control over result visibility and self check-in settings, managed from Mission Control.

**Architecture:** Three DB tables (show/trial/class) store nullable overrides. The `@myk9/secretary` package already provides the cascade resolver, presets, and type system — we build the DB schema, React Query hooks, Mission Control settings panel, and enforcement at display points.

**Tech Stack:** Supabase migrations, React Query mutations, `@myk9/secretary` visibility cascade, shadcn/ui, SlideOverPanel, Tailwind.

---

## File Structure

### New Files

| File                                                                                  | Responsibility                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `supabase/migrations/093_result_visibility_tables.sql`                                | DB schema: 3 tables, CHECK constraints, RLS policies          |
| `apps/myk9show/src/hooks/queries/useVisibilitySettings.ts`                            | React Query hook to fetch all 3 tables for a show             |
| `apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts`                         | Mutations for show/trial/class visibility + self check-in     |
| `apps/myk9show/src/hooks/useVisibleResultFields.ts`                                   | Consumer hook: resolves cascade + computes per-field booleans |
| `apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx`                | SlideOverPanel with visibility + self check-in sections       |
| `apps/myk9show/src/features/pipeline/components/PresetSelector.tsx`                   | Reusable 3-card preset picker (open/standard/review)          |
| `apps/myk9show/src/features/pipeline/components/OverrideList.tsx`                     | Trial/class override list with inherited/custom badges        |
| `apps/myk9show/src/features/pipeline/components/__tests__/ShowSettingsPanel.test.tsx` | Component tests for settings panel                            |
| `apps/myk9show/src/hooks/__tests__/useVisibleResultFields.test.ts`                    | Hook tests for visibility resolution                          |

### Modified Files

| File                                                                           | Change                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`         | Add settings button + ShowSettingsPanel       |
| `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`             | Apply field visibility to non-staff users     |
| `apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx` | Hide when qualification not visible           |
| `apps/myk9show/src/components/common/StatusPickerDialog.tsx`                   | Disable for exhibitors when self check-in off |
| `apps/myk9show/src/components/results/ShowResultsTab.tsx`                      | Filter visible fields on public results       |
| `apps/myk9show/src/types/supabase.ts`                                          | Regenerated types (after migration)           |

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/093_result_visibility_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 093: Result visibility cascade tables + self check-in

-- =============================================================================
-- ENUMS (as CHECK constraints, not pg enums — easier to extend)
-- =============================================================================

-- =============================================================================
-- SHOW-LEVEL DEFAULTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS show_result_visibility_defaults (
  show_id UUID PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  preset_name TEXT NOT NULL DEFAULT 'open'
    CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- TRIAL-LEVEL OVERRIDES (nullable = inherit from show)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trial_result_visibility_overrides (
  trial_id UUID PRIMARY KEY REFERENCES trials(id) ON DELETE CASCADE,
  preset_name TEXT CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- CLASS-LEVEL OVERRIDES (nullable = inherit from trial → show)
-- =============================================================================
CREATE TABLE IF NOT EXISTS class_result_visibility_overrides (
  class_id UUID PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  preset_name TEXT CHECK (preset_name IN ('open', 'standard', 'review')),
  placement_timing TEXT CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE show_result_visibility_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_result_visibility_defaults FORCE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_result_visibility_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_result_visibility_overrides FORCE ROW LEVEL SECURITY;

-- SELECT: all authenticated users (exhibitors need to read settings)
CREATE POLICY "visibility_show_select" ON show_result_visibility_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "visibility_trial_select" ON trial_result_visibility_overrides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "visibility_class_select" ON class_result_visibility_overrides
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: staff only (secretary, judge, site_admin)
CREATE POLICY "visibility_show_modify" ON show_result_visibility_defaults
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );

CREATE POLICY "visibility_trial_modify" ON trial_result_visibility_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );

CREATE POLICY "visibility_class_modify" ON class_result_visibility_overrides
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND r.name IN ('site_admin', 'secretary', 'judge')
    )
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `cd supabase && supabase db push`
Expected: Migration applies without errors.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `cd supabase && supabase gen types typescript --local > ../apps/myk9show/src/types/supabase.ts`
Expected: New table types appear in the generated file.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/093_result_visibility_tables.sql apps/myk9show/src/types/supabase.ts
git commit -m "feat: add result visibility cascade tables (migration 093)"
```

---

## Task 2: React Query Hooks — Fetch & Mutate Visibility Settings

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useVisibilitySettings.ts`
- Create: `apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts`

- [ ] **Step 1: Create the fetch hook**

```typescript
// apps/myk9show/src/hooks/queries/useVisibilitySettings.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { cacheStrategies } from '@/lib/queryClient';
import type { VisibilityOverride, VisibilitySettings } from '@myk9/secretary';
import { PRESET_CONFIGS } from '@myk9/secretary';

export interface ShowVisibilityRow {
  show_id: string;
  preset_name: string;
  placement_timing: string;
  qualification_timing: string;
  time_timing: string;
  faults_timing: string;
  self_checkin_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface OverrideRow {
  trial_id?: string;
  class_id?: string;
  preset_name: string | null;
  placement_timing: string | null;
  qualification_timing: string | null;
  time_timing: string | null;
  faults_timing: string | null;
  self_checkin_enabled: boolean | null;
}

export interface VisibilityData {
  showDefaults: ShowVisibilityRow | null;
  trialOverrides: OverrideRow[];
  classOverrides: OverrideRow[];
}

export const visibilityKeys = {
  all: ['visibility'] as const,
  show: (showId: string) => ['visibility', 'show', showId] as const,
};

async function fetchVisibilitySettings(showId: string): Promise<VisibilityData> {
  const [showResult, trialResult, classResult] = await Promise.all([
    supabase
      .from('show_result_visibility_defaults')
      .select('*')
      .eq('show_id', showId)
      .maybeSingle(),
    supabase
      .from('trial_result_visibility_overrides')
      .select('*, trials!inner(show_id)')
      .eq('trials.show_id', showId),
    supabase
      .from('class_result_visibility_overrides')
      .select('*, classes!inner(trial_id, trials!inner(show_id))')
      .eq('classes.trials.show_id', showId),
  ]);

  if (showResult.error) throw showResult.error;
  if (trialResult.error) throw trialResult.error;
  if (classResult.error) throw classResult.error;

  return {
    showDefaults: showResult.data as ShowVisibilityRow | null,
    trialOverrides: (trialResult.data ?? []) as OverrideRow[],
    classOverrides: (classResult.data ?? []) as OverrideRow[],
  };
}

/** Default show settings when no row exists (preset: open) */
export function getDefaultShowSettings(): VisibilitySettings & { selfCheckinEnabled: boolean } {
  return {
    ...PRESET_CONFIGS.open,
    preset: 'open',
    inheritedFrom: 'show',
    selfCheckinEnabled: true,
  };
}

export function useVisibilitySettings(showId: string | undefined) {
  return useQuery({
    queryKey: visibilityKeys.show(showId ?? ''),
    queryFn: () => fetchVisibilitySettings(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
```

- [ ] **Step 2: Create the mutations hook**

```typescript
// apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { visibilityKeys } from '@/hooks/queries/useVisibilitySettings';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';

interface ShowVisibilityInput {
  showId: string;
  presetName: VisibilityPreset;
  placementTiming: VisibilityTiming;
  qualificationTiming: VisibilityTiming;
  timeTiming: VisibilityTiming;
  faultsTiming: VisibilityTiming;
  selfCheckinEnabled: boolean;
}

interface TrialVisibilityInput {
  trialId: string;
  showId: string;
  presetName?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

interface ClassVisibilityInput {
  classIds: string[];
  showId: string;
  presetName?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ShowVisibilityInput) => {
      const { error } = await supabase.from('show_result_visibility_defaults').upsert({
        show_id: input.showId,
        preset_name: input.presetName,
        placement_timing: input.placementTiming,
        qualification_timing: input.qualificationTiming,
        time_timing: input.timeTiming,
        faults_timing: input.faultsTiming,
        self_checkin_enabled: input.selfCheckinEnabled,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
    },
  });
}

export function useUpdateTrialVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: TrialVisibilityInput) => {
      // If all fields are null, delete the override row (reset to show default)
      const allNull =
        input.presetName == null &&
        input.placementTiming == null &&
        input.qualificationTiming == null &&
        input.timeTiming == null &&
        input.faultsTiming == null &&
        input.selfCheckinEnabled == null;

      if (allNull) {
        const { error } = await supabase
          .from('trial_result_visibility_overrides')
          .delete()
          .eq('trial_id', input.trialId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trial_result_visibility_overrides').upsert({
          trial_id: input.trialId,
          preset_name: input.presetName ?? null,
          placement_timing: input.placementTiming ?? null,
          qualification_timing: input.qualificationTiming ?? null,
          time_timing: input.timeTiming ?? null,
          faults_timing: input.faultsTiming ?? null,
          self_checkin_enabled: input.selfCheckinEnabled ?? null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
    },
  });
}

export function useUpdateClassVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ClassVisibilityInput) => {
      const allNull =
        input.presetName == null &&
        input.placementTiming == null &&
        input.qualificationTiming == null &&
        input.timeTiming == null &&
        input.faultsTiming == null &&
        input.selfCheckinEnabled == null;

      if (allNull) {
        const { error } = await supabase
          .from('class_result_visibility_overrides')
          .delete()
          .in('class_id', input.classIds);
        if (error) throw error;
      } else {
        const rows = input.classIds.map(classId => ({
          class_id: classId,
          preset_name: input.presetName ?? null,
          placement_timing: input.placementTiming ?? null,
          qualification_timing: input.qualificationTiming ?? null,
          time_timing: input.timeTiming ?? null,
          faults_timing: input.faultsTiming ?? null,
          self_checkin_enabled: input.selfCheckinEnabled ?? null,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        }));
        const { error } = await supabase.from('class_result_visibility_overrides').upsert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
    },
  });
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useVisibilitySettings.ts apps/myk9show/src/hooks/mutations/useVisibilityMutations.ts
git commit -m "feat: add visibility settings fetch and mutation hooks"
```

---

## Task 3: Consumer Hook — useVisibleResultFields

**Files:**

- Create: `apps/myk9show/src/hooks/useVisibleResultFields.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useVisibleResultFields.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/myk9show/src/hooks/__tests__/useVisibleResultFields.test.ts
import { resolveVisibilityCascade, getVisibleResultFields, PRESET_CONFIGS } from '@myk9/secretary';
import type { VisibilitySettings, ClassState, VisibilityUserRole } from '@myk9/secretary';

// Test the underlying pure functions (the hook is a thin wrapper)

describe('resolveVisibilityCascade', () => {
  const showDefaults: VisibilitySettings = {
    ...PRESET_CONFIGS.open,
    inheritedFrom: 'show',
    preset: 'open',
  };

  it('returns show defaults when no overrides', () => {
    const result = resolveVisibilityCascade(showDefaults);
    expect(result.qualification).toBe('immediate');
    expect(result.placement).toBe('class_complete');
  });

  it('applies trial override over show default', () => {
    const result = resolveVisibilityCascade(showDefaults, { preset: 'review' });
    expect(result.qualification).toBe('manual_release');
    expect(result.inheritedFrom).toBe('trial');
  });

  it('applies class override over trial override', () => {
    const result = resolveVisibilityCascade(showDefaults, { preset: 'review' }, { preset: 'open' });
    expect(result.qualification).toBe('immediate');
    expect(result.inheritedFrom).toBe('class');
  });

  it('per-field override wins over preset at same level', () => {
    const result = resolveVisibilityCascade(showDefaults, {
      preset: 'review',
      qualification: 'immediate',
    });
    expect(result.qualification).toBe('immediate');
    expect(result.time).toBe('manual_release');
  });

  it('null override fields inherit from parent', () => {
    const result = resolveVisibilityCascade(showDefaults, {
      qualification: 'class_complete',
    });
    expect(result.qualification).toBe('class_complete');
    expect(result.time).toBe('immediate'); // inherited from show (open preset)
  });
});

describe('getVisibleResultFields', () => {
  const reviewSettings: VisibilitySettings = {
    ...PRESET_CONFIGS.review,
    inheritedFrom: 'show',
    preset: 'review',
  };
  const openSettings: VisibilitySettings = {
    ...PRESET_CONFIGS.open,
    inheritedFrom: 'show',
    preset: 'open',
  };

  it('judges always see everything', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'judge');
    expect(result.showPlacement).toBe(true);
    expect(result.showQualification).toBe(true);
    expect(result.showTime).toBe(true);
    expect(result.showFaults).toBe(true);
  });

  it('admins always see everything', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'admin');
    expect(result).toEqual({
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    });
  });

  it('exhibitor sees nothing in review mode when in_progress', () => {
    const result = getVisibleResultFields(reviewSettings, 'in_progress', 'exhibitor');
    expect(result.showPlacement).toBe(false);
    expect(result.showQualification).toBe(false);
    expect(result.showTime).toBe(false);
    expect(result.showFaults).toBe(false);
  });

  it('exhibitor sees Q/NQ immediately in open mode', () => {
    const result = getVisibleResultFields(openSettings, 'in_progress', 'exhibitor');
    expect(result.showQualification).toBe(true);
    expect(result.showTime).toBe(true);
    expect(result.showFaults).toBe(true);
    expect(result.showPlacement).toBe(false); // class_complete, but still in_progress
  });

  it('exhibitor sees placement when class completed in open mode', () => {
    const result = getVisibleResultFields(openSettings, 'completed', 'exhibitor');
    expect(result.showPlacement).toBe(true);
  });

  it('exhibitor sees everything when class released in review mode', () => {
    const result = getVisibleResultFields(reviewSettings, 'released', 'exhibitor');
    expect(result).toEqual({
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useVisibleResultFields.test.ts`
Expected: All tests PASS (they test `@myk9/secretary` pure functions which are already implemented).

- [ ] **Step 3: Create the consumer hook**

```typescript
// apps/myk9show/src/hooks/useVisibleResultFields.ts
import { useMemo } from 'react';
import { resolveVisibilityCascade, getVisibleResultFields, PRESET_CONFIGS } from '@myk9/secretary';
import type {
  VisibilitySettings,
  VisibleResultFields,
  ClassState,
  VisibilityOverride,
  VisibilityUserRole,
} from '@myk9/secretary';
import {
  useVisibilitySettings,
  getDefaultShowSettings,
} from '@/hooks/queries/useVisibilitySettings';
import type { OverrideRow, ShowVisibilityRow } from '@/hooks/queries/useVisibilitySettings';
import { useAuthContext } from '@/hooks/useAuthContext';

function rowToSettings(
  row: ShowVisibilityRow
): VisibilitySettings & { selfCheckinEnabled: boolean } {
  return {
    placement: row.placement_timing as VisibilitySettings['placement'],
    qualification: row.qualification_timing as VisibilitySettings['qualification'],
    time: row.time_timing as VisibilitySettings['time'],
    faults: row.faults_timing as VisibilitySettings['faults'],
    preset: row.preset_name as VisibilitySettings['preset'],
    inheritedFrom: 'show',
    selfCheckinEnabled: row.self_checkin_enabled,
  };
}

function rowToOverride(
  row: OverrideRow
): VisibilityOverride & { selfCheckinEnabled?: boolean | null } {
  return {
    preset: row.preset_name as VisibilityOverride['preset'],
    placement: row.placement_timing as VisibilityOverride['placement'],
    qualification: row.qualification_timing as VisibilityOverride['qualification'],
    time: row.time_timing as VisibilityOverride['time'],
    faults: row.faults_timing as VisibilityOverride['faults'],
    selfCheckinEnabled: row.self_checkin_enabled,
  };
}

function mapUserRole(auth: {
  isAdmin: boolean;
  isSecretary: boolean;
  isJudge: boolean;
  isExhibitor: boolean;
}): VisibilityUserRole {
  if (auth.isAdmin) return 'admin';
  if (auth.isSecretary) return 'secretary';
  if (auth.isJudge) return 'judge';
  return 'exhibitor';
}

/**
 * Resolve effective visibility for a specific class.
 * Returns field visibility booleans + self check-in flag.
 */
export function useVisibleResultFields(
  showId: string | undefined,
  trialId: string | undefined,
  classId: string | undefined,
  classState: ClassState
): VisibleResultFields & { selfCheckinEnabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useVisibilitySettings(showId);
  const auth = useAuthContext();
  const userRole = mapUserRole(auth);

  return useMemo(() => {
    const allVisible = {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
      selfCheckinEnabled: true,
      isLoading,
    };

    if (!data || isLoading) return allVisible; // Default to visible while loading

    // Resolve show defaults
    const showSettings = data.showDefaults
      ? rowToSettings(data.showDefaults)
      : getDefaultShowSettings();

    // Find trial + class overrides
    const trialRow = trialId ? data.trialOverrides.find(r => r.trial_id === trialId) : undefined;
    const classRow = classId ? data.classOverrides.find(r => r.class_id === classId) : undefined;

    const trialOverride = trialRow ? rowToOverride(trialRow) : undefined;
    const classOverride = classRow ? rowToOverride(classRow) : undefined;

    // Cascade resolve
    const effective = resolveVisibilityCascade(showSettings, trialOverride, classOverride);

    // Resolve self check-in (same cascade: class → trial → show)
    const selfCheckinEnabled =
      classOverride?.selfCheckinEnabled ??
      trialOverride?.selfCheckinEnabled ??
      showSettings.selfCheckinEnabled;

    // Get per-field visibility
    const fields = getVisibleResultFields(effective, classState, userRole);

    return { ...fields, selfCheckinEnabled, isLoading };
  }, [data, isLoading, trialId, classId, classState, userRole]);
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useVisibleResultFields.ts apps/myk9show/src/hooks/__tests__/useVisibleResultFields.test.ts
git commit -m "feat: add useVisibleResultFields consumer hook with tests"
```

---

## Task 4: Show Settings Panel — PresetSelector Component

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/PresetSelector.tsx`

- [ ] **Step 1: Create the preset selector component**

```typescript
// apps/myk9show/src/features/pipeline/components/PresetSelector.tsx
import { cn } from '@/lib/utils';
import { Eye, Clock, ShieldCheck } from 'lucide-react';
import { PRESET_INFO } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';

const PRESET_ICONS: Record<VisibilityPreset, React.ElementType> = {
  open: Eye,
  standard: Clock,
  review: ShieldCheck,
};

interface PresetSelectorProps {
  value: VisibilityPreset;
  onChange: (preset: VisibilityPreset) => void;
  disabled?: boolean;
}

export function PresetSelector({ value, onChange, disabled }: PresetSelectorProps) {
  const presets: VisibilityPreset[] = ['open', 'standard', 'review'];

  return (
    <div className="grid grid-cols-3 gap-2">
      {presets.map(preset => {
        const info = PRESET_INFO[preset];
        const Icon = PRESET_ICONS[preset];
        const isActive = preset === value;

        return (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset)}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-colors',
              'hover:bg-accent/50',
              isActive
                ? 'ring-2 ring-primary border-primary bg-accent/30'
                : 'border-border',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <div
              className={cn(
                'size-9 rounded-full flex items-center justify-center',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              <Icon size={18} />
            </div>
            <div>
              <div className="font-semibold text-sm">{info.title}</div>
              <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                {info.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/PresetSelector.tsx
git commit -m "feat: add PresetSelector component for visibility presets"
```

---

## Task 5: Show Settings Panel — OverrideList Component

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/OverrideList.tsx`

- [ ] **Step 1: Create the override list component**

```typescript
// apps/myk9show/src/features/pipeline/components/OverrideList.tsx
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PRESET_INFO } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';

interface OverrideItem {
  id: string;
  label: string;
  presetOverride: VisibilityPreset | null;
  selfCheckinOverride: boolean | null;
}

interface OverrideListProps {
  items: OverrideItem[];
  onPresetChange: (id: string, preset: VisibilityPreset | null) => void;
  onSelfCheckinChange: (id: string, enabled: boolean | null) => void;
  showSelfCheckin?: boolean;
}

export function OverrideList({
  items,
  onPresetChange,
  onSelfCheckinChange,
  showSelfCheckin = false,
}: OverrideListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No items to configure.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const hasPresetOverride = item.presetOverride != null;
        const hasCheckinOverride = item.selfCheckinOverride != null;
        const hasAnyOverride = hasPresetOverride || hasCheckinOverride;

        return (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{item.label}</span>
                <Badge variant={hasAnyOverride ? 'default' : 'secondary'} className="text-xs">
                  {hasAnyOverride ? 'Custom' : 'Inherited'}
                </Badge>
              </div>
            </div>

            <Select
              value={item.presetOverride ?? 'inherit'}
              onValueChange={v => onPresetChange(item.id, v === 'inherit' ? null : (v as VisibilityPreset))}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Inherit</SelectItem>
                {(['open', 'standard', 'review'] as const).map(p => (
                  <SelectItem key={p} value={p}>
                    {PRESET_INFO[p].title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showSelfCheckin && (
              <Switch
                checked={item.selfCheckinOverride ?? false}
                onCheckedChange={checked =>
                  onSelfCheckinChange(item.id, item.selfCheckinOverride != null ? checked : null)
                }
              />
            )}

            {hasAnyOverride && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onPresetChange(item.id, null);
                  onSelfCheckinChange(item.id, null);
                }}
                title="Reset to inherited"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/OverrideList.tsx
git commit -m "feat: add OverrideList component for trial/class overrides"
```

---

## Task 6: Show Settings Panel — Main Panel

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx`
- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

- [ ] **Step 1: Create the settings panel**

```typescript
// apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx
import { useState } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRESET_CONFIGS } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';
import { PresetSelector } from './PresetSelector';
import { OverrideList } from './OverrideList';
import {
  useVisibilitySettings,
  getDefaultShowSettings,
} from '@/hooks/queries/useVisibilitySettings';
import {
  useUpdateShowVisibility,
  useUpdateTrialVisibility,
  useUpdateClassVisibility,
} from '@/hooks/mutations/useVisibilityMutations';
import { notifications } from '@/lib/notifications';

interface ShowSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  showId: string;
  trials: { id: string; name: string }[];
  classes: { id: string; trialId: string; name: string }[];
}

export function ShowSettingsPanel({
  open,
  onClose,
  showId,
  trials,
  classes,
}: ShowSettingsPanelProps) {
  const { data } = useVisibilitySettings(showId);
  const updateShow = useUpdateShowVisibility();
  const updateTrial = useUpdateTrialVisibility();
  const updateClass = useUpdateClassVisibility();

  const [trialSectionOpen, setTrialSectionOpen] = useState(false);
  const [classSectionOpen, setClassSectionOpen] = useState(false);

  const showDefaults = data?.showDefaults
    ? {
        preset: data.showDefaults.preset_name as VisibilityPreset,
        selfCheckinEnabled: data.showDefaults.self_checkin_enabled,
      }
    : { preset: 'open' as VisibilityPreset, selfCheckinEnabled: true };

  function handleShowPresetChange(preset: VisibilityPreset) {
    const config = PRESET_CONFIGS[preset];
    updateShow.mutate(
      {
        showId,
        presetName: preset,
        placementTiming: config.placement,
        qualificationTiming: config.qualification,
        timeTiming: config.time,
        faultsTiming: config.faults,
        selfCheckinEnabled: showDefaults.selfCheckinEnabled,
      },
      { onSuccess: () => notifications.success('Show visibility updated') }
    );
  }

  function handleShowCheckinToggle(enabled: boolean) {
    const config = PRESET_CONFIGS[showDefaults.preset];
    updateShow.mutate(
      {
        showId,
        presetName: showDefaults.preset,
        placementTiming: config.placement,
        qualificationTiming: config.qualification,
        timeTiming: config.time,
        faultsTiming: config.faults,
        selfCheckinEnabled: enabled,
      },
      { onSuccess: () => notifications.success(`Self check-in ${enabled ? 'enabled' : 'disabled'}`) }
    );
  }

  // Build trial override items
  const trialItems = trials.map(t => {
    const override = data?.trialOverrides.find(r => r.trial_id === t.id);
    return {
      id: t.id,
      label: t.name,
      presetOverride: (override?.preset_name as VisibilityPreset) ?? null,
      selfCheckinOverride: override?.self_checkin_enabled ?? null,
    };
  });

  // Build class override items
  const classItems = classes.map(c => {
    const override = data?.classOverrides.find(r => r.class_id === c.id);
    return {
      id: c.id,
      label: c.name,
      presetOverride: (override?.preset_name as VisibilityPreset) ?? null,
      selfCheckinOverride: override?.self_checkin_enabled ?? null,
    };
  });

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Show Settings" size="md">
      <div className="space-y-6 p-4">
        {/* Result Visibility Section */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Result Visibility</h3>
          <p className="text-xs text-muted-foreground">
            Controls when exhibitors can see each result field.
          </p>

          <PresetSelector
            value={showDefaults.preset}
            onChange={handleShowPresetChange}
            disabled={updateShow.isPending}
          />

          {/* Trial Overrides */}
          {trials.length > 0 && (
            <Collapsible open={trialSectionOpen} onOpenChange={setTrialSectionOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', trialSectionOpen && 'rotate-90')}
                />
                Trial Overrides
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <OverrideList
                  items={trialItems}
                  onPresetChange={(id, preset) =>
                    updateTrial.mutate({ trialId: id, showId, presetName: preset })
                  }
                  onSelfCheckinChange={(id, enabled) =>
                    updateTrial.mutate({ trialId: id, showId, selfCheckinEnabled: enabled })
                  }
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Class Overrides */}
          {classes.length > 0 && (
            <Collapsible open={classSectionOpen} onOpenChange={setClassSectionOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', classSectionOpen && 'rotate-90')}
                />
                Class Overrides
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <OverrideList
                  items={classItems}
                  onPresetChange={(id, preset) =>
                    updateClass.mutate({ classIds: [id], showId, presetName: preset })
                  }
                  onSelfCheckinChange={(id, enabled) =>
                    updateClass.mutate({ classIds: [id], showId, selfCheckinEnabled: enabled })
                  }
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>

        {/* Self Check-in Section */}
        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">Self Check-in</h3>
          <p className="text-xs text-muted-foreground">
            When enabled, exhibitors can update their own check-in status in the app.
            When disabled, only staff can manage check-in.
          </p>
          <div className="flex items-center gap-3">
            <Switch
              checked={showDefaults.selfCheckinEnabled}
              onCheckedChange={handleShowCheckinToggle}
              disabled={updateShow.isPending}
            />
            <Label className="text-sm">
              {showDefaults.selfCheckinEnabled ? 'Exhibitors can self check-in' : 'Staff-only check-in'}
            </Label>
          </div>
        </section>
      </div>
    </SlideOverPanel>
  );
}
```

- [ ] **Step 2: Add settings button to PipelineDashboard**

Modify `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`:

Add import:

```typescript
import { Settings } from 'lucide-react';
import { ShowSettingsPanel } from './ShowSettingsPanel';
```

Add state inside the component:

```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
```

Add state import:

```typescript
import React, { useMemo, useCallback, useState } from 'react';
```

Add settings button next to the header title (line ~134):

```typescript
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
    {selectedShow && (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setSettingsOpen(true)}
        title="Show Settings"
      >
        <Settings className="h-4 w-4" />
      </Button>
    )}
  </div>
  <div className="text-right">
```

Add panel at end of component (before closing `</div>`):

```typescript
{selectedShow && (
  <ShowSettingsPanel
    open={settingsOpen}
    onClose={() => setSettingsOpen(false)}
    showId={selectedShow.id}
    trials={trials.map(t => ({ id: t.id, name: t.name || `Trial ${t.trialNumber}` }))}
    classes={/* derive from classesByStage — flatten all stages */}
  />
)}
```

Note: The exact classes derivation depends on what `classesByStage` contains. Flatten all stage arrays and map to `{ id, trialId, name }`.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/ShowSettingsPanel.tsx apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx
git commit -m "feat: add Show Settings panel to Mission Control"
```

---

## Task 7: Enforce Visibility in ClassResultsTable

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`
- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/QualificationCell.tsx`

- [ ] **Step 1: Add visibility hook to ClassResultsTable**

In `index.tsx`, add import:

```typescript
import { useVisibleResultFields } from '@/hooks/useVisibleResultFields';
```

Add hook call (needs `showId` and `trialId` — check if available from props or derive from URL params):

```typescript
const visibility = useVisibleResultFields(showId, trialId, classId, classState);
```

Note: `showId` and `trialId` may need to be added to `ClassResultsTableProps` or derived from route params. `classState` should be derived from whether all entries are scored.

- [ ] **Step 2: Wrap field cells with visibility checks**

For each field column, wrap the cell content:

**Placement cell** — show `--` when `!visibility.showPlacement` and user is not staff:

```typescript
cell: ({ row }) => {
  const item = row.original;
  if (!isStaff && !visibility.showPlacement) {
    return <span className="text-sm text-muted-foreground italic">Pending</span>;
  }
  return item.placement ? (
    <Badge ...>{formatPlacement(item.placement)}</Badge>
  ) : (
    <span className="text-sm text-muted-foreground">--</span>
  );
},
```

**Qualification cell** — pass visibility flag as prop:

```typescript
<QualificationCell
  item={row.original}
  canEdit={canEdit}
  visible={isStaff || visibility.showQualification}
  onUpdate={...}
/>
```

In `QualificationCell.tsx`, add `visible` prop and show placeholder when hidden:

```typescript
interface QualificationCellProps {
  item: ScoringRow;
  canEdit: boolean;
  visible: boolean;
  onUpdate: (entryId: string, field: string, value: string) => void;
}

// At top of component:
if (!visible) {
  return <span className="text-sm text-muted-foreground italic">Pending</span>;
}
```

**Time cell** — same pattern with `visibility.showTime`.

**Faults cell** — same pattern with `visibility.showFaults`.

- [ ] **Step 3: Run typecheck and tests**

Run: `cd apps/myk9show && pnpm typecheck && npx vitest run src/components/classes/__tests__/`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/
git commit -m "feat: enforce result visibility in ClassResultsTable"
```

---

## Task 8: Enforce Self Check-in in StatusPickerDialog

**Files:**

- Modify: `apps/myk9show/src/components/common/StatusPickerDialog.tsx`
- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx` (pass disabled flag)

- [ ] **Step 1: Add disabled prop to StatusPickerDialog**

In `StatusPickerDialog.tsx`, add prop:

```typescript
interface StatusPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: { entryId: string; armband: string; dogName: string; handlerName: string };
  currentStatus: CheckInStatus;
  onStatusChange: (entryId: string, newStatus: CheckInStatus) => void;
  isStaff: boolean;
  disabled?: boolean;
}
```

When `disabled` is true, show a message instead of status buttons:

```typescript
if (disabled) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>...</DialogHeader>
        <div className="py-6 text-center text-sm text-muted-foreground">
          Self check-in is disabled for this class. Please check in at the secretary table.
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Pass disabled from ClassResultsTable**

In `index.tsx`, the check-in badge `onClick` should be gated:

```typescript
onClick={
  !isStaff && !visibility.selfCheckinEnabled
    ? undefined
    : () => setStatusPickerEntry({...})
}
```

And pass `disabled` to the dialog:

```typescript
<StatusPickerDialog
  ...
  disabled={!isStaff && !visibility.selfCheckinEnabled}
/>
```

- [ ] **Step 3: Run typecheck and tests**

Run: `cd apps/myk9show && pnpm typecheck && npx vitest run src/components/classes/__tests__/`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/common/StatusPickerDialog.tsx apps/myk9show/src/components/classes/ClassResultsTable/index.tsx
git commit -m "feat: enforce self check-in setting in StatusPickerDialog"
```

---

## Task 9: Enforce Visibility in Public Results Tab

**Files:**

- Modify: `apps/myk9show/src/components/results/ShowResultsTab.tsx`

- [ ] **Step 1: Add visibility filtering to ShowResultsTab**

The results tab shows PodiumCards with placements. When placement visibility is restricted, hide the podium or show a pending message.

Import the hook:

```typescript
import { useVisibleResultFields } from '@/hooks/useVisibleResultFields';
import { useAuthContext } from '@/hooks/useAuthContext';
```

For each class result, check visibility before rendering placements. Since `useVisibleResultFields` is per-class, the filtering needs to happen at the class-result level. The simplest approach is a wrapper component:

```typescript
function VisibilityGatedPodiumCard({
  cls,
  showId,
}: {
  cls: ClassResult;
  showId: string;
}) {
  const visibility = useVisibleResultFields(
    showId,
    cls.trialId,
    cls.classId,
    cls.isReleased ? 'released' : cls.isCompleted ? 'completed' : 'in_progress'
  );

  if (!visibility.showPlacement) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{cls.className}</h3>
        </div>
        <div className="p-4 text-center text-sm text-muted-foreground italic">
          Results pending review
        </div>
      </Card>
    );
  }

  return <PodiumCard classTitle={cls.className} placements={cls.placements} />;
}
```

Replace `PodiumCard` usage with `VisibilityGatedPodiumCard` in the results grid.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/results/ShowResultsTab.tsx
git commit -m "feat: enforce result visibility on public results tab"
```

---

## Task 10: Component Tests for ShowSettingsPanel

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/__tests__/ShowSettingsPanel.test.tsx`

- [ ] **Step 1: Write component tests**

```typescript
// apps/myk9show/src/features/pipeline/components/__tests__/ShowSettingsPanel.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { ShowSettingsPanel } from '../ShowSettingsPanel';
import { vi } from 'vitest';

// Mock Supabase
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  showId: 'show-1',
  trials: [
    { id: 'trial-1', name: 'Trial 1' },
    { id: 'trial-2', name: 'Trial 2' },
  ],
  classes: [
    { id: 'class-1', trialId: 'trial-1', name: 'Interior Novice A' },
  ],
};

describe('ShowSettingsPanel', () => {
  it('renders panel title', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Show Settings')).toBeInTheDocument();
  });

  it('renders result visibility section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Result Visibility')).toBeInTheDocument();
  });

  it('renders three preset options', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('renders self check-in section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Self Check-in')).toBeInTheDocument();
  });

  it('renders trial overrides section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Trial Overrides')).toBeInTheDocument();
  });

  it('renders class overrides section', () => {
    render(<ShowSettingsPanel {...defaultProps} />);
    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ShowSettingsPanel {...defaultProps} open={false} />);
    expect(screen.queryByText('Show Settings')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && npx vitest run src/features/pipeline/components/__tests__/ShowSettingsPanel.test.tsx`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/__tests__/ShowSettingsPanel.test.tsx
git commit -m "test: add ShowSettingsPanel component tests"
```

---

## Task 11: Final Integration & Cleanup

- [ ] **Step 1: Run full typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, no regressions.

- [ ] **Step 3: Run lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm lint`
Expected: No new warnings or errors.

- [ ] **Step 4: Manual smoke test**

1. Open Mission Control, verify settings gear icon appears
2. Click gear icon, verify panel opens with presets
3. Select "After Review" preset, verify it saves
4. Toggle self check-in off, verify it saves
5. As exhibitor, verify results show "Pending" in ClassResultsTable
6. As exhibitor, verify check-in badge is non-clickable when self check-in disabled
7. As secretary/judge, verify all fields visible regardless of settings

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: results control & self check-in — complete feature"
```
