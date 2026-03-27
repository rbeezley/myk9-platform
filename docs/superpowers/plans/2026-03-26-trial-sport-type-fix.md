# Trial sport_type Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `sport_type` through trial creation and editing so scoresheets resolve correctly instead of showing "Not Available."

**Architecture:** Add a `deriveSportType(org, trialType)` mapping function in the scoring types module. Add `sportType` to the `Trial` and `TrialInput` types. Pass it through the wizard's `createTrials()` and derive it in the trial edit panel's `formDataToTrial()`.

**Tech Stack:** TypeScript, React, Zustand, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-trial-sport-type-fix-design.md`

---

### Task 1: Add `deriveSportType()` function with tests

**Files:**

- Modify: `apps/myk9show/src/pages/scoring/types.ts`
- Create: `apps/myk9show/src/pages/scoring/__tests__/deriveSportType.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/pages/scoring/__tests__/deriveSportType.test.ts

import { describe, it, expect } from 'vitest';
import { deriveSportType } from '../types';

describe('deriveSportType', () => {
  it('returns akc-scent-work for AKC + Scent Work', () => {
    expect(deriveSportType('AKC', 'Scent Work')).toBe('akc-scent-work');
  });

  it('returns akc-fast-cat for AKC + FastCAT', () => {
    expect(deriveSportType('AKC', 'FastCAT')).toBe('akc-fast-cat');
  });

  it('returns ukc-nosework for UKC + Nosework', () => {
    expect(deriveSportType('UKC', 'Nosework')).toBe('ukc-nosework');
  });

  it('returns ukc-rally for UKC + Rally', () => {
    expect(deriveSportType('UKC', 'Rally')).toBe('ukc-rally');
  });

  it('returns ukc-obedience for UKC + Obedience', () => {
    expect(deriveSportType('UKC', 'Obedience')).toBe('ukc-obedience');
  });

  it('returns ukc-obedience for UKC + Obedience & Rally', () => {
    expect(deriveSportType('UKC', 'Obedience & Rally')).toBe('ukc-obedience');
  });

  it('returns asca-scent-detection for ASCA + Scent Detection', () => {
    expect(deriveSportType('ASCA', 'Scent Detection')).toBe('asca-scent-detection');
  });

  it('returns null for unknown combos', () => {
    expect(deriveSportType('AKC', 'Agility')).toBeNull();
    expect(deriveSportType('AKC', '')).toBeNull();
    expect(deriveSportType('', 'Scent Work')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/pages/scoring/__tests__/deriveSportType.test.ts`
Expected: FAIL — `deriveSportType` is not exported from `../types`

- [ ] **Step 3: Implement `deriveSportType()`**

Add this function to `apps/myk9show/src/pages/scoring/types.ts`, after the existing `mapSportType()` function (around line 224):

```typescript
/**
 * Derive the sport_type code from an organization and trial discipline.
 * Inverse of mapSportType() — used when creating/editing trials.
 * Returns null for org/discipline combos without a registered scoresheet.
 */
const SPORT_TYPE_BY_ORG_DISCIPLINE: Record<string, string> = {
  'AKC:Scent Work': 'akc-scent-work',
  'AKC:FastCAT': 'akc-fast-cat',
  'UKC:Nosework': 'ukc-nosework',
  'UKC:Rally': 'ukc-rally',
  'UKC:Obedience': 'ukc-obedience',
  'UKC:Obedience & Rally': 'ukc-obedience',
  'ASCA:Scent Detection': 'asca-scent-detection',
};

export function deriveSportType(organization: string, trialType: string): string | null {
  return SPORT_TYPE_BY_ORG_DISCIPLINE[`${organization}:${trialType}`] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/pages/scoring/__tests__/deriveSportType.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/scoring/types.ts \
       apps/myk9show/src/pages/scoring/__tests__/deriveSportType.test.ts
git commit -m "feat(scoring): add deriveSportType() to map org + discipline to sport_type code"
```

---

### Task 2: Add `sportType` to Trial and TrialInput types

**Files:**

- Modify: `apps/myk9show/src/components/trials/types/trial.types.ts`
- Modify: `apps/myk9show/src/store/trial-store-types.ts`

- [ ] **Step 1: Add `sportType` to the `Trial` interface**

In `apps/myk9show/src/components/trials/types/trial.types.ts`, add after `trialType?: string | undefined;` (line 18):

```typescript
  sportType?: string | undefined;
```

- [ ] **Step 2: Add `sportType` to the `TrialInput` interface**

In `apps/myk9show/src/store/trial-store-types.ts`, add after `trialType?: string | undefined;` (line 36):

```typescript
  sportType?: string | undefined;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors (sportType is optional, so all existing code is unaffected)

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/trials/types/trial.types.ts \
       apps/myk9show/src/store/trial-store-types.ts
git commit -m "feat(trials): add sportType field to Trial and TrialInput interfaces"
```

---

### Task 3: Wire `sportType` through wizard trial creation

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`
- Modify: `apps/myk9show/src/store/wizardStore.ts`

- [ ] **Step 1: Update `wizardStore.ts` to use `deriveSportType()`**

In `apps/myk9show/src/store/wizardStore.ts`:

Replace the `SPORT_TYPE_MAP` constant (lines 5-10) and the `addTrial` action's sportType line with:

First, add the import at the top of the file (after the existing imports):

```typescript
import { deriveSportType } from '@/pages/scoring/types';
```

Then remove the `SPORT_TYPE_MAP` constant (lines 5-10):

```typescript
// DELETE these lines:
const SPORT_TYPE_MAP: Record<string, string> = {
  AKC: 'akc-scent-work',
  UKC: 'ukc-nosework',
  ASCA: 'asca-scent-detection',
};
```

In the `addTrial` action (around line 168), replace:

```typescript
sportType: trial.sportType ?? SPORT_TYPE_MAP[state.show.organization] ?? 'akc-scent-work',
```

with:

```typescript
sportType: trial.sportType ?? deriveSportType(state.show.organization, trial.trialType ?? DEFAULT_TRIAL_TYPE[state.show.organization] ?? '') ?? undefined,
```

- [ ] **Step 2: Pass `sportType` in `createTrials()`**

In `apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts`, find the `TrialInput` object in `createTrials` (around line 126-140).

Add `sportType` to the object, after the `trialType` line (line 135):

```typescript
const newTrial: TrialInput = {
  showId,
  showName,
  name: trialName,
  trialDate: wizardTrial.dateTime,
  trialNumber: trialName,
  status: 'Upcoming',
  eventNumber: wizardTrial.eventNumber || '',
  type: trialName,
  trialType: wizardTrial.trialType || showOrganization,
  sportType: wizardTrial.sportType,
  plannedStartTime: wizardTrial.dateTime
    ? format(new Date(wizardTrial.dateTime), 'h:mm a')
    : '09:00 AM',
  order: String(index + 1),
};
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/store/wizardStore.ts \
       apps/myk9show/src/pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts
git commit -m "fix(wizard): pass sportType through trial creation to database"
```

---

### Task 4: Derive `sportType` in trial edit panel on save

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/TrialEditPanel.tsx`
- Modify: `apps/myk9show/src/pages/TrialDetailsPage.tsx`

- [ ] **Step 1: Add `organization` prop to `TrialEditPanel`**

In `apps/myk9show/src/components/panels/edit/TrialEditPanel.tsx`, add to the `TrialEditPanelProps` interface (around line 27):

```typescript
interface TrialEditPanelProps {
  open: boolean;
  onClose: () => void;
  trialId: string;
  trialName: string;
  initialTrialData: Partial<Trial>;
  onSave?: (trialData: Partial<Trial>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  organization?: string;
}
```

- [ ] **Step 2: Import `deriveSportType` and use it in `handleSave`**

At the top of `TrialEditPanel.tsx`, add the import:

```typescript
import { deriveSportType } from '@/pages/scoring/types';
```

In the main `TrialEditPanel` component (around line 548), destructure the new prop:

```typescript
export const TrialEditPanel: React.FC<TrialEditPanelProps> = ({
  open,
  onClose,
  trialName,
  initialTrialData,
  onSave,
  enableAutoSave = false,
  organization,
}) => {
```

Replace the `handleSave` callback (around line 562-570) with:

```typescript
const handleSave = useCallback(
  async (formData: TrialEditFormData) => {
    const trialData = formDataToTrial(formData);
    if (organization && formData.trialType) {
      trialData.sportType = deriveSportType(organization, formData.trialType) ?? undefined;
    }
    if (onSave) {
      await onSave(trialData);
    }
  },
  [onSave, organization]
);
```

- [ ] **Step 3: Pass `organization` from `TrialDetailsPage`**

In `apps/myk9show/src/pages/TrialDetailsPage.tsx`, find the `<TrialEditPanel>` JSX (around line 401). Add the `organization` prop:

```typescript
      <TrialEditPanel
        open={editTrialPanelOpen}
        onClose={() => setEditTrialPanelOpen(false)}
        trialId={currentTrial?.id || ''}
        trialName={currentTrial?.type || currentTrial?.trialNumber || ''}
        initialTrialData={currentTrial || {}}
        organization={showOrganization}
        onSave={async trialData => {
```

Note: `showOrganization` is already defined at line 110 of TrialDetailsPage.tsx:

```typescript
const showOrganization = parentShow?.organization;
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/TrialEditPanel.tsx \
       apps/myk9show/src/pages/TrialDetailsPage.tsx
git commit -m "fix(trial-edit): derive sportType from org + trialType on save"
```

---

### Task 5: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Add a done entry**

Add a new section to `TO-DOS.md` after the last section:

```markdown
## Trial sport_type Not Set During Creation — 2026-03-26

- [x] **Fix sport_type not being set on trials** — Done: Added `deriveSportType(org, trialType)` mapping function in scoring types. Added `sportType` to `Trial` and `TrialInput` interfaces. Wizard `createTrials()` now passes `sportType` from wizard state. Trial edit panel derives `sportType` from org + trialType on save. Replaced `SPORT_TYPE_MAP` in wizardStore with `deriveSportType()`. 9 unit tests for the mapping function. Scoresheets now resolve correctly for all supported org/discipline combos.
```

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark trial sport_type fix as done in TO-DOS"
```
