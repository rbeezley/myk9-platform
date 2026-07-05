/**
 * Tests for `SuccessToast`.
 *
 * Guards against:
 *  1. The legacy `success-toast` semantic class, which had NO matching CSS rule
 *     after the ringside Tailwind migration — leaving the toast unstyled.
 *  2. A transform-based entrance animation clobbering transform-based centering:
 *     the wrapper centers via flexbox, never `-translate-x-1/2`.
 *  3. The entrance following the shared motion language (duration-enter/ease-enter
 *     tokens, no bounce) and gating on reduced motion.
 *
 * Uses vanilla vitest assertions (no @testing-library/jest-dom in ringside).
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SuccessToast } from './SuccessToast';

describe('SuccessToast', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <SuccessToast isVisible={false} message="Saved" />,
    );
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders the message in a polite live region when visible', () => {
    render(<SuccessToast isVisible message="Run order updated successfully" />);
    const toast = screen.getByRole('status');
    expect(toast).toBeTruthy();
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.textContent).toContain('Run order updated successfully');
  });

  it('is styled with Tailwind utilities, not the unstyled legacy class', () => {
    const { container } = render(<SuccessToast isVisible message="Saved" />);
    const toast = screen.getByRole('status');

    // The legacy semantic class had no CSS rule — it must be gone entirely.
    expect(container.innerHTML).not.toContain('success-toast');

    // The toast pill carries the real success-surface utilities.
    expect(toast.className).toContain('bg-success');
    expect(toast.className).toContain('text-success-foreground');
    expect(toast.className).toContain('rounded-full');

    // The wrapper positions the pill.
    const wrapper = toast.parentElement;
    expect(wrapper?.className).toContain('fixed');
  });

  it('centers via flexbox without a transform that the entrance animation would clobber', () => {
    render(<SuccessToast isVisible message="Saved" />);
    const wrapper = screen.getByRole('status').parentElement;

    // Entrance animation lives on the wrapper, which centers with flexbox.
    expect(wrapper?.className).toContain('justify-center');

    // The bug: a transform-animating entrance must NOT co-exist with
    // transform-based centering on the same element.
    expect(wrapper?.className).not.toContain('-translate-x-1/2');
  });

  it('uses the shared motion tokens for its entrance and gates on reduced motion', () => {
    render(<SuccessToast isVisible message="Saved" />);
    const wrapper = screen.getByRole('status').parentElement;

    // Motion-language entrance: fade + small rise, duration-enter token, no bounce.
    expect(wrapper?.className).toContain('animate-in');
    expect(wrapper?.className).toContain('duration-enter');
    expect(wrapper?.className).toContain('ease-enter');
    expect(wrapper?.className).toContain('motion-reduce:animate-none');
  });
});
