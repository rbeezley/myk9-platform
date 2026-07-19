import { renderHook } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  subscribeToShowChanges,
  type ShowChangeListener,
} from '@/features/show-live-sync/showChangeSignal';
import { useCheckInStatusSubscription } from './useCheckInStatusSubscription';

vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: vi.fn() }));

describe('useCheckInStatusSubscription', () => {
  const invalidateQueries = vi.fn();
  const unsubscribe = vi.fn();
  let changeHandler: ShowChangeListener | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    changeHandler = undefined;
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries } as never);
    vi.mocked(subscribeToShowChanges).mockImplementation((_showId, handler) => {
      changeHandler = handler;
      return unsubscribe;
    });
  });

  it('invalidates the class entries query from the parent show signal', () => {
    renderHook(() => useCheckInStatusSubscription('show-1', 'class-123'));

    expect(subscribeToShowChanges).toHaveBeenCalledWith('show-1', expect.any(Function));
    changeHandler?.({ table: 'entries' });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['classes', 'class-123', 'entries'],
    });
  });

  it('does not subscribe without both show and class IDs', () => {
    renderHook(() => useCheckInStatusSubscription(undefined, 'class-123'));
    renderHook(() => useCheckInStatusSubscription('show-1', undefined));

    expect(subscribeToShowChanges).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useCheckInStatusSubscription('show-1', 'class-123'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
