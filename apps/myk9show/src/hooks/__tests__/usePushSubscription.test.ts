import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Must stub env before tests run so the hook picks up the value on first render
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'test-vapid-key');

// Hoist mock variables so they are available in vi.mock factory closures
const { mockUpsert, mockDelete, mockFrom, mockUpdatePreferences, mockRequestPermission } =
  vi.hoisted(() => {
    const mockEq = vi.fn();
    mockEq.mockImplementation(() => ({
      eq: mockEq,
      then: (r: (v: unknown) => void) => r({ error: null }),
    }));
    const mockUpsert = vi.fn(() => Promise.resolve({ error: null }));
    const mockDelete = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ upsert: mockUpsert, delete: mockDelete }));
    const mockUpdatePreferences = vi.fn();
    const mockRequestPermission = vi.fn();
    return {
      mockEq,
      mockUpsert,
      mockDelete,
      mockFrom,
      mockUpdatePreferences,
      mockRequestPermission,
    };
  });

import { usePushSubscription } from '../usePushSubscription';

// Mock @myk9/notifications — spread actual exports to avoid clobbering
vi.mock('@myk9/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/notifications')>()),
  isPushSupported: vi.fn(() => true),
  subscribeToPush: vi.fn(() =>
    Promise.resolve({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    })
  ),
  unsubscribeFromPush: vi.fn(() => Promise.resolve(true)),
  getExistingSubscription: vi.fn(() => Promise.resolve(null)),
}));

// Mock supabase client — uses hoisted mockFrom
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: mockFrom },
}));

// Mock auth context
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-123' } }),
}));

// Mock notification store — uses hoisted mock functions
vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      preferences: { pushEnabled: false },
      permissionStatus: 'default',
      updatePreferences: mockUpdatePreferences,
      requestPermission: mockRequestPermission,
    })
  ),
}));

describe('usePushSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expose subscribe and unsubscribe functions', () => {
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.subscribe).toBeInstanceOf(Function);
    expect(result.current.unsubscribe).toBeInstanceOf(Function);
    expect(result.current.isSupported).toBe(true);
  });

  it('should subscribe and save to Supabase', async () => {
    const { subscribeToPush } = await import('@myk9/notifications');
    const { result } = renderHook(() => usePushSubscription());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.subscribe();
    });

    expect(response).toEqual({ ok: true });
    expect(subscribeToPush).toHaveBeenCalledWith('test-vapid-key');
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: 'user-123',
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'key1',
        auth: 'auth1',
      },
      { onConflict: 'user_id,endpoint' }
    );
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ pushEnabled: true });
  });

  it('should unsubscribe and delete from Supabase', async () => {
    // Override mock to return existing subscription (otherwise delete is skipped)
    const { unsubscribeFromPush, getExistingSubscription } = await import('@myk9/notifications');
    vi.mocked(getExistingSubscription).mockResolvedValueOnce({
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    });

    const { result } = renderHook(() => usePushSubscription());

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(unsubscribeFromPush).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ pushEnabled: false });
  });

  // Test permission-denied flow
  it('should return reason when permission is denied', async () => {
    // Simulate Notification.permission = 'denied' after request
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'denied' },
      configurable: true,
    });

    const { result } = renderHook(() => usePushSubscription());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.subscribe();
    });

    expect(response).toEqual({ ok: false, reason: 'permission-denied' });
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  // Test subscribe error handling
  it('should return reason when subscribeToPush throws', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    });

    const { subscribeToPush } = await import('@myk9/notifications');
    vi.mocked(subscribeToPush).mockRejectedValueOnce(new Error('SW not ready'));

    const { result } = renderHook(() => usePushSubscription());

    let response: { ok: boolean; reason?: string } | undefined;
    await act(async () => {
      response = await result.current.subscribe();
    });

    expect(response).toEqual({ ok: false, reason: 'subscribe-failed' });
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it('should still update preferences when unsubscribe throws', async () => {
    const { unsubscribeFromPush } = await import('@myk9/notifications');
    vi.mocked(unsubscribeFromPush).mockRejectedValueOnce(new Error('failed'));

    const { result } = renderHook(() => usePushSubscription());
    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ pushEnabled: false });
  });
});
