# Show Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port myK9Q's results visibility and self check-in settings into myK9Show via a shared `@myk9/secretary` package, new database tables, and a dedicated settings UI.

**Architecture:** New `@myk9/secretary` workspace package exports pure types and cascade resolution logic. Three new database tables store show/trial/class visibility and check-in settings. myK9Show gets a `/secretary/settings` page and contextual override controls. myK9Q migrates from local types to the shared package.

**Tech Stack:** TypeScript, pnpm workspaces, tsup, vitest, Supabase (PostgreSQL + RLS), React, React Query, Tailwind CSS, shadcn/ui (Base UI), lucide-react

**Spec:** `docs/superpowers/specs/2026-03-11-show-settings-design.md`

---

## Chunk 1: Shared Package (`@myk9/secretary`)

### File Structure

```
packages/secretary/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── visibility/
    │   ├── visibility-types.ts
    │   ├── visibility-presets.ts
    │   ├── visibility-cascade.ts
    │   └── __tests__/
    │       ├── visibility-presets.test.ts
    │       ├── visibility-cascade.test.ts
    │       └── get-visible-result-fields.test.ts
    └── checkin/
        ├── checkin-cascade.ts
        └── __tests__/
            └── checkin-cascade.test.ts
```

### Task 1: Scaffold `@myk9/secretary` package

**Files:**

- Create: `packages/secretary/package.json`
- Create: `packages/secretary/tsconfig.json`
- Create: `packages/secretary/tsup.config.ts`
- Create: `packages/secretary/vitest.config.ts`
- Create: `packages/secretary/src/index.ts`

- [ ] **Step 1: Create `packages/secretary/package.json`**

```json
{
  "name": "@myk9/secretary",
  "version": "0.0.1",
  "description": "Secretary tools: visibility cascade, check-in cascade, and shared types",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@myk9/test-utils": "workspace:*",
    "@vitest/coverage-v8": "^4.0.18",
    "tsup": "^8.5.1",
    "typescript": "~5.9.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create `packages/secretary/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "composite": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/secretary/tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  splitting: false,
});
```

- [ ] **Step 4: Create `packages/secretary/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['@myk9/test-utils/src/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
  },
});
```

- [ ] **Step 5: Create stub `packages/secretary/src/index.ts`**

```typescript
/**
 * @myk9/secretary — Secretary tools package
 *
 * Pure types and cascade resolution logic for:
 * - Results visibility (show → trial → class cascade with presets)
 * - Self check-in (show → trial → class cascade)
 */

// Types and cascade logic will be exported here as they are created
```

- [ ] **Step 6: Install dependencies**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm install`
Expected: lockfile updated, `@myk9/secretary` linked in workspace

- [ ] **Step 7: Verify build**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm build`
Expected: `dist/` created with `index.js` and `index.d.ts`

- [ ] **Step 8: Commit**

```bash
git add packages/secretary/
git commit -m "feat(secretary): scaffold @myk9/secretary package"
```

---

### Task 2: Visibility types and presets

**Files:**

- Create: `packages/secretary/src/visibility/visibility-types.ts`
- Create: `packages/secretary/src/visibility/visibility-presets.ts`
- Create: `packages/secretary/src/visibility/__tests__/visibility-presets.test.ts`
- Modify: `packages/secretary/src/index.ts`

**Reference:** `apps/myk9q/src/types/visibility.ts` (source of truth for type shapes)

- [ ] **Step 1: Write failing test for presets**

Create `packages/secretary/src/visibility/__tests__/visibility-presets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PRESET_CONFIGS, resolvePreset } from '../visibility-presets';
import type { VisibilityPreset } from '../visibility-types';

describe('PRESET_CONFIGS', () => {
  it('defines all three presets', () => {
    expect(Object.keys(PRESET_CONFIGS)).toEqual(['open', 'standard', 'review']);
  });

  it('open preset: placement is class_complete, others immediate', () => {
    const open = PRESET_CONFIGS.open;
    expect(open.placement).toBe('class_complete');
    expect(open.qualification).toBe('immediate');
    expect(open.time).toBe('immediate');
    expect(open.faults).toBe('immediate');
  });

  it('standard preset: qualification immediate, others class_complete', () => {
    const std = PRESET_CONFIGS.standard;
    expect(std.placement).toBe('class_complete');
    expect(std.qualification).toBe('immediate');
    expect(std.time).toBe('class_complete');
    expect(std.faults).toBe('class_complete');
  });

  it('review preset: all manual_release', () => {
    const rev = PRESET_CONFIGS.review;
    expect(rev.placement).toBe('manual_release');
    expect(rev.qualification).toBe('manual_release');
    expect(rev.time).toBe('manual_release');
    expect(rev.faults).toBe('manual_release');
  });
});

describe('resolvePreset', () => {
  it('returns correct settings with inheritedFrom and preset', () => {
    const result = resolvePreset('open', 'trial');
    expect(result.inheritedFrom).toBe('trial');
    expect(result.preset).toBe('open');
    expect(result.placement).toBe('class_complete');
  });

  it.each<VisibilityPreset>(['open', 'standard', 'review'])(
    'never sets placement to immediate for %s',
    preset => {
      const result = resolvePreset(preset, 'show');
      expect(result.placement).not.toBe('immediate');
    }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test -- --run src/visibility/__tests__/visibility-presets.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create visibility types**

Create `packages/secretary/src/visibility/visibility-types.ts`:

```typescript
/**
 * Visibility Type Definitions
 *
 * Shared between myK9Show and myK9Q. Field names use short form
 * (placement, qualification, time, faults) — DB columns use _timing
 * suffix; each app's adapter maps between them.
 */

/** When a result field becomes visible to stewards/exhibitors */
export type VisibilityTiming = 'immediate' | 'class_complete' | 'manual_release';

/** Quick-apply preset templates */
export type VisibilityPreset = 'open' | 'standard' | 'review';

/** Result fields that can be controlled */
export type ResultField = 'placement' | 'qualification' | 'time' | 'faults';

/** Complete visibility configuration for a class (all fields resolved, no nulls) */
export interface VisibilitySettings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
  inheritedFrom?: 'show' | 'trial' | 'class';
  preset?: VisibilityPreset;
}

/** Computed per-user visibility flags (output of getVisibleResultFields) */
export interface VisibleResultFields {
  showPlacement: boolean;
  showQualification: boolean;
  showTime: boolean;
  showFaults: boolean;
}

/** Class completion state for visibility evaluation */
export type ClassState = 'in_progress' | 'completed' | 'released';

/** User roles for visibility bypass logic */
export type VisibilityUserRole = 'judge' | 'admin' | 'secretary' | 'steward' | 'exhibitor';

/** Nullable override row — null means inherit from parent level */
export interface VisibilityOverride {
  preset?: VisibilityPreset | null;
  placement?: VisibilityTiming | null;
  qualification?: VisibilityTiming | null;
  time?: VisibilityTiming | null;
  faults?: VisibilityTiming | null;
}

/** UI metadata for preset cards — each app can extend with icons/styling */
export interface PresetInfo {
  preset: VisibilityPreset;
  title: string;
  description: string;
  details: string;
}
```

- [ ] **Step 4: Create visibility presets**

Create `packages/secretary/src/visibility/visibility-presets.ts`:

```typescript
import type { VisibilityPreset, VisibilitySettings, PresetInfo } from './visibility-types';

/** Field timings for each preset */
export const PRESET_CONFIGS: Record<
  VisibilityPreset,
  Omit<VisibilitySettings, 'inheritedFrom' | 'preset'>
> = {
  open: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'immediate',
    faults: 'immediate',
  },
  standard: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
  },
  review: {
    placement: 'manual_release',
    qualification: 'manual_release',
    time: 'manual_release',
    faults: 'manual_release',
  },
};

/** UI metadata for each preset (no icons — apps add their own) */
export const PRESET_INFO: Record<VisibilityPreset, PresetInfo> = {
  open: {
    preset: 'open',
    title: 'Immediately',
    description: 'Show results immediately as dogs run',
    details: 'Q/NQ, Time, Faults visible right away. Placement when class completes.',
  },
  standard: {
    preset: 'standard',
    title: 'After Class',
    description: 'Show Q/NQ immediately, rest when class completes',
    details: 'Q/NQ visible as scored. Time, Faults, Placement when class finishes.',
  },
  review: {
    preset: 'review',
    title: 'After Review',
    description: 'Judge must approve before results are visible',
    details: 'All results hidden until you click "Release Results" button.',
  },
};

/**
 * Convert a preset name to a complete VisibilitySettings object.
 *
 * @param preset - Preset name
 * @param source - Where the preset is applied (show/trial/class)
 */
export function resolvePreset(
  preset: VisibilityPreset,
  source: 'show' | 'trial' | 'class'
): VisibilitySettings {
  return {
    ...PRESET_CONFIGS[preset],
    inheritedFrom: source,
    preset,
  };
}
```

- [ ] **Step 5: Update index.ts with exports**

Replace `packages/secretary/src/index.ts`:

```typescript
/**
 * @myk9/secretary — Secretary tools package
 *
 * Pure types and cascade resolution logic for:
 * - Results visibility (show → trial → class cascade with presets)
 * - Self check-in (show → trial → class cascade)
 */

// Visibility types
export type {
  VisibilityTiming,
  VisibilityPreset,
  ResultField,
  VisibilitySettings,
  VisibleResultFields,
  ClassState,
  VisibilityUserRole,
  VisibilityOverride,
  PresetInfo,
} from './visibility/visibility-types';

// Visibility presets
export { PRESET_CONFIGS, PRESET_INFO, resolvePreset } from './visibility/visibility-presets';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test -- --run src/visibility/__tests__/visibility-presets.test.ts`
Expected: PASS — all tests green

- [ ] **Step 7: Commit**

```bash
git add packages/secretary/src/visibility/visibility-types.ts packages/secretary/src/visibility/visibility-presets.ts packages/secretary/src/visibility/__tests__/visibility-presets.test.ts packages/secretary/src/index.ts
git commit -m "feat(secretary): add visibility types and presets"
```

---

### Task 3: Visibility cascade resolution

**Files:**

- Create: `packages/secretary/src/visibility/visibility-cascade.ts`
- Create: `packages/secretary/src/visibility/__tests__/visibility-cascade.test.ts`
- Create: `packages/secretary/src/visibility/__tests__/get-visible-result-fields.test.ts`
- Modify: `packages/secretary/src/index.ts`

**Reference:** `apps/myk9q/src/services/resultVisibilityService.ts:118-250` — `resolveSettings()`, `shouldShowField()`, `getVisibleResultFields()`

- [ ] **Step 1: Write failing test for `resolveVisibilityCascade`**

Create `packages/secretary/src/visibility/__tests__/visibility-cascade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveVisibilityCascade } from '../visibility-cascade';
import type { VisibilitySettings, VisibilityOverride } from '../visibility-types';

const showDefaults: VisibilitySettings = {
  placement: 'class_complete',
  qualification: 'immediate',
  time: 'class_complete',
  faults: 'class_complete',
  preset: 'standard',
  inheritedFrom: 'show',
};

describe('resolveVisibilityCascade', () => {
  it('returns show defaults when no overrides', () => {
    const result = resolveVisibilityCascade(showDefaults);
    expect(result.placement).toBe('class_complete');
    expect(result.qualification).toBe('immediate');
    expect(result.inheritedFrom).toBe('show');
  });

  it('applies trial override fields, inherits rest from show', () => {
    const trialOverride: VisibilityOverride = {
      time: 'immediate',
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.time).toBe('immediate');
    expect(result.placement).toBe('class_complete'); // inherited
    expect(result.inheritedFrom).toBe('trial');
  });

  it('class override takes highest precedence', () => {
    const trialOverride: VisibilityOverride = { time: 'immediate' };
    const classOverride: VisibilityOverride = { faults: 'manual_release' };
    const result = resolveVisibilityCascade(showDefaults, trialOverride, classOverride);
    expect(result.faults).toBe('manual_release');
    expect(result.time).toBe('immediate'); // from trial
    expect(result.placement).toBe('class_complete'); // from show
    expect(result.inheritedFrom).toBe('class');
  });

  it('preset override applies all preset fields as base', () => {
    const trialOverride: VisibilityOverride = { preset: 'review' };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.placement).toBe('manual_release');
    expect(result.qualification).toBe('manual_release');
    expect(result.preset).toBe('review');
  });

  it('per-field overrides win over preset at same level', () => {
    const trialOverride: VisibilityOverride = {
      preset: 'review',
      qualification: 'immediate',
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.qualification).toBe('immediate'); // field wins
    expect(result.placement).toBe('manual_release'); // from preset
  });

  it('all-null override means full inherit from parent', () => {
    const emptyOverride: VisibilityOverride = {};
    const result = resolveVisibilityCascade(showDefaults, emptyOverride);
    expect(result).toEqual(
      expect.objectContaining({
        placement: 'class_complete',
        qualification: 'immediate',
        time: 'class_complete',
        faults: 'class_complete',
      })
    );
  });

  it('null fields in override are skipped (inherit from parent)', () => {
    const trialOverride: VisibilityOverride = {
      placement: null,
      qualification: 'manual_release',
      time: null,
      faults: null,
    };
    const result = resolveVisibilityCascade(showDefaults, trialOverride);
    expect(result.qualification).toBe('manual_release');
    expect(result.placement).toBe('class_complete'); // inherited
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test -- --run src/visibility/__tests__/visibility-cascade.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write failing test for `getVisibleResultFields`**

Create `packages/secretary/src/visibility/__tests__/get-visible-result-fields.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getVisibleResultFields } from '../visibility-cascade';
import type { VisibilitySettings, ClassState, VisibilityUserRole } from '../visibility-types';

const standardSettings: VisibilitySettings = {
  placement: 'class_complete',
  qualification: 'immediate',
  time: 'class_complete',
  faults: 'class_complete',
  preset: 'standard',
};

describe('getVisibleResultFields', () => {
  describe('role bypass', () => {
    it('judges always see all fields', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'judge');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });

    it('admins always see all fields', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'admin');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('exhibitor with standard preset', () => {
    it('in_progress: only qualification visible', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'exhibitor');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
      expect(result.showTime).toBe(false);
      expect(result.showFaults).toBe(false);
    });

    it('completed: all fields visible', () => {
      const result = getVisibleResultFields(standardSettings, 'completed', 'exhibitor');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('review preset', () => {
    const reviewSettings: VisibilitySettings = {
      placement: 'manual_release',
      qualification: 'manual_release',
      time: 'manual_release',
      faults: 'manual_release',
      preset: 'review',
    };

    it('completed but not released: nothing visible to exhibitor', () => {
      const result = getVisibleResultFields(reviewSettings, 'completed', 'exhibitor');
      expect(result).toEqual({
        showPlacement: false,
        showQualification: false,
        showTime: false,
        showFaults: false,
      });
    });

    it('released: all visible to exhibitor', () => {
      const result = getVisibleResultFields(reviewSettings, 'released', 'exhibitor');
      expect(result).toEqual({
        showPlacement: true,
        showQualification: true,
        showTime: true,
        showFaults: true,
      });
    });
  });

  describe('steward sees same as exhibitor', () => {
    it('in_progress with standard: only qualification', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'steward');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
    });
  });

  describe('secretary sees same as exhibitor (no bypass)', () => {
    it('in_progress with standard: only qualification', () => {
      const result = getVisibleResultFields(standardSettings, 'in_progress', 'secretary');
      expect(result.showQualification).toBe(true);
      expect(result.showPlacement).toBe(false);
    });
  });
});
```

- [ ] **Step 4: Implement `visibility-cascade.ts`**

Create `packages/secretary/src/visibility/visibility-cascade.ts`:

```typescript
import type {
  VisibilitySettings,
  VisibilityOverride,
  VisibleResultFields,
  VisibilityTiming,
  ClassState,
  VisibilityUserRole,
} from './visibility-types';
import { PRESET_CONFIGS } from './visibility-presets';

const RESULT_FIELDS = ['placement', 'qualification', 'time', 'faults'] as const;

/**
 * Resolve the visibility cascade: show → trial → class.
 *
 * Each level's non-null fields override the parent. If a level specifies
 * a preset, the preset fields are applied first, then per-field overrides
 * at that level take precedence over the preset.
 *
 * @param show - Show-level settings (fully resolved, no nulls)
 * @param trial - Trial-level overrides (nullable fields = inherit)
 * @param cls - Class-level overrides (nullable fields = inherit)
 */
export function resolveVisibilityCascade(
  show: VisibilitySettings,
  trial?: VisibilityOverride,
  cls?: VisibilityOverride
): VisibilitySettings {
  let result: VisibilitySettings = { ...show };

  if (trial) {
    result = applyOverride(result, trial, 'trial');
  }

  if (cls) {
    result = applyOverride(result, cls, 'class');
  }

  return result;
}

/**
 * Apply an override layer on top of current settings.
 * Preset is applied first as base, then per-field overrides win.
 */
function applyOverride(
  base: VisibilitySettings,
  override: VisibilityOverride,
  source: 'trial' | 'class'
): VisibilitySettings {
  // Check if override has any non-null values
  const hasPreset = override.preset != null;
  const hasFieldOverrides = RESULT_FIELDS.some(f => override[f] != null);

  if (!hasPreset && !hasFieldOverrides) {
    return base; // All null = full inherit
  }

  // Start from base
  const result: VisibilitySettings = { ...base, inheritedFrom: source };

  // If preset specified, apply preset as new base
  if (hasPreset) {
    const presetConfig = PRESET_CONFIGS[override.preset!];
    for (const field of RESULT_FIELDS) {
      result[field] = presetConfig[field];
    }
    result.preset = override.preset!;
  }

  // Per-field overrides win over preset
  for (const field of RESULT_FIELDS) {
    if (override[field] != null) {
      result[field] = override[field]!;
    }
  }

  return result;
}

/**
 * Determine which result fields should be visible to a specific user.
 *
 * Judges and admins ALWAYS see all fields (bypass all restrictions).
 * All other roles are subject to configured visibility rules.
 *
 * @param settings - Resolved visibility settings for this class
 * @param classState - Current state of the class
 * @param userRole - Role of the user viewing results
 */
export function getVisibleResultFields(
  settings: VisibilitySettings,
  classState: ClassState,
  userRole: VisibilityUserRole
): VisibleResultFields {
  // Judges and admins bypass all restrictions
  if (userRole === 'judge' || userRole === 'admin') {
    return {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
    };
  }

  return {
    showPlacement: shouldShowField(settings.placement, classState),
    showQualification: shouldShowField(settings.qualification, classState),
    showTime: shouldShowField(settings.time, classState),
    showFaults: shouldShowField(settings.faults, classState),
  };
}

/**
 * Check if a specific field should be visible based on timing and class state.
 */
function shouldShowField(timing: VisibilityTiming, classState: ClassState): boolean {
  switch (timing) {
    case 'immediate':
      return true;
    case 'class_complete':
      return classState === 'completed' || classState === 'released';
    case 'manual_release':
      return classState === 'released';
    default:
      return false;
  }
}
```

- [ ] **Step 5: Update index.ts with cascade exports**

Add to `packages/secretary/src/index.ts` after existing exports:

```typescript
// Visibility cascade
export { resolveVisibilityCascade, getVisibleResultFields } from './visibility/visibility-cascade';
```

- [ ] **Step 6: Run all visibility tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test`
Expected: PASS — all tests green

- [ ] **Step 7: Commit**

```bash
git add packages/secretary/src/visibility/visibility-cascade.ts packages/secretary/src/visibility/__tests__/ packages/secretary/src/index.ts
git commit -m "feat(secretary): add visibility cascade resolution and getVisibleResultFields"
```

---

### Task 4: Check-in cascade resolution

**Files:**

- Create: `packages/secretary/src/checkin/checkin-cascade.ts`
- Create: `packages/secretary/src/checkin/__tests__/checkin-cascade.test.ts`
- Modify: `packages/secretary/src/index.ts`

**Reference:** `apps/myk9q/src/services/resultVisibilityService.ts:459-512` — `getEffectiveSelfCheckin()`

- [ ] **Step 1: Write failing test for `resolveCheckinCascade`**

Create `packages/secretary/src/checkin/__tests__/checkin-cascade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveCheckinCascade } from '../checkin-cascade';

describe('resolveCheckinCascade', () => {
  it('returns show setting when no overrides', () => {
    expect(resolveCheckinCascade(true)).toBe(true);
    expect(resolveCheckinCascade(false)).toBe(false);
  });

  it('trial overrides show', () => {
    expect(resolveCheckinCascade(true, false)).toBe(false);
    expect(resolveCheckinCascade(false, true)).toBe(true);
  });

  it('class overrides trial and show', () => {
    expect(resolveCheckinCascade(true, true, false)).toBe(false);
    expect(resolveCheckinCascade(false, false, true)).toBe(true);
  });

  it('null/undefined at class level falls through to trial', () => {
    expect(resolveCheckinCascade(true, false, null)).toBe(false);
    expect(resolveCheckinCascade(true, false, undefined)).toBe(false);
  });

  it('null at trial and class level falls through to show', () => {
    expect(resolveCheckinCascade(false, null, null)).toBe(false);
  });

  it('all null/undefined defaults to true', () => {
    expect(resolveCheckinCascade(null, null, null)).toBe(true);
    expect(resolveCheckinCascade(undefined, undefined, undefined)).toBe(true);
  });

  it('defaults to true when show is null', () => {
    expect(resolveCheckinCascade(null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test -- --run src/checkin/__tests__/checkin-cascade.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `checkin-cascade.ts`**

Create `packages/secretary/src/checkin/checkin-cascade.ts`:

```typescript
/**
 * Self Check-In Cascade Resolution
 *
 * Cascade: class ?? trial ?? show ?? true
 * Each level can override the parent. null/undefined means inherit.
 */

/**
 * Resolve the effective self check-in setting through the cascade.
 *
 * @param show - Show-level setting (null = default to true)
 * @param trial - Trial-level override (null/undefined = inherit from show)
 * @param cls - Class-level override (null/undefined = inherit from trial)
 * @returns Whether self check-in is enabled
 */
export function resolveCheckinCascade(
  show?: boolean | null,
  trial?: boolean | null,
  cls?: boolean | null
): boolean {
  if (cls != null) return cls;
  if (trial != null) return trial;
  if (show != null) return show;
  return true; // ultimate default
}
```

- [ ] **Step 4: Update index.ts with check-in exports**

Add to `packages/secretary/src/index.ts`:

```typescript
// Check-in cascade
export { resolveCheckinCascade } from './checkin/checkin-cascade';
```

- [ ] **Step 5: Run all tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test`
Expected: PASS — all tests green

- [ ] **Step 6: Run monorepo typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/secretary/src/checkin/ packages/secretary/src/index.ts
git commit -m "feat(secretary): add check-in cascade resolution"
```

---

## Chunk 2: Database Migration

### Task 5: Create migration `060_show_settings.sql`

**Files:**

- Create: `supabase/migrations/060_show_settings.sql`

**Reference:** Spec Section 2, existing RLS patterns from migration 016

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/060_show_settings.sql`:

```sql
-- 060_show_settings.sql
-- Results visibility + self check-in settings with show → trial → class cascade

-- ============================================================
-- Show-level visibility settings (one row per show)
-- ============================================================
CREATE TABLE IF NOT EXISTS show_visibility_settings (
  show_id UUID PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'standard'
    CHECK (preset IN ('open', 'standard', 'review')),
  placement_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT NOT NULL DEFAULT 'immediate'
    CHECK (qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT NOT NULL DEFAULT 'class_complete'
    CHECK (faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Trial-level overrides (nullable = inherit from show)
-- ============================================================
CREATE TABLE IF NOT EXISTS trial_visibility_overrides (
  trial_id UUID PRIMARY KEY REFERENCES trials(id) ON DELETE CASCADE,
  preset TEXT
    CHECK (preset IS NULL OR preset IN ('open', 'standard', 'review')),
  placement_timing TEXT
    CHECK (placement_timing IS NULL OR placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT
    CHECK (qualification_timing IS NULL OR qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT
    CHECK (time_timing IS NULL OR time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT
    CHECK (faults_timing IS NULL OR faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Class-level overrides (nullable = inherit from trial/show)
-- ============================================================
CREATE TABLE IF NOT EXISTS class_visibility_overrides (
  class_id UUID PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  preset TEXT
    CHECK (preset IS NULL OR preset IN ('open', 'standard', 'review')),
  placement_timing TEXT
    CHECK (placement_timing IS NULL OR placement_timing IN ('class_complete', 'manual_release')),
  qualification_timing TEXT
    CHECK (qualification_timing IS NULL OR qualification_timing IN ('immediate', 'class_complete', 'manual_release')),
  time_timing TEXT
    CHECK (time_timing IS NULL OR time_timing IN ('immediate', 'class_complete', 'manual_release')),
  faults_timing TEXT
    CHECK (faults_timing IS NULL OR faults_timing IN ('immediate', 'class_complete', 'manual_release')),
  self_checkin_enabled BOOLEAN,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE show_visibility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_visibility_overrides ENABLE ROW LEVEL SECURITY;

-- Show visibility settings: readable by anyone viewing the show, writable by secretary/admin
CREATE POLICY "show_visibility_select" ON show_visibility_settings
  FOR SELECT USING (true);

CREATE POLICY "show_visibility_insert" ON show_visibility_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = show_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "show_visibility_update" ON show_visibility_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = show_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- Trial visibility overrides
CREATE POLICY "trial_visibility_select" ON trial_visibility_overrides
  FOR SELECT USING (true);

CREATE POLICY "trial_visibility_insert" ON trial_visibility_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE t.id = trial_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "trial_visibility_update" ON trial_visibility_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trials t
      JOIN shows s ON s.id = t.show_id
      WHERE t.id = trial_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- Class visibility overrides
CREATE POLICY "class_visibility_select" ON class_visibility_overrides
  FOR SELECT USING (true);

CREATE POLICY "class_visibility_insert" ON class_visibility_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE c.id = class_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

CREATE POLICY "class_visibility_update" ON class_visibility_overrides
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classes c
      JOIN trials t ON t.id = c.trial_id
      JOIN shows s ON s.id = t.show_id
      WHERE c.id = class_id
        AND (
          (SELECT is_trial_secretary(s.club_id))
          OR (SELECT is_club_admin(s.club_id))
          OR (SELECT is_platform_admin())
        )
    )
  );

-- ============================================================
-- Deprecate old column
-- ============================================================
COMMENT ON COLUMN shows.results_visible_to_all IS
  'DEPRECATED: Use show_visibility_settings table instead. Retained for backward compatibility.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/060_show_settings.sql
git commit -m "feat(db): add show settings tables for visibility and check-in cascade"
```

---

## Chunk 3: myK9Show Settings UI

### Task 6: Settings data hooks

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts`
- Create: `apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts`
- Modify: `apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts`

- [ ] **Step 1: Create `useShowSettingsDatabase.ts`**

Create `apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts`:

```typescript
/**
 * Show Settings Query Hooks
 *
 * React Query hooks for fetching visibility and check-in settings
 * from show_visibility_settings, trial_visibility_overrides,
 * and class_visibility_overrides tables.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import {
  resolveVisibilityCascade,
  resolveCheckinCascade,
  resolvePreset,
  type VisibilitySettings,
  type VisibilityOverride,
} from '@myk9/secretary';

// Query key factory
export const settingsQueryKeys = {
  all: ['showSettings'] as const,
  show: (showId: string) => [...settingsQueryKeys.all, 'show', showId] as const,
  trials: (showId: string) => [...settingsQueryKeys.all, 'trials', showId] as const,
  trialOverride: (trialId: string) => [...settingsQueryKeys.all, 'trial', trialId] as const,
  classOverride: (classId: string) => [...settingsQueryKeys.all, 'class', classId] as const,
};

const cacheStrategy = {
  staleTime: 5 * 60 * 1000, // 5 min
  gcTime: 10 * 60 * 1000, // 10 min
};

/** DB row shape for show_visibility_settings */
interface ShowSettingsRow {
  show_id: string;
  preset: string;
  placement_timing: string;
  qualification_timing: string;
  time_timing: string;
  faults_timing: string;
  self_checkin_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

/** DB row shape for trial/class overrides */
interface OverrideRow {
  trial_id?: string;
  class_id?: string;
  preset: string | null;
  placement_timing: string | null;
  qualification_timing: string | null;
  time_timing: string | null;
  faults_timing: string | null;
  self_checkin_enabled: boolean | null;
  updated_by: string | null;
  updated_at: string;
}

/** Map DB column names (_timing suffix) to shared type field names (short) */
function rowToVisibilitySettings(row: ShowSettingsRow): VisibilitySettings {
  return {
    placement: row.placement_timing as VisibilitySettings['placement'],
    qualification: row.qualification_timing as VisibilitySettings['qualification'],
    time: row.time_timing as VisibilitySettings['time'],
    faults: row.faults_timing as VisibilitySettings['faults'],
    preset: row.preset as VisibilitySettings['preset'],
    inheritedFrom: 'show',
  };
}

/** Map DB override row to VisibilityOverride (nullable fields) */
function rowToOverride(row: OverrideRow): VisibilityOverride {
  return {
    preset: row.preset as VisibilityOverride['preset'],
    placement: row.placement_timing as VisibilityOverride['placement'],
    qualification: row.qualification_timing as VisibilityOverride['qualification'],
    time: row.time_timing as VisibilityOverride['time'],
    faults: row.faults_timing as VisibilityOverride['faults'],
  };
}

/** Show-level settings (or defaults if no row exists) */
export interface ShowSettings {
  visibility: VisibilitySettings;
  selfCheckinEnabled: boolean;
  hasExplicitSettings: boolean;
}

async function fetchShowSettings(showId: string): Promise<ShowSettings> {
  const { data, error } = await supabase
    .from('show_visibility_settings')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return {
      visibility: resolvePreset('standard', 'show'),
      selfCheckinEnabled: true,
      hasExplicitSettings: false,
    };
  }

  const row = data as ShowSettingsRow;
  return {
    visibility: rowToVisibilitySettings(row),
    selfCheckinEnabled: row.self_checkin_enabled,
    hasExplicitSettings: true,
  };
}

export function useShowSettings(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.show(showId!),
    queryFn: () => fetchShowSettings(showId!),
    enabled: !!showId,
    ...cacheStrategy,
  });
}

/** All trial overrides for a show (for the settings page list) */
export interface TrialOverrideEntry {
  trialId: string;
  override: VisibilityOverride;
  selfCheckinEnabled: boolean | null;
}

async function fetchTrialOverrides(showId: string): Promise<TrialOverrideEntry[]> {
  const { data: trials, error: trialsError } = await supabase
    .from('trials')
    .select('id')
    .eq('show_id', showId);

  if (trialsError) throw trialsError;
  if (!trials?.length) return [];

  const trialIds = trials.map(t => t.id);
  const { data: overrides, error } = await supabase
    .from('trial_visibility_overrides')
    .select('*')
    .in('trial_id', trialIds);

  if (error) throw error;
  if (!overrides) return [];

  return overrides.map((row: OverrideRow) => ({
    trialId: row.trial_id!,
    override: rowToOverride(row),
    selfCheckinEnabled: row.self_checkin_enabled,
  }));
}

export function useTrialOverrides(showId: string | null) {
  return useQuery({
    queryKey: settingsQueryKeys.trials(showId!),
    queryFn: () => fetchTrialOverrides(showId!),
    enabled: !!showId,
    ...cacheStrategy,
  });
}

/**
 * Resolve effective visibility for a class through the full cascade.
 * Fetches show settings + trial override + class override, then resolves.
 */
async function fetchClassEffectiveSettings(
  classId: string,
  trialId: string,
  showId: string
): Promise<{ visibility: VisibilitySettings; selfCheckinEnabled: boolean }> {
  // Fetch all three levels in parallel
  const [showResult, trialResult, classResult] = await Promise.all([
    supabase.from('show_visibility_settings').select('*').eq('show_id', showId).maybeSingle(),
    supabase.from('trial_visibility_overrides').select('*').eq('trial_id', trialId).maybeSingle(),
    supabase.from('class_visibility_overrides').select('*').eq('class_id', classId).maybeSingle(),
  ]);

  if (showResult.error) throw showResult.error;
  if (trialResult.error) throw trialResult.error;
  if (classResult.error) throw classResult.error;

  const showSettings = showResult.data
    ? rowToVisibilitySettings(showResult.data as ShowSettingsRow)
    : resolvePreset('standard', 'show');
  const showCheckin = (showResult.data as ShowSettingsRow | null)?.self_checkin_enabled ?? true;

  const trialOverride = trialResult.data
    ? rowToOverride(trialResult.data as OverrideRow)
    : undefined;
  const trialCheckin = (trialResult.data as OverrideRow | null)?.self_checkin_enabled ?? null;

  const classOverride = classResult.data
    ? rowToOverride(classResult.data as OverrideRow)
    : undefined;
  const classCheckin = (classResult.data as OverrideRow | null)?.self_checkin_enabled ?? null;

  return {
    visibility: resolveVisibilityCascade(showSettings, trialOverride, classOverride),
    selfCheckinEnabled: resolveCheckinCascade(showCheckin, trialCheckin, classCheckin),
  };
}

export function useClassEffectiveSettings(
  classId: string | null,
  trialId: string | null,
  showId: string | null
) {
  return useQuery({
    queryKey: settingsQueryKeys.classOverride(classId!),
    queryFn: () => fetchClassEffectiveSettings(classId!, trialId!, showId!),
    enabled: !!classId && !!trialId && !!showId,
    ...cacheStrategy,
  });
}
```

- [ ] **Step 2: Create `useShowSettingsMutations.ts`**

Create `apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts`:

```typescript
/**
 * Show Settings Mutation Hooks
 *
 * React Query mutations for upserting visibility and check-in settings.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import type { VisibilityPreset, VisibilityTiming } from '@myk9/secretary';
import { settingsQueryKeys } from '../queries/useShowSettingsDatabase';

interface ShowVisibilityUpdate {
  showId: string;
  preset: VisibilityPreset;
  placementTiming: VisibilityTiming;
  qualificationTiming: VisibilityTiming;
  timeTiming: VisibilityTiming;
  faultsTiming: VisibilityTiming;
}

interface ShowCheckinUpdate {
  showId: string;
  enabled: boolean;
}

interface TrialOverrideUpdate {
  trialId: string;
  showId: string; // for cache invalidation
  preset?: VisibilityPreset | null;
  placementTiming?: VisibilityTiming | null;
  qualificationTiming?: VisibilityTiming | null;
  timeTiming?: VisibilityTiming | null;
  faultsTiming?: VisibilityTiming | null;
  selfCheckinEnabled?: boolean | null;
}

interface OverrideReset {
  entityId: string;
  showId: string;
  table: 'trial_visibility_overrides' | 'class_visibility_overrides';
  idColumn: 'trial_id' | 'class_id';
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowVisibilityUpdate) => {
      const { error } = await supabase.from('show_visibility_settings').upsert({
        show_id: update.showId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
    },
  });
}

export function useUpdateShowCheckin() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: ShowCheckinUpdate) => {
      // Use .update() when row exists to avoid clobbering visibility fields.
      // If no row exists yet, upsert with standard preset defaults.
      const { data: existing } = await supabase
        .from('show_visibility_settings')
        .select('show_id')
        .eq('show_id', update.showId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('show_visibility_settings')
          .update({
            self_checkin_enabled: update.enabled,
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('show_id', update.showId);
        if (error) throw error;
      } else {
        // First-time: create row with standard preset + the check-in value
        const { error } = await supabase.from('show_visibility_settings').insert({
          show_id: update.showId,
          preset: 'standard',
          placement_timing: 'class_complete',
          qualification_timing: 'immediate',
          time_timing: 'class_complete',
          faults_timing: 'class_complete',
          self_checkin_enabled: update.enabled,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.show(variables.showId) });
    },
  });
}

export function useUpdateTrialOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (update: TrialOverrideUpdate) => {
      const { error } = await supabase.from('trial_visibility_overrides').upsert({
        trial_id: update.trialId,
        preset: update.preset,
        placement_timing: update.placementTiming,
        qualification_timing: update.qualificationTiming,
        time_timing: update.timeTiming,
        faults_timing: update.faultsTiming,
        self_checkin_enabled: update.selfCheckinEnabled,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.trialId),
      });
    },
  });
}

/**
 * Reset an override row by setting all nullable columns to NULL (not DELETE).
 * Spec: "No DELETE — rows are upserted, not removed (reset = set columns to NULL)."
 * Works for both trial and class overrides.
 */
export function useResetOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (reset: OverrideReset) => {
      const { error } = await supabase.from(reset.table).upsert({
        [reset.idColumn]: reset.entityId,
        preset: null,
        placement_timing: null,
        qualification_timing: null,
        time_timing: null,
        faults_timing: null,
        self_checkin_enabled: null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.trials(variables.showId) });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.trialOverride(variables.entityId),
      });
      queryClient.invalidateQueries({
        queryKey: settingsQueryKeys.classOverride(variables.entityId),
      });
    },
  });
}
```

- [ ] **Step 3: Rewrite `useSelfCheckinEnabled.ts` to use new tables**

Replace `apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts`:

```typescript
/**
 * useSelfCheckinEnabled — Resolves the self-check-in cascade for a class.
 *
 * Cascade: class.self_checkin_enabled ?? trial.self_checkin_enabled ?? show.self_checkin_enabled ?? true
 * Now reads from show_visibility_settings / trial_visibility_overrides / class_visibility_overrides tables.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { resolveCheckinCascade } from '@myk9/secretary';

interface SelfCheckinResult {
  /** Whether self-check-in is enabled for this class */
  enabled: boolean;
  /** Human-readable reason when disabled (undefined when enabled) */
  reason: string | undefined;
  isLoading: boolean;
}

/**
 * Fetch the cascade values and resolve locally.
 * Queries the class's trial and show to get IDs, then fetches all three settings rows.
 */
async function fetchSelfCheckinEnabled(classId: string): Promise<boolean> {
  // Get the class's trial and show IDs
  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select('trial_id, trials!inner(show_id)')
    .eq('id', classId)
    .single();

  if (classError || !classRow) return true; // safe default

  const trialId = classRow.trial_id;
  const showId = (classRow.trials as { show_id: string }).show_id;

  // Fetch all three levels in parallel
  const [showResult, trialResult, classResult] = await Promise.all([
    supabase
      .from('show_visibility_settings')
      .select('self_checkin_enabled')
      .eq('show_id', showId)
      .maybeSingle(),
    supabase
      .from('trial_visibility_overrides')
      .select('self_checkin_enabled')
      .eq('trial_id', trialId)
      .maybeSingle(),
    supabase
      .from('class_visibility_overrides')
      .select('self_checkin_enabled')
      .eq('class_id', classId)
      .maybeSingle(),
  ]);

  const showCheckin = showResult.data?.self_checkin_enabled ?? null;
  const trialCheckin = trialResult.data?.self_checkin_enabled ?? null;
  const classCheckin = classResult.data?.self_checkin_enabled ?? null;

  return resolveCheckinCascade(showCheckin, trialCheckin, classCheckin);
}

export function useSelfCheckinEnabled(classId: string | null): SelfCheckinResult {
  const { data, isLoading } = useQuery({
    queryKey: ['classes', classId, 'selfCheckin'],
    queryFn: () => fetchSelfCheckinEnabled(classId!),
    enabled: !!classId,
    staleTime: 5 * 60 * 1000, // 5 min — rarely changes mid-show
    gcTime: 10 * 60 * 1000,
  });

  const enabled = data ?? true; // default to enabled while loading

  return {
    enabled,
    reason: enabled ? undefined : 'Check-in disabled by show management',
    isLoading,
  };
}
```

- [ ] **Step 4: Add `@myk9/secretary` as dependency to myK9Show**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm add @myk9/secretary@workspace:*`

- [ ] **Step 5: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts apps/myk9show/package.json pnpm-lock.yaml
git commit -m "feat(show): add settings query/mutation hooks and rewrite useSelfCheckinEnabled"
```

---

### Task 7: Settings page — Results Visibility section

**Files:**

- Create: `apps/myk9show/src/pages/secretary/ShowSettingsPage.tsx`
- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx` (add route)
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (add nav item)

- [ ] **Step 1: Create `ShowSettingsPage.tsx`**

Create `apps/myk9show/src/pages/secretary/ShowSettingsPage.tsx`:

This page contains:

- A show selector (if secretary manages multiple shows)
- **Results Visibility** section:
  - Three preset cards (Open / Standard / Review) — clicking one sets the show-level preset
  - "Advanced" collapsible with per-field timing dropdowns
  - Trial overrides list with per-trial dropdowns and reset buttons
- **Self Check-In** section:
  - Show-level toggle
  - Trial overrides list with per-trial toggles and reset buttons

The page uses:

- `useShowSettings(showId)` and `useTrialOverrides(showId)` for data
- `useUpdateShowVisibility()`, `useUpdateShowCheckin()`, `useUpdateTrialOverride()`, `useResetOverride()` for mutations
- `PRESET_INFO` from `@myk9/secretary` for preset card metadata
- `PRESET_CONFIGS` from `@myk9/secretary` to auto-fill fields when a preset is selected
- Tailwind CSS classes following existing myK9Show patterns
- shadcn/ui components: Card, Switch, Select, Button, Collapsible

**Implementation notes:**

- Keep the page under 500 lines — if needed, extract `ResultsVisibilitySection` and `SelfCheckinSection` into sibling files in `apps/myk9show/src/pages/secretary/settings/`
- Import `useAuth` from `@/hooks/useAuth` (NOT `@/context/AuthContext`) for `user.id` (automatic audit trail)
- Placement dropdown only offers `class_complete` and `manual_release` (no `immediate`)
- Show a "Saved" toast on successful mutation

- [ ] **Step 2: Add lazy import and route in `secretaryRoutes.tsx`**

Add lazy import at top (after line 54):

```typescript
const ShowSettingsPage = lazy(() => import('@/pages/secretary/ShowSettingsPage'));
```

Add route after the `/secretary/day-of` route (after line 176):

```tsx
<Route
  path="/secretary/settings"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <SuspenseWrapper>
        <PageTransition>
          <ShowSettingsPage />
        </PageTransition>
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Add Settings to sidebar**

In `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`:

Add `Settings` icon import (line 9-35 import block from lucide-react):

```typescript
import { ..., Settings } from 'lucide-react';
```

Add nav item to Manage group items array (after "Run Orders" entry, around line 154):

```typescript
{
  title: 'Settings',
  href: '/secretary/settings',
  icon: Settings,
  description: 'Results visibility and check-in settings',
},
```

- [ ] **Step 4: Run typecheck and build**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowSettingsPage.tsx apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(show): add secretary settings page with visibility and check-in controls"
```

---

### Task 8: Contextual overrides on trial/class detail pages

**Files:**

- Create: `apps/myk9show/src/components/secretary/SettingsOverrideCard.tsx`
- Modify: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`
- Modify: `apps/myk9show/src/components/secretary/SecretaryClassDashboard.tsx`

The implementation adds a small "Settings" card showing:

- Inherited visibility state (e.g., "Inheriting: Standard from show")
- Override controls (preset dropdown + per-field overrides)
- Check-in toggle with inherit/override state
- Reset button to clear overrides (calls `useResetOverride` with null columns, not DELETE)

- [ ] **Step 1: Create a reusable `SettingsOverrideCard` component**

Create `apps/myk9show/src/components/secretary/SettingsOverrideCard.tsx`:

A card component that shows current inherited settings and provides override controls. Props:

- `level`: `'trial' | 'class'`
- `entityId`: string
- `showId`: string
- `trialId?`: string (for class-level, to fetch trial override)
- `currentSettings`: resolved VisibilitySettings
- `selfCheckinEnabled`: boolean
- `onVisibilityChange`: mutation callback
- `onCheckinChange`: mutation callback
- `onReset`: reset callback (calls `useResetOverride` with appropriate table/idColumn)

Import `useAuth` from `@/hooks/useAuth` (not `@/context/AuthContext`).

- [ ] **Step 2: Add SettingsOverrideCard to `TrialPipelineDetail.tsx`**

File: `apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx`

Add the `SettingsOverrideCard` as a section in the trial detail layout. This component uses a stage-based pipeline UI, so add the card as a standalone section outside the pipeline stages (e.g., in a sidebar or below the stages list). Use `useClassEffectiveSettings` or a trial-level query to fetch current settings.

- [ ] **Step 3: Add SettingsOverrideCard to `SecretaryClassDashboard.tsx`**

File: `apps/myk9show/src/components/secretary/SecretaryClassDashboard.tsx`

Add the card to the class dashboard layout, showing the class's effective settings with override controls.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/secretary/SettingsOverrideCard.tsx apps/myk9show/src/features/pipeline/components/TrialPipelineDetail.tsx apps/myk9show/src/components/secretary/SecretaryClassDashboard.tsx
git commit -m "feat(show): add contextual settings overrides to trial and class detail pages"
```

---

## Chunk 4: myK9Q Migration

### Task 9: Migrate myK9Q to use `@myk9/secretary` types

**Files:**

- Delete: `apps/myk9q/src/types/visibility.ts`
- Modify: `apps/myk9q/src/services/resultVisibilityService.ts` (imports + delegate to shared cascade functions)
- Modify: ~10 files importing from `../types/visibility` or `@/types/visibility`

**Known files importing from `types/visibility` (10 files, 13 import lines):**

1. `apps/myk9q/src/services/resultVisibilityService.ts`
2. `apps/myk9q/src/components/dialogs/ClassSettingsDialog.tsx` (imports `PRESET_CONFIGS`, `VisibilityPreset`)
3. `apps/myk9q/src/pages/Admin/hooks/useVisibilitySettings.ts`
4. `apps/myk9q/src/pages/Admin/hooks/useBulkOperations.ts`
5. `apps/myk9q/src/pages/Admin/hooks/useCompetitionAdminData.ts`
6. `apps/myk9q/src/pages/Admin/components/ResultVisibilitySection.tsx` (imports `PRESET_CONFIGS`, `VisibilityPreset`)
7. `apps/myk9q/src/pages/Admin/components/ClassesList.tsx` (imports `PRESET_CONFIGS`, `VisibilityPreset`)
8. `apps/myk9q/src/pages/TrialSecretary/components/ResultsControlTab.tsx`
9. `apps/myk9q/src/hooks/useDogDetailsData.ts`
10. `apps/myk9q/src/hooks/useEntryListDataHelpers.ts`

- [ ] **Step 1: Add `@myk9/secretary` as dependency to myK9Q**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9q" && pnpm add @myk9/secretary@workspace:*`

- [ ] **Step 2: Find all files importing from visibility types**

Run a search for imports from `types/visibility` in `apps/myk9q/src/`:

```bash
grep -rn "from.*types/visibility" apps/myk9q/src/
```

Verify against the list above. There should be ~10 files.

- [ ] **Step 3: Update imports in `resultVisibilityService.ts`**

Replace the import block:

```typescript
// Before
import type {
  VisibilityPreset,
  VisibilityTiming,
  VisibilitySettings,
  VisibleResultFields,
  ShowVisibilityDefault,
  TrialVisibilityOverride,
  ClassVisibilityOverride,
} from '../types/visibility';

// After
import type {
  VisibilityPreset,
  VisibilityTiming,
  VisibilitySettings,
  VisibleResultFields,
} from '@myk9/secretary';
import { resolvePreset } from '@myk9/secretary';
```

Keep `ShowVisibilityDefault`, `TrialVisibilityOverride`, `ClassVisibilityOverride` as local interfaces in this file — they are myK9Q-specific DB row types (use `license_key` TEXT PK, `number` IDs) that don't belong in the shared package.

- [ ] **Step 4: Refactor `resultVisibilityService.ts` to use shared functions**

Replace the local `resolvePreset()` function (lines 154-186) with the import from `@myk9/secretary`. The local function and the shared function are equivalent — same presets, same field names.

The local `resolveSettings()` function (lines 118-145) can remain as-is since it handles the myK9Q-specific DB row → `VisibilitySettings` mapping with preset fallback. It already produces `VisibilitySettings` objects that match the shared type.

The local `shouldShowField()` and `getVisibleResultFields()` functions (lines 197-250) can optionally be replaced with the shared `getVisibleResultFields()` from `@myk9/secretary`. The main difference: the shared version uses `ClassState` (`'in_progress' | 'completed' | 'released'`) instead of separate `isClassComplete` boolean + `resultsReleasedAt` timestamp. If the mapping is straightforward, use the shared version. If not, keep the local version — it produces identical `VisibleResultFields` output.

- [ ] **Step 5: Handle PRESET_CONFIGS icon field in UI components**

**Critical:** myK9Q's `PRESET_CONFIGS` includes an `icon` field (emoji string) used by 3 UI components. The shared `@myk9/secretary` package intentionally excludes icons ("apps add their own").

For the 3 affected files (`ClassSettingsDialog.tsx`, `ResultVisibilitySection.tsx`, `ClassesList.tsx`):

```typescript
// Import shared preset info (no icons) from @myk9/secretary
import { PRESET_INFO } from '@myk9/secretary';
import type { VisibilityPreset } from '@myk9/secretary';

// Define local icon map
const PRESET_ICONS: Record<VisibilityPreset, string> = {
  open: '⚡',
  standard: '⏱️',
  review: '🔒',
};

// Usage: replace PRESET_CONFIGS[preset].icon with PRESET_ICONS[preset]
// Usage: replace PRESET_CONFIGS[preset].title with PRESET_INFO[preset].title
```

- [ ] **Step 6: Update all other files importing from `types/visibility`**

For each remaining file from the list in Step 2, update imports to use `@myk9/secretary` for shared types (`VisibilityPreset`, `VisibilityTiming`, `VisibilitySettings`, `VisibleResultFields`). Keep myK9Q-specific types local.

- [ ] **Step 7: Delete `apps/myk9q/src/types/visibility.ts`**

Only delete after all imports are updated and verified.

- [ ] **Step 8: Run myK9Q typecheck and tests**

Run:

```bash
cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9q" && pnpm typecheck && pnpm test
```

Expected: PASS — behavior unchanged, import paths and local helper sources changed.

- [ ] **Step 9: Run monorepo typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/myk9q/
git commit -m "refactor(myk9q): migrate visibility types to @myk9/secretary"
```

---

## Chunk 5: Testing & Finalization

### Task 10: myK9Show integration tests

**Files:**

- Create: `apps/myk9show/src/hooks/queries/__tests__/useShowSettingsDatabase.test.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useSelfCheckinEnabled.test.ts`

- [ ] **Step 1: Write query hook tests**

Test `useShowSettings` and `useTrialOverrides` hooks with mocked Supabase responses. Verify:

- Default settings when no row exists
- Correct mapping from DB columns to shared types
- Cache key structure

- [ ] **Step 2: Create `useSelfCheckinEnabled` test**

Create `apps/myk9show/src/hooks/queries/__tests__/useSelfCheckinEnabled.test.ts` (no existing test file). Mock three separate Supabase table queries (`show_visibility_settings`, `trial_visibility_overrides`, `class_visibility_overrides`) instead of the old RPC call. Test cases:

- Default (no rows) returns `enabled: true`
- Show-level disabled returns `enabled: false`
- Trial overrides show
- Class overrides trial
- Null at class/trial falls through to show

- [ ] **Step 3: Run tests**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/apps/myk9show" && pnpm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/__tests__/
git commit -m "test(show): add settings hook tests and update useSelfCheckinEnabled test"
```

---

### Task 11: Package coverage gate and final verification

**Files:**

- Modify: `.github/workflows/ci.yml` (add secretary package coverage job if not auto-detected by turbo)

- [ ] **Step 1: Run full `@myk9/secretary` test suite with coverage**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform/packages/secretary" && pnpm test:coverage`
Expected: Coverage meets thresholds (90%+ statements, 85%+ branches, 90%+ functions/lines)

- [ ] **Step 2: Run full monorepo build + typecheck + lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm lint && pnpm build`
Expected: All pass cleanly

- [ ] **Step 3: Run all tests across monorepo**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm test`
Expected: All pass

- [ ] **Step 4: Update TO-DOS.md**

Remove the show settings todo item from TO-DOS.md now that it's implemented.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: finalize show settings feature — coverage gates and cleanup"
```

---

## Summary

| Chunk                     | Tasks | What it delivers                                                              |
| ------------------------- | ----- | ----------------------------------------------------------------------------- |
| 1: Shared Package         | 1-4   | `@myk9/secretary` with types, presets, cascade resolution, full test coverage |
| 2: Database               | 5     | Three new tables with RLS, placement constraint, deprecation comment          |
| 3: myK9Show UI            | 6-8   | Settings page, data hooks, mutations, contextual overrides                    |
| 4: myK9Q Migration        | 9     | myK9Q imports from shared package, local types deleted                        |
| 5: Testing & Finalization | 10-11 | Integration tests, coverage gates, monorepo verification                      |
