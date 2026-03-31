import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

const { mockChannel, mockRemoveChannel, mockDeliver, mockPreferences } = vi.hoisted(() => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  const mockRemoveChannel = vi.fn();
  const mockDeliver = vi.fn();
  const mockPreferences = {
    enabled: true,
    leadDogs: 3,
    soundEnabled: true,
    voiceEnabled: false,
    vibrationEnabled: true,
    pushEnabled: false,
  };
  return { mockChannel, mockRemoveChannel, mockDeliver, mockPreferences };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/hooks/useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mockDeliver }),
}));

vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ preferences: mockPreferences }),
}));

vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows: [{ showId: 'show-1' }] }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedShowId: null }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-1', id: 'auth-user-1' },
    user: { id: 'auth-user-1' },
  }),
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsByOwnerQuery: () => ({ data: [{ id: 'dog-1' }] }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: () => ({ data: null, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@myk9/notifications', () => ({
  buildYourTurnPayload: vi.fn(() => ({ id: '1', type: 'your_turn' })),
  buildClassStartingPayload: vi.fn(() => ({ id: '2', type: 'class_starting' })),
  buildCheckInReminderPayload: vi.fn(() => ({ id: '3', type: 'check_in_reminder' })),
  buildResultsPostedPayload: vi.fn(() => ({ id: '4', type: 'results_posted' })),
}));

vi.mock('@/utils/runOrderUtils', () => ({
  getRunOrder: vi.fn((entries: unknown[]) => entries),
}));

vi.mock('@/utils/conflictDetection', () => ({
  detectConflicts: vi.fn(() => []),
}));

import { useNotificationMonitor } from '../useNotificationMonitor';
import { supabase } from '@/lib/supabase';

describe('useNotificationMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('subscribes to realtime channels on mount', () => {
    renderHook(() => useNotificationMonitor());
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });

  it('cleans up channels on unmount', () => {
    const { unmount } = renderHook(() => useNotificationMonitor());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('does not subscribe when notifications are disabled', () => {
    const orig = mockPreferences.enabled;
    mockPreferences.enabled = false;
    renderHook(() => useNotificationMonitor());
    expect(mockChannel.on).not.toHaveBeenCalled();
    mockPreferences.enabled = orig;
  });

  it('creates separate channels for entries and classes per show', () => {
    renderHook(() => useNotificationMonitor());
    const channelFn = vi.mocked(supabase.channel);
    expect(channelFn).toHaveBeenCalledWith('notif-entries:show-1');
    expect(channelFn).toHaveBeenCalledWith('notif-classes:show-1');
  });
});
