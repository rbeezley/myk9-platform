/**
 * Tests for `FloatingDoneButton`.
 *
 * Guards against two regressions:
 *  1. The button rendered with the legacy `floating-done-button` semantic
 *     class, which had NO matching CSS rule after the ringside Tailwind
 *     migration — leaving the "Done reordering" floating button bare.
 *  2. The entrance `animate-slide-up` (which animates `transform` with
 *     `forwards` fill) shared an element with transform-based centering
 *     (`-translate-x-1/2`), so the animation overwrote the centering and the
 *     button drifted off-center. The fix centers via flexbox on a wrapper.
 *
 * Uses vanilla vitest assertions (no @testing-library/jest-dom in ringside).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FloatingDoneButton } from './FloatingDoneButton';

describe('FloatingDoneButton', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <FloatingDoneButton isVisible={false} onClick={() => {}} />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders the labeled button when visible', () => {
    render(<FloatingDoneButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Done reordering' });
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Done');
  });

  it('is styled with Tailwind utilities, not the unstyled legacy class', () => {
    const { container } = render(
      <FloatingDoneButton isVisible onClick={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Done reordering' });

    // The legacy semantic class had no CSS rule — it must be gone entirely.
    expect(container.innerHTML).not.toContain('floating-done-button');

    // The button carries the real primary-pill utilities.
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('text-primary-foreground');
    expect(button.className).toContain('rounded-full');

    // The wrapper positions the pill.
    const wrapper = button.parentElement;
    expect(wrapper?.className).toContain('fixed');
  });

  it('centers via flexbox without a transform that animate-slide-up would clobber', () => {
    render(<FloatingDoneButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Done reordering' });
    const wrapper = button.parentElement;

    // Entrance animation lives on the wrapper, which centers with flexbox.
    expect(wrapper?.className).toContain('animate-slide-up');
    expect(wrapper?.className).toContain('justify-center');

    // The bug: `animate-slide-up` (transform, forwards) must NOT co-exist with
    // transform-based centering on the same element.
    expect(wrapper?.className).not.toContain('-translate-x-1/2');

    // ...and the animation must not sit on the button, whose own scale
    // transform it would otherwise overwrite.
    expect(button.className).not.toContain('animate-slide-up');
  });

  it('gates its motion on motion-reduce', () => {
    render(<FloatingDoneButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Done reordering' });
    const wrapper = button.parentElement;

    // Entrance animation disabled under prefers-reduced-motion.
    expect(wrapper?.className).toContain('motion-reduce:animate-none');
    // Press-scale transition disabled too.
    expect(button.className).toContain('motion-reduce:transition-none');
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    render(<FloatingDoneButton isVisible onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done reordering' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
