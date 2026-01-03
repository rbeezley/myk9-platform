/**
 * Tests for usePushNotifications Hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { usePushNotifications } from './usePushNotifications';
import PushNotificationService from '@/services/pushNotificationService';

// Mock localStorage with proper functionality
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock dependencies
vi.mock('@/services/pushNotificationService');
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    role: 'Secretary',
    showContext: {
      licenseKey: 'test-license-key',
      showName: 'Test Show'
    }
  })
}));

const mockUpdateSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    updateSettings: mockUpdateSettings
  })
}));

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Default mock implementations
    vi.mocked(PushNotificationService.isSubscribed).mockResolvedValue(false);
    vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('default');
    vi.mocked(PushNotificationService.getBrowserCompatibility).mockReturnValue({
      supported: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(false);
        expect(result.current.isSubscribing).toBe(false);
        expect(result.current.permissionState).toBe('default');
        expect(result.current.browserCompatibility).toEqual({ supported: true });
      });
    });

    it('should load subscription status on mount', async () => {
      vi.mocked(PushNotificationService.isSubscribed).mockResolvedValue(true);
      vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('granted');

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(true);
        expect(result.current.permissionState).toBe('granted');
      });
    });

    it('should handle initialization errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(PushNotificationService.isSubscribed).mockRejectedValue(new Error('Init error'));

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should detect browser compatibility', async () => {
      vi.mocked(PushNotificationService.getBrowserCompatibility).mockReturnValue({
        supported: false,
        reason: 'Service workers not supported',
        missingFeatures: ['ServiceWorker']
      });

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.browserCompatibility).toEqual({
          supported: false,
          reason: 'Service workers not supported',
          missingFeatures: ['ServiceWorker']
        });
      });
    });
  });

  describe('subscribe()', () => {
    it('should successfully subscribe to push notifications', async () => {
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);
      vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('granted');

      const { result } = renderHook(() => usePushNotifications());

      let subscribeResult;
      await act(async () => {
        subscribeResult = await result.current.subscribe();
      });

      expect(subscribeResult).toEqual({ success: true });
      expect(result.current.isPushSubscribed).toBe(true);
      expect(result.current.permissionState).toBe('granted');
      expect(mockUpdateSettings).toHaveBeenCalledWith({ enableNotifications: true });
    });

    it('should pass favorite armbands from localStorage', async () => {
      localStorage.setItem('dog_favorites_test-license-key', JSON.stringify([101, 102, 103]));
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(PushNotificationService.subscribe).toHaveBeenCalledWith(
        'Secretary',
        'test-license-key',
        [101, 102, 103]
      );
    });

    it('should handle empty favorites gracefully', async () => {
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(PushNotificationService.subscribe).toHaveBeenCalledWith(
        'Secretary',
        'test-license-key',
        []
      );
    });

    it('should handle malformed favorites JSON', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('dog_favorites_test-license-key', 'invalid json');
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(PushNotificationService.subscribe).toHaveBeenCalledWith(
        'Secretary',
        'test-license-key',
        []
      );
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should set isSubscribing during subscription', async () => {
      vi.mocked(PushNotificationService.subscribe).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isSubscribing).toBe(false);

      // Start the subscription (don't await yet)
      const subscribePromise = result.current.subscribe();

      // Check that isSubscribing is true during the operation
      await waitFor(() => {
        expect(result.current.isSubscribing).toBe(true);
      });

      // Wait for completion
      await act(async () => {
        await subscribePromise;
      });

      expect(result.current.isSubscribing).toBe(false);
    });

    it('should handle subscription failure', async () => {
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(false);

      const { result } = renderHook(() => usePushNotifications());

      const subscribeResult = await act(async () => {
        return await result.current.subscribe();
      });

      expect(subscribeResult).toEqual({
        success: false,
        error: 'Failed to subscribe. Check browser permissions.'
      });
      expect(result.current.isPushSubscribed).toBe(false);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ enableNotifications: false });
    });

    it('should handle subscription errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(PushNotificationService.subscribe).mockRejectedValue(new Error('Service worker error'));

      const { result } = renderHook(() => usePushNotifications());

      const subscribeResult = await act(async () => {
        return await result.current.subscribe();
      });

      expect(subscribeResult).toEqual({
        success: false,
        error: 'Service worker error'
      });
      expect(result.current.isPushSubscribed).toBe(false);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ enableNotifications: false });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('unsubscribe()', () => {
    it('should successfully unsubscribe from push notifications', async () => {
      vi.mocked(PushNotificationService.isSubscribed).mockResolvedValue(true);
      vi.mocked(PushNotificationService.unsubscribe).mockResolvedValue();

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(true);
      });

      const unsubscribeResult = await act(async () => {
        return await result.current.unsubscribe();
      });

      expect(unsubscribeResult).toEqual({ success: true });
      expect(result.current.isPushSubscribed).toBe(false);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ enableNotifications: false });
    });

    it('should set isSubscribing during unsubscription', async () => {
      vi.mocked(PushNotificationService.unsubscribe).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const { result } = renderHook(() => usePushNotifications());

      expect(result.current.isSubscribing).toBe(false);

      // Start the unsubscription (don't await yet)
      const unsubscribePromise = result.current.unsubscribe();

      // Check that isSubscribing is true during the operation
      await waitFor(() => {
        expect(result.current.isSubscribing).toBe(true);
      });

      // Wait for completion
      await act(async () => {
        await unsubscribePromise;
      });

      expect(result.current.isSubscribing).toBe(false);
    });

    it('should handle unsubscription errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(PushNotificationService.unsubscribe).mockRejectedValue(new Error('Unsubscribe failed'));

      const { result } = renderHook(() => usePushNotifications());

      const unsubscribeResult = await act(async () => {
        return await result.current.unsubscribe();
      });

      expect(unsubscribeResult).toEqual({
        success: false,
        error: 'Unsubscribe failed'
      });
      expect(result.current.isPushSubscribed).toBe(false);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ enableNotifications: true });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('refreshStatus()', () => {
    it('should refresh subscription and permission status', async () => {
      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(false);
      });

      // Change mock return values
      vi.mocked(PushNotificationService.isSubscribed).mockResolvedValue(true);
      vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('granted');

      await act(async () => {
        return await result.current.refreshStatus();
      });

      expect(result.current.isPushSubscribed).toBe(true);
      expect(result.current.permissionState).toBe('granted');
    });

    it('should handle refresh errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(PushNotificationService.isSubscribed).mockRejectedValue(new Error('Refresh error'));

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        return await result.current.refreshStatus();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete subscription lifecycle', async () => {
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);
      vi.mocked(PushNotificationService.unsubscribe).mockResolvedValue();
      vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('granted');

      const { result } = renderHook(() => usePushNotifications());

      // Initially not subscribed
      await waitFor(() => {
        expect(result.current.isPushSubscribed).toBe(false);
      });

      // Subscribe
      const subscribeResult = await act(async () => {
        return await result.current.subscribe();
      });
      expect(subscribeResult.success).toBe(true);

      expect(result.current.isPushSubscribed).toBe(true);
      expect(result.current.permissionState).toBe('granted');

      // Unsubscribe
      const unsubscribeResult = await act(async () => {
        return await result.current.unsubscribe();
      });
      expect(unsubscribeResult.success).toBe(true);

      expect(result.current.isPushSubscribed).toBe(false);
    });

    it('should handle permission denied scenario', async () => {
      vi.mocked(PushNotificationService.getPermissionState).mockResolvedValue('denied');
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(false);

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.permissionState).toBe('denied');
      });

      const subscribeResult = await act(async () => {
        return await result.current.subscribe();
      });

      expect(subscribeResult.success).toBe(false);
      expect(result.current.isPushSubscribed).toBe(false);
    });

    it('should handle browser incompatibility', async () => {
      vi.mocked(PushNotificationService.getBrowserCompatibility).mockReturnValue({
        supported: false,
        reason: 'Push API not available',
        missingFeatures: ['PushManager', 'ServiceWorker']
      });

      const { result } = renderHook(() => usePushNotifications());

      await waitFor(() => {
        expect(result.current.browserCompatibility?.supported).toBe(false);
        expect(result.current.browserCompatibility?.missingFeatures).toContain('PushManager');
      });
    });

    it('should handle localStorage with many favorites', async () => {
      const manyFavorites = Array.from({ length: 100 }, (_, i) => i + 1);
      localStorage.setItem('dog_favorites_test-license-key', JSON.stringify(manyFavorites));
      vi.mocked(PushNotificationService.subscribe).mockResolvedValue(true);

      const { result } = renderHook(() => usePushNotifications());

      await act(async () => {
        await result.current.subscribe();
      });

      expect(PushNotificationService.subscribe).toHaveBeenCalledWith(
        'Secretary',
        'test-license-key',
        manyFavorites
      );
    });
  });
});
