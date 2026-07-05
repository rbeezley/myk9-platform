/**
 * Tests for `SuccessToast`.
 *
 * Guards against a regression where the toast rendered with the legacy
 * `success-toast` semantic class, which had NO matching CSS rule after
 * the ringside Tailwind migration — leaving the success notification
 * bare and unstyled. These tests pin that the toast now carries real
 * Tailwind utilities on the markup (the ringside idiom the host build
 * scans and generates) and announces itself to assistive tech.
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
    render(<SuccessToast isVisible message="Saved" />);
    const toast = screen.getByRole('status');

    // The legacy semantic class had no CSS rule — it must be gone.
    expect(toast.classList.contains('success-toast')).toBe(false);

    // It must be a fixed/floating success surface carrying real utilities.
    expect(toast.className).toContain('fixed');
    expect(toast.className).toContain('bg-success');
    expect(toast.className).toContain('text-success-foreground');
    expect(toast.className).toContain('rounded-full');
  });

  it('gates its motion on motion-reduce', () => {
    render(<SuccessToast isVisible message="Saved" />);
    const toast = screen.getByRole('status');

    expect(toast.className).toContain('animate-slide-up');
    expect(toast.className).toContain('motion-reduce:animate-none');
    expect(toast.className).toContain('motion-reduce:transition-none');
  });
});
