/**
 * StatusBadge pulse (MYK9-1365): the list no longer remounts a card when its
 * status changes, so the pulse is driven by the status change itself.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../stores/entryStore';
import { StatusBadge } from './SortableEntryCardBadges';

const entry = (status: string): Entry =>
  ({ id: 'e1', callName: 'Rex', status, inRing: false, isScored: false }) as unknown as Entry;

const badge = (status: string) => (
  <StatusBadge entry={entry(status)} isDisabled={false} onClick={() => undefined} />
);

describe('StatusBadge pulse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not pulse on first mount', () => {
    render(badge('no-status'));
    expect(screen.getByTestId('check-in-button').className).not.toContain('status-just-changed');
  });

  it('pulses when the status changes in place, then settles', () => {
    const { rerender } = render(badge('no-status'));
    rerender(badge('checked-in'));
    expect(screen.getByTestId('check-in-button').className).toContain('status-just-changed');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('check-in-button').className).not.toContain('status-just-changed');
  });

  it('does not pulse when a re-render leaves the status alone', () => {
    const { rerender } = render(badge('checked-in'));
    rerender(badge('checked-in'));
    expect(screen.getByTestId('check-in-button').className).not.toContain('status-just-changed');
  });
});

// MYK9-1763: the badge must read as a control at rest, not only on hover.
describe('StatusBadge as a button', () => {
  it('shows the status word and a menu chevron inside one tappable button', () => {
    render(badge('no-status'));
    const button = screen.getByRole('button', { name: /Check-in: Not checked in/ });
    expect(button.textContent).toBe('Not checked in');
    expect(button.querySelectorAll('svg')).toHaveLength(2);
    // jsdom counts screen-reader-only text in textContent, so check the word and
    // every wrapper up to the button are not visually hidden.
    for (let el: Element | null = screen.getByText('Not checked in'); el && el !== button;) {
      expect(el.className).not.toMatch(/\b(sr-only|hidden)\b/);
      el = el.parentElement;
    }
  });

  it('still opens the explanation when self check-in is disabled', () => {
    const onClick = vi.fn();
    render(<StatusBadge entry={entry('no-status')} isDisabled onClick={onClick} />);
    const button = screen.getByRole('button', { name: /Self check-in disabled/ });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
