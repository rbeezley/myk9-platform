import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ChecklistItem } from './ChecklistItem';
import type { ResolvedChecklistItem } from '../types';

/**
 * MYK9-591: the auto-completed styling previously targeted the Radix-only
 * `data-[state=checked]` attribute, which Base UI's Checkbox.Root never
 * emits (it emits `data-checked` / `data-unchecked`) — so an auto-completed
 * item never rendered its "the system did this" color, making it visually
 * identical to a manually ticked one.
 *
 * The color itself is `bg-success` / `border-success` / `text-success-foreground`
 * (the repo's WCAG-AA-verified semantic token, `--success` in
 * apps/myk9show/src/index.css, pinned by
 * src/test/branding/semanticStatusTokens.test.ts), not a raw `bg-green-500` —
 * a raw green-500 fill combined with checkbox.tsx's own
 * `data-[checked]:text-primary-foreground` (white check glyph) fails contrast
 * in light mode (~2.3:1, below the 3:1 non-text minimum).
 *
 * jsdom does not compute Tailwind styles (LESSONS source-text-tests), so
 * asserting `data-checked` alone does not guard the fix: Base UI puts that
 * attribute on the Checkbox root regardless of className, so it is present
 * even if `ChecklistItem.tsx` is reverted to the dead `data-[state=checked]`
 * selector. Every assertion here is therefore STRUCTURAL — it ties the
 * `data-checked`/`data-unchecked` attribute to the presence/absence of the
 * exact `data-[checked]:bg-success` class token on the SAME element, which
 * DOES regress if the selector prefix reverts to `data-[state=checked]`.
 * Verified by mutation: reverting ChecklistItem.tsx:40 to
 * `data-[state=checked]:bg-success data-[state=checked]:border-success
 * data-[state=checked]:text-success-foreground` turns the first test red
 * (the class regex no longer matches).
 *
 * No live route was confirmed to render a ChecklistItem with an auto-completed
 * entry against seeded staging data (TrialPipelineDetail's checklist is driven
 * by live trial/entry pipeline state, not a fixture reachable from a unit or
 * seeded e2e context), so the actual rendered-color proof is NOT here — see
 * ThemeSelector's Playwright computed-`border-color` spec for that pattern;
 * the suite map notes no staging route reaches an auto-completed item for a
 * pipeline-checklist equivalent.
 */

const SUCCESS_CLASS_PATTERN = /data-\[checked\]:bg-success/;

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

describe('ChecklistItem: data-checked carries the success Base UI selector, not the dead Radix one', () => {
  it('an auto-completed, checked item carries BOTH data-checked and the data-[checked] success class on the same element', () => {
    render(
      <ChecklistItem
        item={buildItem({ autoCompleted: true, completed: true })}
        onToggle={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-checked');
    expect(checkbox).not.toHaveAttribute('data-unchecked');
    expect(checkbox.className).toMatch(SUCCESS_CLASS_PATTERN);
  });

  it('a manually completed (not auto-completed) item carries data-checked but NEVER the success class', () => {
    render(
      <ChecklistItem
        item={buildItem({ autoCompleted: false, completed: true })}
        onToggle={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('data-checked');
    expect(checkbox.className).not.toMatch(SUCCESS_CLASS_PATTERN);
  });

  it('an incomplete item carries data-unchecked, not data-checked, regardless of the success class', () => {
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
