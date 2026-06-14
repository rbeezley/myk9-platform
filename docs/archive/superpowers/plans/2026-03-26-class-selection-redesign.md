# Class Selection Step Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the registration wizard's class selection step to use compact element cards with level chips, collapsible trial sections, and theme-aware dog tabs.

**Architecture:** Replace the flat `ClassCardRow` list with a two-level grouping: classes grouped by element within collapsible trial sections. New `ElementCard` component renders one card per element with level checkboxes as chips. `TrialSection` provides collapsible wrappers. `DogTabTrigger` updated to use theme accent color.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui (Checkbox, Badge, Collapsible), Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-class-selection-redesign.md`

---

## File Structure

| File                                                                                        | Responsibility                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx` | `TrialSection`, `ElementCard`, `LevelChip`, updated `DogTabTrigger`, keep `NoTrialsAlert`, `NoClassesAlert`, `DogCartSummary`, `OverallCartSummary` |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx`            | Restructured data grouping (trial → element → classes), collapsible trial state, removal of `ScrollArea`                                            |
| `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.types.ts`       | Add `ElementGroup` and `LevelInfo` types                                                                                                            |
| `apps/myk9show/src/styles/myk9-registration-workflow.css`                                   | Add element card + level chip styles, remove old class card row styles                                                                              |
| `apps/myk9show/src/test/components/registration/ElementCard.test.tsx`                       | Unit tests for `ElementCard`                                                                                                                        |
| `apps/myk9show/src/test/components/registration/TrialSection.test.tsx`                      | Unit tests for `TrialSection`                                                                                                                       |
| `apps/myk9show/src/test/components/registration/displayLabel.test.tsx`                      | Unit tests for display label logic                                                                                                                  |

## Deferred to Availability Badge Iteration

- **Availability badges** — spots remaining, full indicator, low-spots warning. Deferred per spec.
- **Waitlist join** — "Join Waitlist" button when a class is full. Depends on availability data. Deferred alongside badges.

## [ADDED] Preserved Features (Not Deferred)

- **Jump height selection** — independent of availability. Must render below the ElementCard when a selected class has `requiresJumpHeight: true`. Addressed in Task 9.

---

### Task 1: Add Types for Element Grouping

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.types.ts`

- [ ] **Step 1: Add `LevelInfo` and `ElementGroup` types**

Add these types after the existing `ClassWithTrial` interface in `ClassSelectionStep.types.ts`:

```typescript
export interface LevelInfo {
  classId: string;
  level: string;
  section: string | undefined;
  displayLabel: string;
  isSelected: boolean;
  isAlreadyEntered: boolean;
  requiresJumpHeight?: boolean; // [ADDED] preserved from old ClassCardRow
}

export interface ElementGroup {
  element: string;
  fee: number;
  levels: LevelInfo[];
  /** True when the element has no levels (e.g., "Detective") — render checkbox inline in header */
  isSingleClass: boolean;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.types.ts
git commit -m "feat(registration): add ElementGroup and LevelInfo types for class selection redesign"
```

---

### Task 2: Write Display Label Tests

**Files:**

- Create: `apps/myk9show/src/test/components/registration/displayLabel.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
import { buildDisplayLabel } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers';

describe('buildDisplayLabel', () => {
  it('returns "level section" when both are present', () => {
    expect(buildDisplayLabel('Novice', 'A')).toBe('Novice A');
  });

  it('returns level alone when section is undefined', () => {
    expect(buildDisplayLabel('Advanced', undefined)).toBe('Advanced');
  });

  it('returns level alone when section is empty string', () => {
    expect(buildDisplayLabel('Advanced', '')).toBe('Advanced');
  });

  it('returns undefined when level is empty', () => {
    expect(buildDisplayLabel('', undefined)).toBeUndefined();
  });

  it('returns undefined when level is empty but section exists', () => {
    // Detective-style: no level, no section — element shown in header
    expect(buildDisplayLabel('', 'A')).toBeUndefined();
  });

  it('handles UKC Nose Work pattern — section at every level', () => {
    expect(buildDisplayLabel('Novice', 'A')).toBe('Novice A');
    expect(buildDisplayLabel('Novice', 'B')).toBe('Novice B');
    expect(buildDisplayLabel('Open', 'A')).toBe('Open A');
    expect(buildDisplayLabel('Open', 'B')).toBe('Open B');
    expect(buildDisplayLabel('Elite', 'A')).toBe('Elite A');
    expect(buildDisplayLabel('Elite', 'B')).toBe('Elite B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/displayLabel.test.tsx 2>&1 | tail -10`
Expected: FAIL — `buildDisplayLabel` is not exported from helpers

---

### Task 3: Implement `buildDisplayLabel`

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers.ts`

- [ ] **Step 1: Add `buildDisplayLabel` function**

Add at the end of `ClassSelectionStep.helpers.ts`:

```typescript
/**
 * Build a display label for a class level+section combination.
 * Always shows section when present (AKC Scent Work: only Novice has A/B;
 * UKC Nose Work: every level has A/B).
 * Returns undefined for level-less elements (e.g., Detective).
 */
export function buildDisplayLabel(level: string, section: string | undefined): string | undefined {
  if (!level) return undefined;
  return [level, section].filter(Boolean).join(' ');
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/displayLabel.test.tsx 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/test/components/registration/displayLabel.test.tsx \
       apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.helpers.ts
git commit -m "feat(registration): add buildDisplayLabel helper with tests"
```

---

### Task 4: Write TrialSection Tests

**Files:**

- Create: `apps/myk9show/src/test/components/registration/TrialSection.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { TrialSection } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';

describe('TrialSection', () => {
  const defaultProps = {
    trialName: 'Saturday Trial 1',
    trialType: 'Scent Work' as string | undefined,
    selectedCount: 3,
    isExpanded: true,
    onToggle: vi.fn(),
  };

  it('renders trial name and type badge', () => {
    render(
      <TrialSection {...defaultProps}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
  });

  it('shows selected count when > 0', () => {
    render(
      <TrialSection {...defaultProps}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('shows "0 selected" in muted style when count is 0', () => {
    render(
      <TrialSection {...defaultProps} selectedCount={0}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('renders children when expanded', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={true}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('hides children when collapsed', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={false}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('calls onToggle when header is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = render(
      <TrialSection {...defaultProps} onToggle={onToggle}>
        <div />
      </TrialSection>
    );
    await user.click(screen.getByText('Saturday Trial 1'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('omits type badge when trialType is undefined', () => {
    render(
      <TrialSection {...defaultProps} trialType={undefined}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Scent Work')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/TrialSection.test.tsx 2>&1 | tail -10`
Expected: FAIL — `TrialSection` not yet exported

---

### Task 5: Implement TrialSection Component

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx`

- [ ] **Step 1: Replace `TrialSectionHeader` with `TrialSection`**

Replace the `TrialSectionHeader` section (lines 96-119) with:

```typescript
// ─── Trial Section (Collapsible) ────────────────────────────────────────────────

interface TrialSectionProps {
  trialName: string;
  trialType?: string | undefined;
  selectedCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const TrialSection: React.FC<TrialSectionProps> = ({
  trialName,
  trialType,
  selectedCount,
  isExpanded,
  onToggle,
  children,
}) => (
  <div className="mb-4">
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between w-full pb-2 border-b cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded-sm transition-colors"
    >
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-90'
          )}
        />
        <h4 className="font-medium text-sm">{trialName || 'Unnamed Trial'}</h4>
        {trialType && (
          <Badge variant="outline" className="text-xs">
            {trialType}
          </Badge>
        )}
      </div>
      <span
        className={cn(
          'text-xs font-medium',
          selectedCount > 0 ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {selectedCount} selected
      </span>
    </button>
    {isExpanded && <div className="mt-3 space-y-2 pl-6">{children}</div>}
  </div>
);
```

Also update the imports at the top — remove `TrialSectionHeader` from the exports and add `TrialSection`.

- [ ] **Step 2: Run TrialSection tests**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/TrialSection.test.tsx 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -10`
Expected: May have errors in ClassSelectionStep.tsx referencing old `TrialSectionHeader` — that's expected, will fix in Task 7

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx \
       apps/myk9show/src/test/components/registration/TrialSection.test.tsx
git commit -m "feat(registration): add collapsible TrialSection component with tests"
```

---

### Task 6: Write ElementCard Tests and Implement

**Files:**

- Create: `apps/myk9show/src/test/components/registration/ElementCard.test.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx`

- [ ] **Step 1: Write the test file**

```typescript
import { render, screen } from '@/test/utils/testUtils';
import { ElementCard } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';
import type { LevelInfo } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.types';

const baseLevels: LevelInfo[] = [
  { classId: 'c1', level: 'Novice', section: 'A', displayLabel: 'Novice A', isSelected: false, isAlreadyEntered: false },
  { classId: 'c2', level: 'Novice', section: 'B', displayLabel: 'Novice B', isSelected: false, isAlreadyEntered: false },
  { classId: 'c3', level: 'Advanced', section: undefined, displayLabel: 'Advanced', isSelected: false, isAlreadyEntered: false },
  { classId: 'c4', level: 'Excellent', section: undefined, displayLabel: 'Excellent', isSelected: false, isAlreadyEntered: false },
  { classId: 'c5', level: 'Masters', section: undefined, displayLabel: 'Masters', isSelected: false, isAlreadyEntered: false },
];

describe('ElementCard', () => {
  const defaultProps = {
    element: 'Handler Discrimination',
    levels: baseLevels,
    fee: 10,
    isSingleClass: false,
    onToggle: vi.fn(),
  };

  it('renders element name and fee', () => {
    render(<ElementCard {...defaultProps} />);
    expect(screen.getByText('Handler Discrimination')).toBeInTheDocument();
    expect(screen.getByText('$10/class')).toBeInTheDocument();
  });

  it('renders all level chips', () => {
    render(<ElementCard {...defaultProps} />);
    expect(screen.getByText('Novice A')).toBeInTheDocument();
    expect(screen.getByText('Novice B')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('Masters')).toBeInTheDocument();
  });

  it('calls onToggle with classId when chip is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = render(<ElementCard {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByText('Advanced'));
    expect(onToggle).toHaveBeenCalledWith('c3');
  });

  it('shows selected chip with accent styling', () => {
    const levels = baseLevels.map(l =>
      l.classId === 'c3' ? { ...l, isSelected: true } : l
    );
    render(<ElementCard {...defaultProps} levels={levels} />);
    const chip = screen.getByText('Advanced').closest('label');
    expect(chip?.className).toContain('border-primary');
  });

  it('shows already-entered chip with teal styling and disabled checkbox', () => {
    const levels = baseLevels.map(l =>
      l.classId === 'c1' ? { ...l, isAlreadyEntered: true } : l
    );
    render(<ElementCard {...defaultProps} levels={levels} />);
    const chip = screen.getByText('Novice A').closest('label');
    expect(chip?.className).toContain('border-teal');
    // Checkbox should be disabled
    const checkbox = chip?.querySelector('input[type="checkbox"], button[role="checkbox"]');
    expect(checkbox).toHaveAttribute('disabled');
  });

  it('renders single-class element with inline checkbox in header', () => {
    const singleLevel: LevelInfo[] = [
      { classId: 'det1', level: '', section: undefined, displayLabel: '', isSelected: false, isAlreadyEntered: false },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={singleLevel}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Detective')).toBeInTheDocument();
    // Should have a checkbox but no level chips
    expect(screen.queryByText('Novice')).not.toBeInTheDocument();
  });

  it('renders fee as "$10" (not "$10/class") for single-class elements', () => {
    const singleLevel: LevelInfo[] = [
      { classId: 'det1', level: '', section: undefined, displayLabel: '', isSelected: false, isAlreadyEntered: false },
    ];
    render(
      <ElementCard
        element="Detective"
        levels={singleLevel}
        fee={10}
        isSingleClass={true}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.queryByText('$10/class')).not.toBeInTheDocument();
  });

  // [ADDED] Edge case: single level WITH a level value shows chips, not inline
  it('renders element with one level as chips when level exists', () => {
    const singleLevelWithLevel: LevelInfo[] = [
      { classId: 'b1', level: 'Advanced', section: undefined, displayLabel: 'Advanced', isSelected: false, isAlreadyEntered: false },
    ];
    render(
      <ElementCard
        element="Buried"
        levels={singleLevelWithLevel}
        fee={10}
        isSingleClass={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText('Buried')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('$10/class')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/ElementCard.test.tsx 2>&1 | tail -10`
Expected: FAIL — `ElementCard` not yet exported

- [ ] **Step 3: Implement `ElementCard` component**

Add to `ClassSelectionStep.components.tsx`, replacing the old `ClassCardRow` component (lines 146-314). Keep the `ClassCardRow` interface temporarily to avoid breaking the parent until Task 7. Add the new component:

```typescript
// ─── Element Card ───────────────────────────────────────────────────────────────

import type { LevelInfo } from './ClassSelectionStep.types';

interface ElementCardProps {
  element: string;
  levels: LevelInfo[];
  fee: number;
  isSingleClass: boolean;
  onToggle: (classId: string) => void;
}

export const ElementCard: React.FC<ElementCardProps> = ({
  element,
  levels,
  fee,
  isSingleClass,
  onToggle,
}) => {
  if (isSingleClass) {
    const cls = levels[0];
    if (!cls) return null;
    return (
      <div className="myk9-element-card myk9-element-card-single">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`single-${cls.classId}`}
              checked={cls.isSelected || cls.isAlreadyEntered}
              disabled={cls.isAlreadyEntered}
              onCheckedChange={() => !cls.isAlreadyEntered && onToggle(cls.classId)}
            />
            <Label
              htmlFor={`single-${cls.classId}`}
              className={cn(
                'font-semibold text-sm cursor-pointer',
                cls.isAlreadyEntered && 'text-teal-600'
              )}
            >
              {element}
            </Label>
            {cls.isAlreadyEntered && (
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
            )}
          </div>
          <span className="text-xs text-muted-foreground">${fee}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="myk9-element-card">
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-semibold text-sm text-card-foreground">{element}</span>
        <span className="text-xs text-muted-foreground">${fee}/class</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {levels.map(cls => (
          <LevelChip
            key={cls.classId}
            classId={cls.classId}
            displayLabel={cls.displayLabel}
            isSelected={cls.isSelected}
            isAlreadyEntered={cls.isAlreadyEntered}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Level Chip ─────────────────────────────────────────────────────────────────

interface LevelChipProps {
  classId: string;
  displayLabel: string;
  isSelected: boolean;
  isAlreadyEntered: boolean;
  onToggle: (classId: string) => void;
}

const LevelChip: React.FC<LevelChipProps> = ({
  classId,
  displayLabel,
  isSelected,
  isAlreadyEntered,
  onToggle,
}) => {
  const isChecked = isSelected || isAlreadyEntered;

  return (
    <label
      className={cn(
        'myk9-level-chip',
        isAlreadyEntered && 'myk9-level-chip-entered',
        isSelected && !isAlreadyEntered && 'myk9-level-chip-selected'
      )}
    >
      <Checkbox
        id={`chip-${classId}`}
        checked={isChecked}
        disabled={isAlreadyEntered}
        onCheckedChange={() => !isAlreadyEntered && onToggle(classId)}
        className="h-3.5 w-3.5"
      />
      <span className="text-xs">{displayLabel}</span>
    </label>
  );
};
```

- [ ] **Step 4: Run ElementCard tests**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/ElementCard.test.tsx 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx \
       apps/myk9show/src/test/components/registration/ElementCard.test.tsx
git commit -m "feat(registration): add ElementCard and LevelChip components with tests"
```

---

### Task 7: Add CSS for Element Cards and Level Chips

**Files:**

- Modify: `apps/myk9show/src/styles/myk9-registration-workflow.css`

- [ ] **Step 1: Add new styles, remove old class card row styles**

Remove the old `.myk9-class-card`, `.myk9-class-card-compact`, `.myk9-class-card-title-compact`, `.myk9-class-card-price-compact`, `.myk9-class-card-details-compact` rules (lines 181-264 approximately).

Add new styles at the same location:

```css
/* ─── Element Card ───────────────────────────────────────────── */

.myk9-element-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--card);
}

.myk9-element-card-single {
  padding: 10px 14px;
}

/* ─── Level Chip ─────────────────────────────────────────────── */

.myk9-level-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--foreground);
  background: var(--background);
  transition:
    border-color 0.15s,
    background-color 0.15s;
  min-width: 80px;
}

.myk9-level-chip:hover {
  border-color: hsl(var(--primary) / 0.5);
  background: hsl(var(--primary) / 0.05);
}

.myk9-level-chip-selected {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}

.myk9-level-chip-entered {
  border-color: #0d9488; /* teal-600 */
  background: rgba(13, 148, 136, 0.1);
  color: #0d9488;
  cursor: default;
}

.myk9-level-chip-entered:hover {
  border-color: #0d9488;
  background: rgba(13, 148, 136, 0.1);
}

/* [ADDED] Mobile responsiveness */
@media (max-width: 480px) {
  .myk9-level-chip {
    min-width: 70px;
    padding: 4px 8px;
    font-size: 12px;
  }

  .myk9-element-card {
    padding: 10px 12px;
  }
}
```

- [ ] **Step 2: Run typecheck to ensure no build issues**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -5`
Expected: May have errors in ClassSelectionStep.tsx — that's expected, will fix in Task 8

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/styles/myk9-registration-workflow.css
git commit -m "style(registration): add element card and level chip CSS, remove old class card styles"
```

---

### Task 8: Update DogTabTrigger to Use Theme Accent Color

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx`

- [ ] **Step 1: Replace hardcoded blue with theme color classes**

In `DogTabTrigger`, replace the className and style props:

Replace:

```typescript
    className={cn(
      'relative inline-flex items-center gap-2 px-5 py-3 -mb-[0.5px]',
      'border-0 border-b-2 font-medium text-sm transition-all duration-200',
      'bg-transparent rounded-none cursor-pointer',
      isActive
        ? [
            'text-blue-600 border-blue-600 font-semibold',
            'data-[state=active]:text-blue-600 data-[state=active]:border-blue-600',
          ]
        : [
            'text-muted-foreground border-transparent hover:text-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent',
          ]
    )}
    style={{
      borderBottomColor: isActive ? '#007AFF' : 'transparent',
      color: isActive ? '#007AFF' : undefined,
    }}
```

With:

```typescript
    className={cn(
      'relative inline-flex items-center gap-2 px-5 py-3 -mb-[0.5px]',
      'border-0 border-b-2 font-medium text-sm transition-all duration-200',
      'bg-transparent rounded-none cursor-pointer',
      isActive
        ? [
            'text-primary border-primary font-semibold',
            'data-[state=active]:text-primary data-[state=active]:border-primary',
          ]
        : [
            'text-muted-foreground border-transparent hover:text-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:border-transparent',
          ]
    )}
```

Remove the `style` prop entirely — no more inline `#007AFF`.

Also update the cart badge in the same component. Replace:

```typescript
style={isActive ? { backgroundColor: '#007AFF' } : {}}
```

With:

```typescript
className={cn(
  'h-5 px-1.5 text-xs flex items-center gap-0.5',
  isActive && 'bg-primary text-primary-foreground'
)}
```

And remove the old `style` prop.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -5`
Expected: May still have errors from ClassSelectionStep.tsx (old imports) — will fix in Task 9

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx
git commit -m "fix(registration): replace hardcoded blue with theme accent color in dog tabs"
```

---

### Task 9: Rewire ClassSelectionStep to Use New Components

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx`

This is the integration task. Replace the flat class list rendering with grouped-by-element data and the new components.

- [ ] **Step 1: Update imports**

Replace:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
```

With:

```typescript
import { Card, CardContent } from '@/components/ui/card';
```

[ADDED] Keep the Select imports (needed for jump height dropdown):

```typescript
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

Replace:

```typescript
import {
  DogTabTrigger,
  TrialSectionHeader,
  NoTrialsAlert,
  NoClassesAlert,
  ClassCardRow,
  DogCartSummary,
  OverallCartSummary,
} from './ClassSelectionStep.components';
```

With:

```typescript
import {
  DogTabTrigger,
  TrialSection,
  NoTrialsAlert,
  NoClassesAlert,
  ElementCard,
  DogCartSummary,
  OverallCartSummary,
} from './ClassSelectionStep.components';
import type { ElementGroup } from './ClassSelectionStep.types';
```

Add to helpers import:

```typescript
import {
  buildAvailabilityMap,
  getDogById,
  getSelectionForDog,
  isClassSelected,
  getClassFee,
  findCartItem,
  getTotalFeesForDog,
  getCartCountForDog,
  addClassToSelections,
  removeClassFromSelections,
  updateJumpHeightInSelections,
  buildDisplayLabel,
} from './ClassSelectionStep.helpers';
```

- [ ] **Step 2: Replace `classesWithTrials` memo with grouped structure**

Replace the existing `classesWithTrials` memo (lines 99-144) with:

```typescript
// Build grouped class data: Map<trialId, ElementGroup[]>
const classesByTrialElement = useMemo(() => {
  const result = new Map<string, ElementGroup[]>();

  for (const trial of showTrials) {
    const classes: SyncableTrialClass[] = trialClasses[trial.id] || [];
    const elementMap = new Map<
      string,
      { classId: string; level: string; section: string; displayLabel: string | undefined }[]
    >();

    // Group classes by element
    const sorted = classes.slice().sort((a, b) => {
      const elemCmp = a.element.localeCompare(b.element);
      if (elemCmp !== 0) return elemCmp;
      return compareLevels(a.level, b.level);
    });

    for (const cls of sorted) {
      const displayLabel = buildDisplayLabel(cls.level, cls.section);
      const entry = {
        classId: cls.id,
        level: cls.level,
        section: cls.section,
        displayLabel: displayLabel ?? '',
      };
      const existing = elementMap.get(cls.element);
      if (existing) {
        existing.push(entry);
      } else {
        elementMap.set(cls.element, [entry]);
      }
    }

    const elementGroups: ElementGroup[] = [];
    for (const [element, classEntries] of elementMap) {
      const isSingleClass = classEntries.length === 1 && !classEntries[0].level;
      elementGroups.push({
        element,
        fee: getClassFee(show, { entryFee: undefined }),
        levels: classEntries.map(entry => ({
          classId: entry.classId,
          level: entry.level,
          section: entry.section,
          displayLabel: entry.displayLabel,
          isSelected: false, // Will be resolved at render time per dog
          isAlreadyEntered: false, // Will be resolved at render time per dog
        })),
        isSingleClass,
      });
    }

    result.set(trial.id, elementGroups);
  }

  return result;
}, [showTrials, trialClasses, show]);

// Flat list of all class IDs for eligibility checking
const allClassIds = useMemo(() => {
  const ids: string[] = [];
  for (const groups of classesByTrialElement.values()) {
    for (const group of groups) {
      for (const level of group.levels) {
        ids.push(level.classId);
      }
    }
  }
  return ids;
}, [classesByTrialElement]);
```

- [ ] **Step 3: Add collapsible trial state**

Add after the existing `useState` declarations (around line 64):

```typescript
const [expandedTrials, setExpandedTrials] = useState<Set<string>>(() => {
  // Auto-expand the first trial
  const firstTrialId = showTrials[0]?.id;
  return firstTrialId ? new Set([firstTrialId]) : new Set();
});

const toggleTrial = useCallback((trialId: string) => {
  setExpandedTrials(prev => {
    const next = new Set(prev);
    if (next.has(trialId)) {
      next.delete(trialId);
    } else {
      next.add(trialId);
    }
    return next;
  });
}, []);
```

- [ ] **Step 4: Replace the render body**

Replace the `<Card>` / `<ScrollArea>` / `<TrialSectionHeader>` / `<ClassCardRow>` render block (lines 290-398 approximately) with:

```typescript
          return (
            <TabsContent key={dogId} value={dogId}>
              <Card>
                <CardContent className="pt-4">
                  {showTrials.length === 0 ? (
                    <NoTrialsAlert />
                  ) : allClassIds.length === 0 ? (
                    <NoClassesAlert trialCount={showTrials.length} />
                  ) : (
                    <div className="space-y-2">
                      {showTrials.map(trial => {
                        const elementGroups = classesByTrialElement.get(trial.id) || [];
                        if (elementGroups.length === 0) return null;

                        // Count selected classes for this trial+dog
                        const selectedCount = elementGroups.reduce((count, group) => {
                          return count + group.levels.filter(l =>
                            isClassSelected(dogId, l.classId, cartItems, classSelections)
                          ).length;
                        }, 0);

                        return (
                          <TrialSection
                            key={`${trial.id}-${dogId}`}
                            trialName={trial.name || 'Unnamed Trial'}
                            trialType={trial.trialType}
                            selectedCount={selectedCount}
                            isExpanded={expandedTrials.has(trial.id)}
                            onToggle={() => toggleTrial(trial.id)}
                          >
                            {elementGroups.map(group => {
                              // [ADDED] Check if any selected class in this group needs jump height
                              const selectedWithJumpHeight = group.levels.filter(l =>
                                l.requiresJumpHeight &&
                                isClassSelected(dogId, l.classId, cartItems, classSelections) &&
                                !getExistingEntry(dogId, l.classId)
                              );

                              return (
                                <React.Fragment key={group.element}>
                                  <ElementCard
                                    element={group.element}
                                    fee={group.fee}
                                    isSingleClass={group.isSingleClass}
                                    levels={group.levels.map(l => ({
                                      ...l,
                                      isSelected: isClassSelected(dogId, l.classId, cartItems, classSelections),
                                      isAlreadyEntered: !!getExistingEntry(dogId, l.classId),
                                    }))}
                                    onToggle={(classId) => handleClassToggle(dogId, trial.id, classId, group.fee)}
                                  />
                                  {/* [ADDED] Jump height selection below element card */}
                                  {selectedWithJumpHeight.map(cls => {
                                    const sel = getSelectionForDog(classSelections, dogId)
                                      .selectedClasses.find(c => c.classId === cls.classId);
                                    return (
                                      <div key={`jh-${cls.classId}`} className="ml-6 flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground">
                                          Jump Height for {cls.displayLabel || group.element}:
                                        </Label>
                                        <Select
                                          value={sel?.jumpHeight || ''}
                                          onValueChange={value =>
                                            onSelectionChange(
                                              updateJumpHeightInSelections(classSelections, dogId, cls.classId, value)
                                            )
                                          }
                                        >
                                          <SelectTrigger className="w-24 h-7 text-xs">
                                            <SelectValue placeholder="Select..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {['8', '12', '16', '20', '24'].map(h => (
                                              <SelectItem key={h} value={h}>{h}&quot;</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </TrialSection>
                        );
                      })}
                    </div>
                  )}
                  <DogCartSummary
                    cartCount={dogCartCount}
                    totalFees={getTotalFeesForDog(cartItems, dogId)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          );
```

Remove the `CardHeader` / `CardTitle` / `ScrollArea` wrapper — the card content now flows naturally without a fixed height.

- [ ] **Step 5: Clean up unused imports**

Remove `ScrollArea`, `CardHeader`, `CardTitle` imports. Remove the `ClassCardRow` import. Remove old `ClassWithTrial` type if no longer used. Remove `TrialSectionHeader` import.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -10`
Expected: 0 errors

- [ ] **Step 7: Run all registration tests**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/ 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.tsx
git commit -m "feat(registration): rewire class selection to use element cards and collapsible trial sections"
```

---

### Task 10: Remove Dead Code

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx`

- [ ] **Step 1: Remove old `ClassCardRow` and badge sub-components**

Remove `ClassCardRow`, `IneligibleBadge`, `WarningsBadge`, `AvailabilityBadge`, `WaitlistBadge` components and their interfaces. These are no longer referenced (availability badges are deferred per spec).

Also remove unused imports: `Users`, `Clock`, `AlertTriangle`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Alert`, `AlertDescription`, `Button`, `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`, `EligibilityResult` type.

Keep: `ChevronRight`, `CheckCircle2`, `ShoppingCart`, `Info`, `Checkbox`, `Label`, `Badge`, `TabsTrigger`, `cn`, `Dog` type.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && npx tsc --noEmit --project tsconfig.app.json 2>&1 | tail -5`
Expected: 0 errors

- [ ] **Step 3: Run all tests**

Run: `cd apps/myk9show && npx vitest run src/test/components/registration/ 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/ClassSelectionStep.components.tsx
git commit -m "refactor(registration): remove old ClassCardRow and unused badge components"
```

---

### Task 11: Visual Verification

- [ ] **Step 1: Start the dev server**

Run: `cd /path/to/myk9-platform && pnpm dev:show`

- [ ] **Step 2: Navigate to the registration wizard**

Go to a show detail page → Entries tab → Add Entry (or directly to `/secretary/register/<showId>`). Advance to the "Classes" step.

- [ ] **Step 3: Verify visually**

Check:

- Dog tabs use theme accent color (purple in the current theme), not hardcoded blue
- Element cards show with element name as header + level chips inside
- "Novice A" and "Novice B" display correctly for elements with sections
- Detective (or similar level-less elements) shows inline checkbox in card header
- Collapsible trial sections: first trial expanded, others collapsed
- Clicking trial header expands/collapses
- Selected count updates in trial header when toggling chips
- Already-entered classes show teal styling with disabled checkbox
- New selections show accent color styling
- No fixed 350px scroll area — content flows naturally
- Cart summary still works at bottom

- [ ] **Step 4: Final commit if any visual tweaks needed**

```bash
git add -u
git commit -m "fix(registration): visual polish for class selection redesign"
```
