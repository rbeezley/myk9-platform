/**
 * Tests for `FloatingDoneButton`.
 *
 * Guards against a regression where the button rendered with the legacy
 * `floating-done-button` semantic class, which had NO matching CSS rule
 * after the ringside Tailwind migration — leaving the "Done reordering"
 * floating button bare and unstyled. These tests pin that the button now
 * carries real Tailwind utilities on the markup (the ringside idiom the
 * host build scans and generates).
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
    render(<FloatingDoneButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Done reordering' });

    // The legacy semantic class had no CSS rule — it must be gone.
    expect(button.classList.contains('floating-done-button')).toBe(false);

    // It must be a fixed/floating primary action carrying real utilities.
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('text-primary-foreground');
    expect(button.className).toContain('rounded-full');
  });

  it('gates its motion on motion-reduce', () => {
    render(<FloatingDoneButton isVisible onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Done reordering' });

    // Animation/transition present...
    expect(button.className).toContain('animate-slide-up');
    // ...and disabled under prefers-reduced-motion.
    expect(button.className).toContain('motion-reduce:animate-none');
    expect(button.className).toContain('motion-reduce:transition-none');
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    render(<FloatingDoneButton isVisible onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done reordering' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
