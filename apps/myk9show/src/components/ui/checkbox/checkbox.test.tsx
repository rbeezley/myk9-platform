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
 * These assertions read the RENDERED svg (its lucide icon class AND its path's `d`
 * geometry, both pulled from the live DOM rather than hardcoded), never a grep over
 * the component's source string (CLAUDE.md LESSONS source-text-tests): a class-string
 * assertion alone would certify a no-op fix, and a class name is one lucide rename
 * away from flipping the test for a non-defect — the path geometry cannot.
 *
 * The glyph is chosen inside Checkbox.Indicator's `render` prop (checkbox.tsx), which
 * must spread `renderProps` onto the indicator <span> for Base UI's own state
 * attributes (`data-checked` / `data-indeterminate`) and sizing classes to land on
 * it. A mutant that drops that spread still swaps the svg correctly, so it would
 * pass every assertion above — these additional checks read the indicator span
 * itself (the svg's parentElement) to catch that.
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
    const checkedPathD = checkedIcon?.querySelector('path')?.getAttribute('d');
    expect(checkedPathD).toBeTruthy();

    const checkedIndicator = checkedIcon?.parentElement;
    expect(checkedIndicator).toHaveAttribute('data-checked');
    expect(checkedIndicator).toHaveClass('h-full');

    rerender(<Checkbox checked={false} indeterminate onChange={() => {}} />);

    const indeterminateBox = screen.getByRole('checkbox');
    const indeterminateIcon = indeterminateBox.querySelector('svg');
    expect(indeterminateIcon).not.toBeNull();
    expect(indeterminateIcon).toHaveClass('lucide-minus');
    expect(indeterminateIcon).not.toHaveClass('lucide-check');
    expect(indeterminateBox).toHaveAttribute('aria-checked', 'mixed');
    const indeterminatePathD = indeterminateIcon?.querySelector('path')?.getAttribute('d');
    expect(indeterminatePathD).toBeTruthy();

    const indeterminateIndicator = indeterminateIcon?.parentElement;
    expect(indeterminateIndicator).toHaveAttribute('data-indeterminate');
    expect(indeterminateIndicator).toHaveClass('h-full');

    // The two states must never draw the same glyph — by class name, which a lucide
    // rename could accidentally leave unchanged on both branches, AND by the actual
    // path geometry, which a class-only regression cannot fake.
    expect(indeterminateIcon?.getAttribute('class')).not.toBe(checkedIcon?.getAttribute('class'));
    expect(indeterminatePathD).not.toBe(checkedPathD);
  });

  it('still renders the completed check glyph when fully checked (no indeterminate prop)', () => {
    render(<Checkbox checked onChange={() => {}} />);
    const box = screen.getByRole('checkbox');
    const icon = box.querySelector('svg');
    expect(icon).toHaveClass('lucide-check');
    expect(box).toHaveAttribute('aria-checked', 'true');
  });
});
