import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockChannel, mockRemoveChannel, mockInvalidateQueries } = vi.hoisted(() => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const mockRemoveChannel = vi.fn();
  const mockInvalidateQueries = vi.fn();
  return { mockChannel, mockRemoveChannel, mockInvalidateQueries };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-1' },
  }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

import { useShowDayRealtime } from '../useShowDayRealtime';
import { supabase } from '@/lib/supabase';

beforeEach(() => {
  vi.clearAllMocks();
  mockChannel.on.mockReturnValue(mockChannel);
  mockChannel.subscribe.mockReturnValue(mockChannel);
});

describe('useShowDayRealtime', () => {
  it('does not subscribe when classIds is empty', () => {
    renderHook(() => useShowDayRealtime([]));
    expect(supabase.channel).not.toHaveBeenCalled();
    expect(mockChannel.on).not.toHaveBeenCalled();
  });

  it('subscribes to the correct channel name and filter when classIds are provided', () => {
    renderHook(() => useShowDayRealtime(['class-1', 'class-2']));

    expect(supabase.channel).toHaveBeenCalledWith('show-day-entries:class-1,class-2');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'entries',
        filter: 'class_id=in.(class-1,class-2)',
      }),
      expect.any(Function)
    );
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('calls queryClient.invalidateQueries with user-scoped key when an entry update fires', () => {
    renderHook(() => useShowDayRealtime(['class-1']));

    // Extract the registered callback
    const onCall = mockChannel.on.mock.calls[0];
    const callback = onCall[2] as () => void;
    callback();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['show-day', 'ring-progress', 'user-1'],
    });
  });

  it('calls supabase.removeChannel on unmount', () => {
    const { unmount } = renderHook(() => useShowDayRealtime(['class-1']));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
