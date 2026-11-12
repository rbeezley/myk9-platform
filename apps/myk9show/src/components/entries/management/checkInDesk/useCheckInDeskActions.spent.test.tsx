import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckInStatus } from '@myk9/core';
import { useCheckInDeskActions, type DeskStatusSource } from './useCheckInDeskActions';

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn().mockResolvedValue(undefined),
}));

const source = (status: CheckInStatus): DeskStatusSource[] => [
  { id: 'e-1', classes: [{ checkInStatus: status }] },
];

describe('a held status flip is spent once the shared entries move on', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not re-apply when the stored status later returns to where the flip began', async () => {
    // The re-read fails, so the flip is held.
    const onRefreshEntries = vi.fn().mockRejectedValue(new Error('offline'));
    const { result, rerender } = renderHook(
      ({ entries }) => useCheckInDeskActions(entries, onRefreshEntries),
      { initialProps: { entries: source('no-status') } }
    );
    await act(async () => {
      await result.current.setStatus('Moss', ['e-1'], 'checked-in');
    });
    expect(result.current.changes.get('e-1')).toEqual({ from: 'no-status', to: 'checked-in' });

    // The entries catch up, then someone resets the dog to Not checked in.
    rerender({ entries: source('checked-in') });
    expect(result.current.changes.has('e-1')).toBe(false);
    rerender({ entries: source('no-status') });
    expect(result.current.changes.has('e-1')).toBe(false);
  });
});
