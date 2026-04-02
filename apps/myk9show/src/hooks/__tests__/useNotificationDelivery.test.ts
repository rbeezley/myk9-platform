import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '../useNotificationDelivery';
import { useNotificationStore } from '@/store/notificationStore';
import { useToastStore } from '@/store/toastStore';
import { DEFAULT_PREFERENCES, speakWithConfig } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

// Mock sound/voice modules to avoid Web Audio API in tests
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual<typeof import('@myk9/notifications')>('@myk9/notifications');
  return {
    ...actual,
    playNotificationSound: vi.fn(),
    speakWithConfig: vi.fn(),
    generateVoiceText: vi.fn(() => ({ text: 'Test voice', priority: 'normal' })),
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
  vi.clearAllMocks();
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

  it('calls speakWithConfig when voice is enabled and category matches', () => {
    useNotificationStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        voiceEnabled: true,
        voiceCategories: {
          runOrder: true,
          results: true,
          classStarting: true,
          announcements: true,
        },
        voiceName: 'Samantha',
        voiceRate: 1.2,
      },
    });

    const { result } = renderHook(() => useNotificationDelivery());
    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(vi.mocked(speakWithConfig)).toHaveBeenCalledWith('Test voice', {
      voiceName: 'Samantha',
      voiceRate: 1.2,
    });
  });

  it('does not speak when voice master toggle is off', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: false },
    });

    const { result } = renderHook(() => useNotificationDelivery());
    act(() => {
      result.current.deliver(makePayload('1'));
    });

    expect(vi.mocked(speakWithConfig)).not.toHaveBeenCalled();
  });

  it('does not speak when category toggle is off', () => {
    useNotificationStore.setState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        voiceEnabled: true,
        voiceCategories: {
          runOrder: false,
          results: true,
          classStarting: true,
          announcements: true,
        },
      },
    });

    const { result } = renderHook(() => useNotificationDelivery());
    act(() => {
      result.current.deliver(makePayload('1')); // type: 'your_turn' → category: runOrder
    });

    expect(vi.mocked(speakWithConfig)).not.toHaveBeenCalled();
  });
});
