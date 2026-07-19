import { renderHook } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { subscribeToShowChanges } from '@/features/show-live-sync/showChangeSignal';
import { useShowCheckInSubscription } from './useShowCheckInSubscription';

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: vi.fn(),
}));

describe('useShowCheckInSubscription', () => {
  const invalidateQueries = vi.fn();
  const unsubscribe = vi.fn();
  let changeHandler: ((signal: { table: 'entries' | 'classes' }) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    changeHandler = undefined;
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries } as never);
    vi.mocked(subscribeToShowChanges).mockImplementation((_showId, handler) => {
      changeHandler = handler;
      return unsubscribe;
    });
  });

  it('invalidates the show check-in report for an authoritative entry refresh', () => {
    renderHook(() => useShowCheckInSubscription('show-1'));
    changeHandler?.({ table: 'entries' });

    expect(subscribeToShowChanges).toHaveBeenCalledWith('show-1', expect.any(Function));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.checkInReport('show-1'),
    });
  });

  it('ignores class-only signals and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useShowCheckInSubscription('show-1'));
    changeHandler?.({ table: 'classes' });
    unmount();

    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not subscribe without a show', () => {
    renderHook(() => useShowCheckInSubscription(undefined));
    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });
});
