import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '../useNotificationDelivery';
import { useNotificationStore } from '@/store/notificationStore';
import { useToastStore } from '@/store/toastStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

// Mock sound/voice modules to avoid Web Audio API in tests
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual<typeof import('@myk9/notifications')>('@myk9/notifications');
  return {
    ...actual,
    playNotificationSound: vi.fn(),
    speak: vi.fn(),
    generateVoiceText: vi.fn(() => null),
  };
});

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: 'Test',
    body: 'Test body',
    priority: 'normal',
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, enabled: true },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    isCenterOpen: false,
    permissionStatus: 'default' as NotificationPermission,
  });
  useToastStore.setState({ toasts: [] });
});

describe('useNotificationDelivery', () => {
  it('adds toast to toastStore when delivering', () => {
    const { result } = renderHook(() => useNotificationDelivery());
    const payload = makePayload('1');

    act(() => {
      result.current.deliver(payload);
    });

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('1');
  });

  it('adds alert to notificationStore when delivering', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(useNotificationStore.getState().recentAlerts).toHaveLength(1);
  });

  it('suppresses delivery when master toggle is off', () => {
    useNotificationStore.getState().updatePreferences({ enabled: false });
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useNotificationStore.getState().recentAlerts).toHaveLength(0);
  });
});
