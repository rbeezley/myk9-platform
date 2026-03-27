import { renderHook } from '@testing-library/react';
import { useCheckInStatusSubscription } from './useCheckInStatusSubscription';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

describe('useCheckInStatusSubscription', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockResolvedValue('SUBSCRIBED'),
  };
  const mockRemoveChannel = vi.fn();
  const mockInvalidateQueries = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);
    (supabase as unknown as { removeChannel: ReturnType<typeof vi.fn> }).removeChannel =
      mockRemoveChannel;
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    });
  });

  it('subscribes to the correct channel on mount', () => {
    renderHook(() => useCheckInStatusSubscription('class-123'));
    expect(supabase.channel).toHaveBeenCalledWith('checkin:class-123');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'entries',
        filter: 'class_id=eq.class-123',
      }),
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('does not subscribe when classId is undefined', () => {
    renderHook(() => useCheckInStatusSubscription(undefined));
    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useCheckInStatusSubscription('class-123'));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('invalidates queries when a change event fires', () => {
    renderHook(() => useCheckInStatusSubscription('class-123'));
    // Get the callback passed to .on()
    const onCallback = mockChannel.on.mock.calls[0][2];
    // Simulate a Postgres change event
    onCallback({ new: { id: 'entry-1', check_in_status: 'checked-in' } });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['classes', 'class-123', 'entries'],
    });
  });
});
