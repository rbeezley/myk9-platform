/**
 * MYK9-1500: the leave guard compares every persisted score field, so a
 * correction to a saved score (fault count, reason, found/correct flags) is not
 * silently discarded, and it reports dirtiness for the host's route guard.
 */
import { renderHook, render, screen, fireEvent, act } from '@testing-library/react';
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
  const { result, rerender } = renderHook(
    (props: UseScoresheetLeaveOptions) => useScoresheetLeave(props),
    { initialProps: { scoring: scoringWith(), onBack, onDirtyChange } }
  );
  rerender({ scoring: scoringWith(next), onBack, onDirtyChange });
  return { result, onBack, onDirtyChange };
}

describe('useScoresheetLeave dirtiness', () => {
  it('is clean while nothing changed from what the sheet opened with', () => {
    const { result, onBack, onDirtyChange } = setup({});
    act(() => result.current.requestLeave());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
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
  ])('asks before discarding a changed %s and reports it dirty', (_label, change) => {
    const { result, onBack, onDirtyChange } = setup(change);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    act(() => result.current.requestLeave());

    expect(onBack).not.toHaveBeenCalled();
    render(<>{result.current.discardDialog}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onBack).toHaveBeenCalledTimes(1);
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
