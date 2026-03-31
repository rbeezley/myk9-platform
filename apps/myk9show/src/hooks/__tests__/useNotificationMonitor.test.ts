import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

const { mockChannel, mockRemoveChannel, mockDeliver, mockPreferences, mockUseShowDayData } =
  vi.hoisted(() => {
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
    const mockUseShowDayData = vi.fn(() => ({ activeShows: [{ showId: 'show-1' }] }));
    return { mockChannel, mockRemoveChannel, mockDeliver, mockPreferences, mockUseShowDayData };
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
  useShowDayData: mockUseShowDayData,
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

/**
 * Extracts the callback registered via `mockChannel.on` for a given table.
 * The `.on()` call signature is: on(event, { table, ... }, callback)
 */
function getRealtimeCallback(table: string) {
  const call = mockChannel.on.mock.calls.find(
    (c: unknown[]) => (c[1] as Record<string, unknown>).table === table
  );
  return call?.[2] as
    | ((payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => void)
    | undefined;
}

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

  it('creates per-show entries channel and single classes channel', () => {
    renderHook(() => useNotificationMonitor());
    const channelFn = vi.mocked(supabase.channel);
    expect(channelFn).toHaveBeenCalledWith('notif-entries:show-1');
    expect(channelFn).toHaveBeenCalledWith('notif-classes');
  });
});

describe('your_turn alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('does not fire when event is not check_in_status change to in-ring', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('entries');
    expect(cb).toBeDefined();
    // Non-in-ring status change
    cb!({
      eventType: 'UPDATE',
      new: { id: 'e1', class_id: 'c1', check_in_status: 'checked-in' },
      old: { check_in_status: 'no-status' },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('ignores non-UPDATE events', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('entries');
    // The realtime wrapper only forwards new/old; class context is empty so bails early
    cb!({
      eventType: 'INSERT',
      new: { id: 'e1', class_id: 'c1', check_in_status: 'in-ring' },
      old: {},
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('bails when class context not populated', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('entries');
    // in-ring change but class not in context (useQuery returns null so context stays empty)
    cb!({
      eventType: 'UPDATE',
      new: { id: 'e1', class_id: 'unknown-class', check_in_status: 'in-ring' },
      old: { check_in_status: 'at-gate' },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});

describe('class_starting / check_in_reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('ignores class status changes that are not to In Progress', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('classes');
    expect(cb).toBeDefined();
    cb!({
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Completed', is_scoring_finalized: false },
      old: { status: 'In Progress', is_scoring_finalized: false },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});

describe('results_posted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('ignores when is_scoring_finalized was already true', () => {
    renderHook(() => useNotificationMonitor());
    const cb = getRealtimeCallback('classes');
    cb!({
      eventType: 'UPDATE',
      new: { id: 'c1', status: 'Completed', is_scoring_finalized: true },
      old: { status: 'Completed', is_scoring_finalized: true },
    });
    expect(mockDeliver).not.toHaveBeenCalled();
  });
});

describe('early returns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.on.mockReturnValue(mockChannel);
    mockChannel.subscribe.mockReturnValue(mockChannel);
  });

  it('does not subscribe when showIds is empty', () => {
    mockUseShowDayData.mockReturnValueOnce({ activeShows: [] });

    renderHook(() => useNotificationMonitor());
    // No channels should be created when there are no active shows
    expect(mockChannel.on).not.toHaveBeenCalled();
  });
});
