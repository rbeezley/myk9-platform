import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ChecklistItem } from './ChecklistItem';
import type { ResolvedChecklistItem } from '../types';

/**
 * MYK9-591: the auto-completed styling (`data-[checked]:bg-green-500
 * data-[checked]:border-green-500`) previously targeted the Radix-only
 * `data-[state=checked]` attribute, which Base UI's Checkbox.Root never emits
 * (it emits `data-checked` / `data-unchecked`) — so an auto-completed item
 * never rendered green, making it visually identical to a manually ticked one.
 *
 * No live route was confirmed to render a ChecklistItem with an auto-completed
 * entry against seeded staging data (TrialPipelineDetail's checklist is driven
 * by live trial/entry pipeline state, not a fixture reachable from a unit or
 * seeded e2e context), so per the issue's escape hatch this only asserts the
 * `data-checked` attribute lands on the element the Tailwind selector targets.
 * The computed-style (actual green) half is NOT covered here — see the
 * Playwright coverage for ThemeSelector's equivalent selector for the
 * computed-style pattern this would need.
 */

function buildItem(overrides: Partial<ResolvedChecklistItem> = {}): ResolvedChecklistItem {
  return {
    key: 'test-item',
    stage: 1,
    type: 'canned',
    label: 'Test checklist item',
    completed: true,
    completedAt: null,
    completedBy: null,
    autoCompleted: false,
    blocking: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe('ChecklistItem data-checked attribute', () => {
  it('an auto-completed, checked item carries data-checked on its Checkbox root', () => {
    render(
      <ChecklistItem
        item={buildItem({ autoCompleted: true, completed: true })}
        onToggle={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-checked');
    expect(checkbox).not.toHaveAttribute('data-unchecked');
  });

  it('a manually completed (not auto-completed) item also carries data-checked, but without the green classes', () => {
    render(
      <ChecklistItem
        item={buildItem({ autoCompleted: false, completed: true })}
        onToggle={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-checked');
    expect(checkbox.className).not.toContain('data-[checked]:bg-green-500');
  });

  it('an incomplete item carries data-unchecked, not data-checked', () => {
    render(
      <ChecklistItem
        item={buildItem({ autoCompleted: true, completed: false })}
        onToggle={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-unchecked');
    expect(checkbox).not.toHaveAttribute('data-checked');
  });
});
