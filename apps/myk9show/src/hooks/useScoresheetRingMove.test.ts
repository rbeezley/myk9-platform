import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreFromInRing, transitionToInRing } from '@/utils/checkInTransitions';
import { useScoresheetRingMove } from './useScoresheetRingMove';

vi.mock('@/utils/checkInTransitions', () => ({
  transitionToInRing: vi.fn(),
  restoreFromInRing: vi.fn().mockResolvedValue(undefined),
}));

const move = { entryId: 'e1', previousStatus: 'checked-in' };
const entryId = 'e1';

// MYK9-1762: shared by the ringside and secretary scoresheets.
describe('useScoresheetRingMove', () => {
  beforeEach(() => {
    vi.mocked(transitionToInRing).mockReset();
    vi.mocked(restoreFromInRing).mockClear();
  });

  it('does not mark a dog in-ring on open or leave without an explicit start', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, unmount } = renderHook(() => useScoresheetRingMove('e1'));

    result.current.opened(entryId);
    unmount();

    expect(transitionToInRing).not.toHaveBeenCalled();
    expect(restoreFromInRing).not.toHaveBeenCalled();
  });

  it('puts the dog back when the sheet is left without a score', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, unmount } = renderHook(() => useScoresheetRingMove('e1'));

    result.current.opened(entryId);
    result.current.start();
    result.current.start();
    unmount();

    expect(transitionToInRing).toHaveBeenCalledExactlyOnceWith(entryId);
    expect(restoreFromInRing).toHaveBeenCalledExactlyOnceWith(move);
  });

  it('puts the previous dog back when the sheet moves to the next dog', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, rerender } = renderHook(({ id }) => useScoresheetRingMove(id), {
      initialProps: { id: 'e1' },
    });

    result.current.opened(entryId);
    result.current.start();
    rerender({ id: 'e2' });

    expect(restoreFromInRing).toHaveBeenCalledExactlyOnceWith(move);
  });

  it('does not put a scored dog back', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, unmount } = renderHook(() => useScoresheetRingMove('e1'));

    result.current.opened(entryId);
    result.current.start();
    result.current.scored();
    unmount();

    expect(restoreFromInRing).not.toHaveBeenCalled();
  });

  it('does not move a dog whose sheet was already left (a slow load finishing late)', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, unmount } = renderHook(() => useScoresheetRingMove('e1'));
    const { opened, start } = result.current;

    unmount();
    opened(entryId);
    start();

    expect(transitionToInRing).not.toHaveBeenCalled();
    expect(restoreFromInRing).not.toHaveBeenCalled();
  });

  it('does not move the previous dog after the sheet moved on to the next one', () => {
    vi.mocked(transitionToInRing).mockReturnValue(move as never);
    const { result, rerender } = renderHook(({ id }) => useScoresheetRingMove(id), {
      initialProps: { id: 'e1' },
    });

    rerender({ id: 'e2' });
    result.current.opened(entryId);
    result.current.start();

    expect(transitionToInRing).not.toHaveBeenCalled();
  });
});
