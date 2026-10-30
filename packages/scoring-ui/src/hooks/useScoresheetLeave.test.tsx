/**
 * MYK9-1500: the sheet reports dirtiness for every persisted score field, so a
 * correction to a saved score (fault count, reason, found/correct flags) is held
 * by the host's route guard.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useScoresheetLeave, type UseScoresheetLeaveOptions } from './useScoresheetLeave';
import type { ScoresheetScoringReturn } from './useScoresheetScoring';

function scoringWith(overrides: Record<string, unknown> = {}): ScoresheetScoringReturn {
  return {
    qualifying: 'Q',
    nonQualifyingReason: '',
    faultCount: 0,
    areas: [{ areaName: 'Area 1', time: '1:00.00', found: true, correct: true }],
    ...overrides,
  } as unknown as ScoresheetScoringReturn;
}

function setup(next: Record<string, unknown>) {
  const onBack = vi.fn();
  const onDirtyChange = vi.fn();
  const { rerender } = renderHook((props: UseScoresheetLeaveOptions) => useScoresheetLeave(props), {
    initialProps: { scoring: scoringWith(), onBack, onDirtyChange },
  });
  rerender({ scoring: scoringWith(next), onBack, onDirtyChange });
  return { onBack, onDirtyChange };
}

describe('useScoresheetLeave dirtiness', () => {
  it('is clean while nothing changed from what the sheet opened with', () => {
    const { onDirtyChange } = setup({});
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['fault count', { faultCount: 1 }],
    ['non-qualifying reason', { nonQualifyingReason: 'Handler error' }],
    [
      'a found flag',
      { areas: [{ areaName: 'Area 1', time: '1:00.00', found: false, correct: true }] },
    ],
    [
      'a correct flag',
      { areas: [{ areaName: 'Area 1', time: '1:00.00', found: true, correct: false }] },
    ],
  ])('reports a changed %s as dirty', (_label, change) => {
    const { onDirtyChange } = setup(change);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('reports clean when the sheet unmounts', () => {
    const onDirtyChange = vi.fn();
    const { unmount } = renderHook(() =>
      useScoresheetLeave({ scoring: scoringWith(), onBack: vi.fn(), onDirtyChange })
    );
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
