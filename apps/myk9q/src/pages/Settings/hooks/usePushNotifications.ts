/**
 * usePushNotifications Hook
 *
 * Manages push notification subscription state and operations.
 * Handles browser compatibility, permission states, and subscription lifecycle.
 *
 * Extracted from useSettingsLogic.ts
 */

import { useState, useEffect, useCallback } from 'react';
import PushNotificationService from '@/services/pushNotificationService';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { logger } from '@/utils/logger';

/**
 * Browser compatibility information
 */
export interface BrowserCompatibility {
  supported: boolean;
  reason?: string;
  missingFeatures?: string[];
}

/**
 * Push notification subscription result
 */
export interface SubscriptionResult {
  success: boolean;
  error?: string;
}

/**
 * Hook return type
 */
export interface UsePushNotificationsReturn {
  // State
  isPushSubscribed: boolean;
  isSubscribing: boolean;
  permissionState: NotificationPermission;
  browserCompatibility: BrowserCompatibility | null;

  // Actions
  subscribe: () => Promise<SubscriptionResult>;
  unsubscribe: () => Promise<SubscriptionResult>;
  refreshStatus: () => Promise<void>;
}

/**
 * Custom hook for managing push notification subscriptions
 *
 * Provides state and methods for:
 * - Checking browser compatibility
 * - Managing subscription status
 * - Subscribing/unsubscribing to push notifications
 * - Tracking permission state
 *
 * @returns Push notification state and control methods
 *
 * @example
 * ```tsx
 * function NotificationSettings() {
 *   const {
 *     isPushSubscribed,
 *     isSubscribing,
 *     permissionState,
 *     browserCompatibility,
 *     subscribe,
 *     unsubscribe
 *   } = usePushNotifications();
 *
 *   const handleToggle = async (enabled: boolean) => {
 *     if (enabled) {
 *       const result = await subscribe();
 *       if (!result.success) {
 *         logger.error(result.error);
 *       }
 *     } else {
 *       await unsubscribe();
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <Switch
 *         checked={isPushSubscribed}
 *         disabled={isSubscribing || permissionState === 'denied'}
 *         onChange={handleToggle}
 *       />
 *       {!browserCompatibility?.supported && (
 *         <p>Push notifications not supported</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const { showContext, role } = useAuth();
  const { updateSettings } = useSettings();

  // State
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [browserCompatibility, setBrowserCompatibility] = useState<BrowserCompatibility | null>(null);

  /**
   * Initialize push notification status
   */
  useEffect(() => {
    const initializeStatus = async () => {
      try {
        const subscribed = await PushNotificationService.isSubscribed();
        setIsPushSubscribed(subscribed);

        const permission = await PushNotificationService.getPermissionState();
        setPermissionState(permission);

        const compat = PushNotificationService.getBrowserCompatibility();
        setBrowserCompatibility(compat);
      } catch (error) {
        logger.error('Failed to initialize push notification status:', error);
      }
    };

    initializeStatus();
  }, []);

  /**
   * Refresh subscription and permission status
   */
  const refreshStatus = useCallback(async () => {
    try {
      const subscribed = await PushNotificationService.isSubscribed();
      setIsPushSubscribed(subscribed);

      const permission = await PushNotificationService.getPermissionState();
      setPermissionState(permission);
    } catch (error) {
      logger.error('Failed to refresh push notification status:', error);
    }
  }, []);

  /**
   * Subscribe to push notifications
   */
  const subscribe = useCallback(async (): Promise<SubscriptionResult> => {
    // Validate prerequisites
    if (!showContext?.licenseKey || !role) {
      return {
        success: false,
        error: 'Please log in to enable push notifications'
      };
    }

    setIsSubscribing(true);

    try {
      // Get favorite armbands from localStorage
      const favoritesKey = `dog_favorites_${showContext.licenseKey}`;
      const savedFavorites = localStorage.getItem(favoritesKey);
      let favoriteArmbands: number[] = [];

      if (savedFavorites) {
        try {
          favoriteArmbands = JSON.parse(savedFavorites);
        } catch (e) {
          logger.warn('Failed to parse favorite armbands:', e);
        }
      }

      // Subscribe via service
      const success = await PushNotificationService.subscribe(
        role,
        showContext.licenseKey,
        favoriteArmbands
      );

      // Update permission state
      const newPermission = await PushNotificationService.getPermissionState();
      setPermissionState(newPermission);

      if (success) {
        setIsPushSubscribed(true);
        updateSettings({ enableNotifications: true });

        return { success: true };
      } else {
        updateSettings({ enableNotifications: false });

        return {
          success: false,
          error: 'Failed to subscribe. Check browser permissions.'
        };
      }
    } catch (error) {
      logger.error('Subscribe error:', error);
      updateSettings({ enableNotifications: false });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enable push notifications'
      };
    } finally {
      setIsSubscribing(false);
    }
  }, [showContext, role, updateSettings]);

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = useCallback(async (): Promise<SubscriptionResult> => {
    setIsSubscribing(true);

    try {
      await PushNotificationService.unsubscribe();
      setIsPushSubscribed(false);
      updateSettings({ enableNotifications: false });

      return { success: true };
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      updateSettings({ enableNotifications: true });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disable push notifications'
      };
    } finally {
      setIsSubscribing(false);
    }
  }, [updateSettings]);

  return {
    // State
    isPushSubscribed,
    isSubscribing,
    permissionState,
    browserCompatibility,

    // Actions
    subscribe,
    unsubscribe,
    refreshStatus,
  };
}
