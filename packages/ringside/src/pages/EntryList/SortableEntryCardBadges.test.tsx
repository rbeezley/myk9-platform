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
