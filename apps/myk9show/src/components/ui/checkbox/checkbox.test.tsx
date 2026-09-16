import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Checkbox } from './checkbox';

/**
 * Base UI mounts Checkbox.Indicator on `checked || indeterminate`
 * (CheckboxIndicator.rendered), so a partially-selected checkbox and a fully-checked
 * one both draw an indicator glyph. Before this fix both branches rendered the same
 * <Check /> icon, so "some selected" was visually indistinguishable from "all
 * selected" (MYK9-590) even though aria-checked correctly reported "mixed".
 *
 * These assertions read the RENDERED svg (its lucide icon class), never a grep over
 * the component's source string (CLAUDE.md LESSONS source-text-tests): a class-string
 * assertion would certify a no-op fix.
 */
describe('Checkbox indeterminate state', () => {
  it('renders a distinct glyph for indeterminate vs. checked, and reports aria-checked="mixed"', () => {
    const { rerender } = render(<Checkbox checked indeterminate={false} onChange={() => {}} />);

    const checkedBox = screen.getByRole('checkbox');
    const checkedIcon = checkedBox.querySelector('svg');
    expect(checkedIcon).not.toBeNull();
    expect(checkedIcon).toHaveClass('lucide-check');
    expect(checkedIcon).not.toHaveClass('lucide-minus');
    expect(checkedBox).toHaveAttribute('aria-checked', 'true');

    rerender(<Checkbox checked={false} indeterminate onChange={() => {}} />);

    const indeterminateBox = screen.getByRole('checkbox');
    const indeterminateIcon = indeterminateBox.querySelector('svg');
    expect(indeterminateIcon).not.toBeNull();
    expect(indeterminateIcon).toHaveClass('lucide-minus');
    expect(indeterminateIcon).not.toHaveClass('lucide-check');
    expect(indeterminateBox).toHaveAttribute('aria-checked', 'mixed');

    // The two states must never draw the same glyph.
    expect(indeterminateIcon?.getAttribute('class')).not.toBe(checkedIcon?.getAttribute('class'));
  });

  it('still renders the completed check glyph when fully checked (no indeterminate prop)', () => {
    render(<Checkbox checked onChange={() => {}} />);
    const box = screen.getByRole('checkbox');
    const icon = box.querySelector('svg');
    expect(icon).toHaveClass('lucide-check');
    expect(box).toHaveAttribute('aria-checked', 'true');
  });
});
