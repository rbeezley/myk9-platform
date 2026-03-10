import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '../useNotificationDelivery';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

// Mock @myk9/notifications
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return {
    ...actual,
    shouldSuppress: vi.fn(() => false),
    playNotificationSound: vi.fn(),
    speak: vi.fn(),
    generateVoiceText: vi.fn(() => ({ text: 'test voice text', priority: 'normal' })),
  };
});

// Mock Sonner toast
vi.mock('@/lib/notifications', () => ({
  notifications: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { shouldSuppress, playNotificationSound, speak } from '@myk9/notifications';
import { notifications as toastNotifications } from '@/lib/notifications';

const mockPayload: NotificationPayload = {
  id: 'test-1',
  type: 'your_turn',
  title: 'Test Title',
  body: 'Test Body',
  priority: 'urgent',
  timestamp: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('useNotificationDelivery', () => {
  it('delivers toast notification', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(toastNotifications.warning).toHaveBeenCalled();
  });

  it('plays sound when soundEnabled', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(playNotificationSound).toHaveBeenCalledWith('urgent');
  });

  it('skips sound when soundEnabled is false', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, soundEnabled: false },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('speaks when voiceEnabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(speak).toHaveBeenCalledWith('test voice text');
  });

  it('suppresses all channels when shouldSuppress returns true', () => {
    vi.mocked(shouldSuppress).mockReturnValueOnce(true);

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(toastNotifications.info).not.toHaveBeenCalled();
    expect(toastNotifications.warning).not.toHaveBeenCalled();
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('vibrates when vibrationEnabled', () => {
    const mockVibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate: mockVibrate });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(mockVibrate).toHaveBeenCalled();
  });

  it('skips vibration when vibrationEnabled is false', () => {
    const mockVibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate: mockVibrate });
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, vibrationEnabled: false },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it('adds alert to store', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    const state = useNotificationStore.getState();
    expect(state.recentAlerts).toHaveLength(1);
    expect(state.recentAlerts[0].payload.id).toBe('test-1');
  });
});
