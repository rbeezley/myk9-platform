# Run Order Preset System — myK9Show Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Set Run Order" button to the ClassResultsTable that opens a preset picker dialog, letting secretaries apply armband-asc, armband-desc, random, or manual drag-and-drop ordering in one click — writing to the shared `run_order` column visible to both myK9Show and myK9Q.

**Architecture:** Pure calculation logic lives in `src/lib/runOrderUtils.ts`. A `useRunOrderPreset` hook handles the batch DB mutation and cache invalidation. A `RunOrderDialog` shadcn component owns its own loading state by awaiting the `onApply` promise. The existing drag-and-drop (`useRunOrderDrag`) is unchanged — "Manual" in the dialog simply closes it while drag handles remain visible.

**Tech Stack:** React, TypeScript, shadcn/ui (`Dialog`, `Button`), `@tanstack/react-query` (`useQueryClient`), `replicatedEntriesTable.updateEntry`, Vitest + React Testing Library.

---

## File Map

| Action | Path                                                                                         | Responsibility                                           |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Create | `apps/myk9show/src/lib/runOrderUtils.ts`                                                     | `RunOrderPreset` type, `calculateRunOrder` pure function |
| Create | `apps/myk9show/src/lib/__tests__/runOrderUtils.test.ts`                                      | Unit tests for calculation logic                         |
| Create | `apps/myk9show/src/components/classes/RunOrderDialog.tsx`                                    | shadcn dialog with 4 preset cards                        |
| Create | `apps/myk9show/src/components/classes/__tests__/RunOrderDialog.test.tsx`                     | Component tests                                          |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderPreset.ts`                | Batch mutation hook                                      |
| Create | `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts` | Hook tests                                               |
| Modify | `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`                           | Add "Set Run Order" button + dialog                      |

---

## Task 1: Calculation Logic (`runOrderUtils.ts`)

**Files:**

- Create: `apps/myk9show/src/lib/runOrderUtils.ts`
- Create: `apps/myk9show/src/lib/__tests__/runOrderUtils.test.ts`

### Step 1: Write the failing tests

Create `apps/myk9show/src/lib/__tests__/runOrderUtils.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { calculateRunOrder } from '../runOrderUtils';

const entries = [
  { id: 'e1', armband: '3' },
  { id: 'e2', armband: '1' },
  { id: 'e3', armband: '2' },
];

describe('calculateRunOrder', () => {
  describe('armband-asc', () => {
    it('sorts entries by armband ascending', () => {
      const result = calculateRunOrder(entries, 'armband-asc');
      expect(result.map(r => r.id)).toEqual(['e2', 'e3', 'e1']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'armband-asc');
      expect(result.map(r => r.runOrder)).toEqual([1, 2, 3]);
    });

    it('sorts null armband entries first (parsed as 0)', () => {
      const withNull = [
        { id: 'eX', armband: null },
        { id: 'e5', armband: '5' },
      ];
      const result = calculateRunOrder(withNull, 'armband-asc');
      expect(result[0].id).toBe('eX');
    });
  });

  describe('armband-desc', () => {
    it('sorts entries by armband descending', () => {
      const result = calculateRunOrder(entries, 'armband-desc');
      expect(result.map(r => r.id)).toEqual(['e1', 'e3', 'e2']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'armband-desc');
      expect(result.map(r => r.runOrder)).toEqual([1, 2, 3]);
    });

    it('sorts null armband entries last (parsed as 0, smallest value)', () => {
      const withNull = [
        { id: 'eX', armband: null },
        { id: 'e5', armband: '5' },
      ];
      const result = calculateRunOrder(withNull, 'armband-desc');
      expect(result[result.length - 1].id).toBe('eX');
    });
  });

  describe('random', () => {
    it('returns all entries', () => {
      const result = calculateRunOrder(entries, 'random');
      expect(result).toHaveLength(3);
      expect(result.map(r => r.id).sort()).toEqual(['e1', 'e2', 'e3']);
    });

    it('assigns 1-based run orders with no gaps', () => {
      const result = calculateRunOrder(entries, 'random');
      expect(result.map(r => r.runOrder).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    });

    it('shuffles order (seeded Math.random mock)', () => {
      let call = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => (call++ % 2 === 0 ? 0.9 : 0.1));
      const result = calculateRunOrder(entries, 'random');
      expect(result.map(r => r.id)).not.toEqual(['e1', 'e2', 'e3']);
      vi.restoreAllMocks();
    });
  });

  describe('manual', () => {
    it('returns empty array without touching entries', () => {
      expect(calculateRunOrder(entries, 'manual')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      expect(calculateRunOrder([], 'armband-asc')).toEqual([]);
    });

    it('returns single entry with runOrder 1', () => {
      const result = calculateRunOrder([{ id: 'e1', armband: '5' }], 'armband-asc');
      expect(result).toEqual([{ id: 'e1', runOrder: 1 }]);
    });

    it('does not mutate the input array', () => {
      const input = [
        { id: 'e1', armband: '3' },
        { id: 'e2', armband: '1' },
      ];
      const copy = [...input];
      calculateRunOrder(input, 'armband-asc');
      expect(input).toEqual(copy);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/lib/__tests__/runOrderUtils.test.ts
```

Expected: all tests fail with `Cannot find module '../runOrderUtils'`.

- [ ] **Step 3: Implement `runOrderUtils.ts`**

Create `apps/myk9show/src/lib/runOrderUtils.ts`:

```typescript
export type RunOrderPreset = 'armband-asc' | 'armband-desc' | 'random' | 'manual';

export interface RunOrderEntry {
  id: string;
  armband: string | null;
}

export interface RunOrderResult {
  id: string;
  runOrder: number;
}

function parseArmband(armband: string | null): number {
  const n = parseInt(armband ?? '0', 10);
  return isNaN(n) ? 0 : n;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function calculateRunOrder(
  entries: RunOrderEntry[],
  preset: RunOrderPreset
): RunOrderResult[] {
  if (preset === 'manual') return [];

  let sorted: RunOrderEntry[];

  if (preset === 'armband-asc') {
    sorted = [...entries].sort((a, b) => parseArmband(a.armband) - parseArmband(b.armband));
  } else if (preset === 'armband-desc') {
    sorted = [...entries].sort((a, b) => parseArmband(b.armband) - parseArmband(a.armband));
  } else {
    // random
    sorted = shuffleArray([...entries]);
  }

  return sorted.map((entry, index) => ({ id: entry.id, runOrder: index + 1 }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/lib/__tests__/runOrderUtils.test.ts
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/lib/runOrderUtils.ts apps/myk9show/src/lib/__tests__/runOrderUtils.test.ts
git commit -m "feat(myk9show): add runOrderUtils — preset calculation logic"
```

---

## Task 2: RunOrderDialog Component

**Files:**

- Create: `apps/myk9show/src/components/classes/RunOrderDialog.tsx`
- Create: `apps/myk9show/src/components/classes/__tests__/RunOrderDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/components/classes/__tests__/RunOrderDialog.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RunOrderDialog } from '../RunOrderDialog';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  entryCount: 5,
  onApply: vi.fn().mockResolvedValue(undefined),
};

describe('RunOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onApply.mockResolvedValue(undefined);
  });

  it('renders all 4 preset options', () => {
    render(<RunOrderDialog {...defaultProps} />);
    expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
    expect(screen.getByText('Armband High to Low')).toBeInTheDocument();
    expect(screen.getByText('Random Shuffle')).toBeInTheDocument();
    expect(screen.getByText('Manual Drag and Drop')).toBeInTheDocument();
  });

  it('Apply button is disabled when nothing is selected', () => {
    render(<RunOrderDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('Apply button is enabled after selecting a preset', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('calls onApply with armband-asc when that preset is selected', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(defaultProps.onApply).toHaveBeenCalledWith('armband-asc');
  });

  it('calls onApply with manual when Manual Drag and Drop is selected', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Manual Drag and Drop'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(defaultProps.onApply).toHaveBeenCalledWith('manual');
  });

  it('calls onOpenChange(false) after successful apply', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Random Shuffle'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows Applying... text and disables buttons while applying', async () => {
    defaultProps.onApply.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 200))
    );
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled()
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('stays open and re-enables Apply when onApply throws', async () => {
    defaultProps.onApply.mockRejectedValue(new Error('network error'));
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
    );
    expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('displays the entry count in the description', () => {
    render(<RunOrderDialog {...defaultProps} entryCount={12} />);
    expect(screen.getByText(/12 entries/)).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<RunOrderDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Set Run Order')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/components/classes/__tests__/RunOrderDialog.test.tsx
```

Expected: all tests fail with `Cannot find module '../RunOrderDialog'`.

- [ ] **Step 3: Implement `RunOrderDialog.tsx`**

Create `apps/myk9show/src/components/classes/RunOrderDialog.tsx`:

```typescript
import React, { useState } from 'react';
import { ArrowUpDown, Shuffle, GripVertical } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RunOrderPreset } from '@/lib/runOrderUtils';

interface RunOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryCount: number;
  onApply: (preset: RunOrderPreset) => Promise<void>;
}

const PRESETS: {
  preset: RunOrderPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    preset: 'armband-asc',
    label: 'Armband Low to High',
    description: 'Sort entries by armband number (ascending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'armband-desc',
    label: 'Armband High to Low',
    description: 'Sort entries by armband number (descending)',
    icon: <ArrowUpDown className="h-5 w-5" />,
  },
  {
    preset: 'random',
    label: 'Random Shuffle',
    description: 'Completely randomize entry order',
    icon: <Shuffle className="h-5 w-5" />,
  },
  {
    preset: 'manual',
    label: 'Manual Drag and Drop',
    description: 'Manually reorder entries by dragging',
    icon: <GripVertical className="h-5 w-5" />,
  },
];

export const RunOrderDialog: React.FC<RunOrderDialogProps> = ({
  open,
  onOpenChange,
  entryCount,
  onApply,
}) => {
  const [selected, setSelected] = useState<RunOrderPreset | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  React.useEffect(() => {
    if (open) setSelected(null);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (isApplying) return;
    onOpenChange(next);
  };

  const handleApply = async () => {
    if (!selected) return;
    setIsApplying(true);
    try {
      await onApply(selected);
      onOpenChange(false);
    } catch {
      // error toast already shown by the hook
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={isApplying ? e => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>Set Run Order</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Choose how to order the {entryCount}{' '}
          {entryCount === 1 ? 'entry' : 'entries'} in this class:
        </p>

        <div className="flex flex-col gap-2">
          {PRESETS.map(({ preset, label, description, icon }) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSelected(preset)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                selected === preset
                  ? 'border-primary bg-accent'
                  : 'border-border bg-background'
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {icon}
              </div>
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{description}</div>
              </div>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selected || isApplying}>
            {isApplying ? 'Applying...' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/components/classes/__tests__/RunOrderDialog.test.tsx
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/RunOrderDialog.tsx \
        apps/myk9show/src/components/classes/__tests__/RunOrderDialog.test.tsx
git commit -m "feat(myk9show): add RunOrderDialog — preset picker with 4 options"
```

---

## Task 3: Batch Mutation Hook (`useRunOrderPreset`)

**Files:**

- Create: `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderPreset.ts`
- Create: `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunOrderPreset } from '../useRunOrderPreset';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

const mockUpdateEntry = vi.fn().mockResolvedValue(undefined);
const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);
const mockNotificationsError = vi.fn();

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { updateEntry: mockUpdateEntry },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: mockNotificationsError, success: vi.fn() },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...(actual as object),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

function makeEntry(id: string, armband: string): RawEntryRow {
  return {
    id,
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband,
    handler: null,
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: null,
    run_order: 1,
    dog: null,
    created_at: null,
    updated_at: null,
  };
}

const entries = [makeEntry('e1', '3'), makeEntry('e2', '1'), makeEntry('e3', '2')];

describe('useRunOrderPreset', () => {
  beforeEach(() => vi.clearAllMocks());

  // [EXPANDED] Use toHaveBeenCalledWith (not NthCalledWith) — parallel writes via
  // Promise.allSettled don't guarantee call order matches sorted order.
  it('calls updateEntry for each entry with the correct runOrder value', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockUpdateEntry).toHaveBeenCalledTimes(3);
    // e2 (armband 1) → runOrder 1, e3 (armband 2) → runOrder 2, e1 (armband 3) → runOrder 3
    expect(mockUpdateEntry).toHaveBeenCalledWith('e2', { runOrder: 1 });
    expect(mockUpdateEntry).toHaveBeenCalledWith('e3', { runOrder: 2 });
    expect(mockUpdateEntry).toHaveBeenCalledWith('e1', { runOrder: 3 });
  });

  // [ADDED] Partial failure: some writes succeed, one fails
  it('shows error toast and re-throws when any updateEntry call fails', async () => {
    mockUpdateEntry
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await expect(act(() => result.current.applyPreset('armband-asc'))).rejects.toThrow();
    expect(mockNotificationsError).toHaveBeenCalledWith('Failed to set run order');
    // Secretary re-applies the same preset to fix the partial write state.
  });

  it('invalidates the class entries query key on success', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['classes', 'c1', 'entries'],
    });
  });

  it('isApplying is false after successful apply', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(result.current.isApplying).toBe(false);
  });

  it('calls notifications.error and re-throws on updateEntry failure', async () => {
    mockUpdateEntry.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await expect(act(() => result.current.applyPreset('armband-asc'))).rejects.toThrow();
    expect(mockNotificationsError).toHaveBeenCalledWith('Failed to set run order');
  });

  it('isApplying is false after a failure', async () => {
    mockUpdateEntry.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    try {
      await act(() => result.current.applyPreset('armband-asc'));
    } catch {
      // expected
    }
    expect(result.current.isApplying).toBe(false);
  });

  it('does not call updateEntry when classId is undefined', async () => {
    const { result } = renderHook(() => useRunOrderPreset(undefined, entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('does not call updateEntry for manual preset', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('manual'));
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('does not invalidate query for manual preset', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('manual'));
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts
```

Expected: all tests fail with `Cannot find module '../useRunOrderPreset'`.

- [ ] **Step 3: Implement `useRunOrderPreset.ts`**

Create `apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderPreset.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { notifications } from '@/lib/notifications';
import { calculateRunOrder } from '@/lib/runOrderUtils';
import type { RunOrderPreset } from '@/lib/runOrderUtils';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

/**
 * Applies a run order preset to all entries in the class.
 * Writes are parallel via Promise.allSettled (matches useRunOrderDrag pattern).
 * On partial failure (some writes succeed, some fail), shows an error toast
 * and re-throws so the calling dialog stays open for retry. Re-applying the
 * same preset overwrites all entries, fixing any partially-written state.
 */
export function useRunOrderPreset(classId: string | undefined, rawEntries: RawEntryRow[]) {
  const [isApplying, setIsApplying] = useState(false);
  const queryClient = useQueryClient();

  const applyPreset = useCallback(
    async (preset: RunOrderPreset): Promise<void> => {
      if (!classId || preset === 'manual') return;

      setIsApplying(true);
      try {
        const updates = calculateRunOrder(
          rawEntries.map(e => ({ id: e.id, armband: e.armband })),
          preset
        );
        // [EXPANDED] Parallel writes — matches useRunOrderDrag precedent, avoids
        // sequential latency (~50ms per entry × N entries for sequential).
        const results = await Promise.allSettled(
          updates.map(({ id, runOrder }) => replicatedEntriesTable.updateEntry(id, { runOrder }))
        );
        if (results.some(r => r.status === 'rejected')) {
          throw new Error('Run order update failed');
        }
        await queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      } catch {
        notifications.error('Failed to set run order');
        throw new Error('Run order update failed');
      } finally {
        setIsApplying(false);
      }
    },
    [classId, rawEntries, queryClient]
  );

  return { applyPreset, isApplying };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && npx vitest run src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/useRunOrderPreset.ts \
        apps/myk9show/src/components/classes/ClassResultsTable/__tests__/useRunOrderPreset.test.ts
git commit -m "feat(myk9show): add useRunOrderPreset — batch run order mutation hook"
```

---

## Task 4: Integration — "Set Run Order" Button in ClassResultsTable

**Files:**

- Modify: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

Read the file before editing: `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`

- [ ] **Step 1: Add imports**

At the top of `apps/myk9show/src/components/classes/ClassResultsTable/index.tsx`, add these imports alongside the existing ones:

```typescript
import { ListOrdered } from 'lucide-react';
import { RunOrderDialog } from '../RunOrderDialog';
import { useRunOrderPreset } from './useRunOrderPreset';
```

(`ListOrdered` is a lucide icon — a numbered list, appropriate for run order.)

- [ ] **Step 2: Add state and hook inside the component**

Inside `ClassResultsTable`, after the existing `useState` declarations (around line 91), add:

```typescript
const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
const { applyPreset } = useRunOrderPreset(classId, rawEntries ?? []);
```

- [ ] **Step 3: Add the "Set Run Order" button to the toolbar**

In the header toolbar `<div className="flex items-center gap-2">`, add the button **before** the Requirements button. The existing block looks like:

```tsx
<div className="flex items-center gap-2">
  {classId && (
    <ViewToggle
      modes={CARD_TABLE_MODES}
      active={effectiveViewMode}
      onChange={setViewMode}
    />
  )}
  {onOpenRequirements && (
    <Button variant="outline" size="sm" onClick={onOpenRequirements}>
```

Replace it with:

```tsx
<div className="flex items-center gap-2">
  {classId && (
    <ViewToggle
      modes={CARD_TABLE_MODES}
      active={effectiveViewMode}
      onChange={setViewMode}
    />
  )}
  {canEdit && !isClosed && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setRunOrderDialogOpen(true)}
    >
      <ListOrdered className="h-4 w-4" />
      <span>Set Run Order</span>
    </Button>
  )}
  {onOpenRequirements && (
    <Button variant="outline" size="sm" onClick={onOpenRequirements}>
```

- [ ] **Step 4: Render the dialog**

At the very end of the component's return, after the closing `</TooltipProvider>` tag and before the final `);`, add:

```tsx
<RunOrderDialog
  open={runOrderDialogOpen}
  onOpenChange={setRunOrderDialogOpen}
  entryCount={entries.length}
  onApply={applyPreset}
/>
```

The full end of the return should look like:

```tsx
      <StatusPickerDialog
        open={statusPickerEntry !== null}
        onOpenChange={open => {
          if (!open) setStatusPickerEntry(null);
        }}
        entry={statusPickerEntry ?? { entryId: '', armband: '', dogName: '', handlerName: '' }}
        currentStatus={statusPickerEntry?.currentStatus ?? 'no-status'}
        onStatusChange={handleStatusChange}
        isStaff={isStaff}
        disabled={!isStaff && !visibility.selfCheckinEnabled}
      />
      <RunOrderDialog
        open={runOrderDialogOpen}
        onOpenChange={setRunOrderDialogOpen}
        entryCount={entries.length}
        onApply={applyPreset}
      />
    </TooltipProvider>
  );
```

- [ ] **Step 5: Typecheck and lint**

```bash
cd /path/to/myk9-platform && pnpm typecheck
cd apps/myk9show && pnpm lint
```

Expected: no errors. If there are import errors, verify `ListOrdered` is available in the installed version of `lucide-react`:

```bash
node -e "const { ListOrdered } = require('lucide-react'); console.log(typeof ListOrdered)"
```

If `ListOrdered` is not available, use `ArrowUpDown` instead (already imported).

- [ ] **Step 6: Run the full test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all existing tests pass plus the new tests from Tasks 1–3.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/classes/ClassResultsTable/index.tsx
git commit -m "feat(myk9show): wire RunOrderDialog into ClassResultsTable toolbar"
```

---

## Post-Integration Smoke Test

Manual verification steps (run `pnpm dev:show`):

1. Navigate to a class details page as a secretary
2. Verify "Set Run Order" button appears in the Entries & Results card header
3. Click the button — dialog opens with all 4 preset cards
4. Verify Apply is disabled until a preset is selected
5. Select "Armband Low to High" and click Apply — entries reorder in the table
6. Reopen dialog, select "Manual Drag and Drop" — dialog closes, drag handles visible
7. Verify "Set Run Order" button is hidden when viewing as an exhibitor

---

## Self-Review Checklist

- [x] **Spec coverage:** `runOrderUtils` (Task 1), `RunOrderDialog` (Task 2), `useRunOrderPreset` (Task 3), integration button+dialog (Task 4) — all spec sections covered
- [x] **Placeholder scan:** No TBDs, all code blocks are complete
- [x] **Type consistency:** `RunOrderPreset` defined in Task 1 and imported in Tasks 2, 3, 4. `RunOrderEntry` / `RunOrderResult` defined in Task 1. `RawEntryRow` imported from existing `useClassEntriesRaw`. `applyPreset` signature consistent across hook definition and dialog `onApply` prop.
- [x] **Re-throw behavior:** Hook re-throws after calling `notifications.error` so dialog can stay open for retry — this is consistent with the test in Task 3 (`rejects.toThrow`) and the dialog test (`stays open when onApply throws`)
