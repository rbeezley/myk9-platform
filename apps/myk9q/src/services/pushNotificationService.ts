/**
 * Push Notification Service
 *
 * Handles Web Push API subscription and management.
 *
 * User Identification Strategy:
 * - Since passcodes are shared (e.g., all exhibitors use 'e4b6c'),
 *   we generate a unique browser-based user ID per device
 * - Format: "{role}_{uuid}" (e.g., "exhibitor_a1b2c3d4-e5f6-...")
 * - Stored in localStorage and persists across sessions
 * - Each device/browser gets a unique subscription
 *
 * Multi-Show Strategy (Auto-Switch):
 * - User can only be subscribed to ONE show at a time
 * - When user opens a new show, subscription automatically switches to new show
 * - Zero user friction - completely transparent
 * - Call switchToShow() when license_key changes
 */

import { supabase } from '@/lib/supabase';
import { useSettingsStore } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const PUSH_USER_ID_KEY = 'push_user_id'; // Browser-unique ID
const PASSCODE_SESSION_KEY = 'myK9Q_passcode'; // Stored at login for troubleshooting

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
  user_role: string;
  license_key: string;
  user_agent: string;
  passcode?: string; // For troubleshooting - stored at login time
  notification_preferences: {
    announcements: boolean; // Show organizer announcements
    up_soon: boolean; // Notify when favorited dog is up soon (uses dogs_ahead)
    spam_limit: number; // Max announcements per hour
    favorite_armbands: number[]; // Which dogs to get notifications for
    dogs_ahead: number; // How many dogs ahead to notify (1-5)
  };
}

export interface BrowserCompatibility {
  supported: boolean;
  reason?: string;
  browserName?: string;
  browserVersion?: string;
  platform?: string;
  recommendations?: string[];
}

export class PushNotificationService {
  /**
   * Get or generate a unique browser-based user ID
   * This ID persists across sessions in localStorage
   */
  private static getBrowserUserId(role: string): string {
    // Check if we already have a user ID for this browser
    let userId = localStorage.getItem(PUSH_USER_ID_KEY);

    if (!userId) {
      // Generate a new unique ID for this browser/device
      userId = crypto.randomUUID();
      localStorage.setItem(PUSH_USER_ID_KEY, userId);
    }

    // Return format: "{role}_{uuid}"
    return `${role}_${userId}`;
  }

  /**
   * Get the passcode stored at login time (for troubleshooting)
   * Returns undefined if not available (old session)
   */
  private static getStoredPasscode(): string | undefined {
    return sessionStorage.getItem(PASSCODE_SESSION_KEY) || undefined;
  }

  /**
   * Store the passcode at login time (called from Login page)
   * This enables troubleshooting by identifying which user subscribed
   */
  static storePasscode(passcode: string): void {
    sessionStorage.setItem(PASSCODE_SESSION_KEY, passcode);
  }

  /**
   * Check if push notifications are supported (simple boolean check)
   */
  static isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  /**
   * Get detailed browser compatibility information
   * Returns detailed information about browser support and recommendations
   */
  static getBrowserCompatibility(): BrowserCompatibility {
    const ua = navigator.userAgent;
    const platform = navigator.platform;

    // Detect browser and version
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    // Chrome/Edge (Chromium-based)
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      browserName = 'Chrome';
      const match = ua.match(/Chrome\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (ua.includes('Edg')) {
      browserName = 'Edge';
      const match = ua.match(/Edg\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    }
    // Firefox
    else if (ua.includes('Firefox')) {
      browserName = 'Firefox';
      const match = ua.match(/Firefox\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    }
    // Safari
    else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browserName = 'Safari';
      const match = ua.match(/Version\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    }
    // Opera
    else if (ua.includes('OPR')) {
      browserName = 'Opera';
      const match = ua.match(/OPR\/(\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    }

    // Check Service Workers
    if (!('serviceWorker' in navigator)) {
      return {
        supported: false,
        reason: 'Service Workers are not supported',
        browserName,
        browserVersion,
        platform,
        recommendations: [
          'Update your browser to the latest version',
          'Try using Chrome, Firefox, or Edge',
          'Push notifications require a modern browser'
        ]
      };
    }

    // Check Push Manager
    if (!('PushManager' in window)) {
      return {
        supported: false,
        reason: 'Push notifications are not supported',
        browserName,
        browserVersion,
        platform,
        recommendations: [
          'Update your browser to the latest version',
          'Try using Chrome, Firefox, or Edge',
          'Push notifications require a modern browser'
        ]
      };
    }

    // iOS Safari version check
    const iOS = /iPad|iPhone|iPod/.test(ua);
    if (iOS) {
      // Extract iOS version (format: "OS 16_4" or "OS 16_4_1")
      const iOSMatch = ua.match(/OS (\d+)_(\d+)/);
      if (iOSMatch) {
        const majorVersion = parseInt(iOSMatch[1]);
        const minorVersion = parseInt(iOSMatch[2]);

        // Push notifications require iOS 16.4+
        if (majorVersion < 16 || (majorVersion === 16 && minorVersion < 4)) {
          return {
            supported: false,
            reason: `iOS ${majorVersion}.${minorVersion} does not support push notifications`,
            browserName: 'Safari (iOS)',
            browserVersion: `${majorVersion}.${minorVersion}`,
            platform: 'iOS',
            recommendations: [
              'Update your iPhone/iPad to iOS 16.4 or later',
              'Go to Settings → General → Software Update',
              'Push notifications are only available on iOS 16.4+'
            ]
          };
        }
      }
    }

    // Check for secure context (HTTPS required)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      return {
        supported: false,
        reason: 'Push notifications require a secure connection (HTTPS)',
        browserName,
        browserVersion,
        platform,
        recommendations: [
          'Access the site using HTTPS',
          'Push notifications only work on secure connections',
          'Contact your administrator if you see this message'
        ]
      };
    }

    // All checks passed!
    return {
      supported: true,
      browserName,
      browserVersion,
      platform
    };
  }

  /**
   * Check current permission state
   */
  static async getPermissionState(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Request notification permission from user
   */
  static async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      logger.warn('[Push] Push notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
return permission === 'granted';
    } catch (error) {
      logger.error('[Push] Permission request failed:', error);
      return false;
    }
  }

  /**
   * Subscribe to push notifications
   *
   * @param role - User role (admin, judge, steward, exhibitor)
   * @param licenseKey - Show license key
   * @param favoriteArmbands - Array of armband numbers user has favorited
   */
  static async subscribe(
    role: string,
    licenseKey: string,
    favoriteArmbands: number[] = []
  ): Promise<boolean> {
    try {
      // 1. Check support
      if (!this.isSupported()) {
        throw new Error('Push notifications not supported');
      }

      // 2. Check/request permission
      const permission = await this.getPermissionState();
      if (permission === 'denied') {
        throw new Error('Notification permission denied');
      }
      if (permission === 'default') {
        const granted = await this.requestPermission();
        if (!granted) {
          throw new Error('Notification permission not granted');
        }
      }

      // 3. Get service worker registration
      const registration = await navigator.serviceWorker.ready;
// 4. Subscribe to push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      });

// 5. Extract subscription data
      const subscriptionJson = subscription.toJSON();
      const p256dh = subscriptionJson.keys?.p256dh;
      const auth = subscriptionJson.keys?.auth;
      const endpoint = subscriptionJson.endpoint;

      if (!p256dh || !auth || !endpoint) {
        throw new Error('Invalid subscription data');
      }

      // 6. Generate unique browser-based user ID
      const userId = this.getBrowserUserId(role);

      // 7. Get passcode for troubleshooting (if available)
      const passcode = this.getStoredPasscode();

      // 8. Save to database
      const subscriptionData: PushSubscriptionData = {
        endpoint,
        p256dh,
        auth,
        user_id: userId,
        user_role: role,
        license_key: licenseKey,
        user_agent: navigator.userAgent,
        passcode, // For troubleshooting - identifies which user subscribed
        notification_preferences: {
          announcements: true,
          up_soon: true,
          spam_limit: 10,
          favorite_armbands: favoriteArmbands,
          dogs_ahead: useSettingsStore.getState().settings.notifyYourTurnLeadDogs
        }
      };

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(subscriptionData, {
          onConflict: 'endpoint', // Update if already exists
        });

      if (error) {
        logger.error('[Push] Database save error:', error);
        throw error;
      }

return true;

    } catch (error) {
      logger.error('[Push] Subscribe error:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  static async unsubscribe(): Promise<boolean> {
    try {
      if (!this.isSupported()) {
        return false;
      }

      // 1. Get current subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
return true;
      }

      // 2. Unsubscribe from browser
      await subscription.unsubscribe();
// 3. Remove from database
      const endpoint = subscription.endpoint;
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      if (error) {
        logger.error('[Push] Database delete error:', error);
        throw error;
      }

return true;

    } catch (error) {
      logger.error('[Push] Unsubscribe error:', error);
      return false;
    }
  }

  /**
   * Update favorite armbands for current subscription
   */
  static async updateFavoriteArmbands(favoriteArmbands: number[]): Promise<boolean> {
    try {
      if (!this.isSupported()) {
        return false;
      }

      // Get current subscription endpoint
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        logger.warn('[Push] No active subscription - cannot update favorites');
        return false;
      }

      // Update database
      const { error } = await supabase
        .from('push_subscriptions')
        .update({
          notification_preferences: {
            announcements: true,
            up_soon: true,
            spam_limit: 10,
            favorite_armbands: favoriteArmbands,
            dogs_ahead: useSettingsStore.getState().settings.notifyYourTurnLeadDogs
          }
        })
        .eq('endpoint', subscription.endpoint);

      if (error) {
        logger.error('[Push] Update favorites error:', error);
        throw error;
      }

return true;

    } catch (error) {
      logger.error('[Push] Update favorites error:', error);
      return false;
    }
  }

  /**
   * Switch subscription to a new show (auto-switch strategy)
   *
   * This is called automatically when user opens a different show.
   * Updates the existing subscription's license_key and favorite_armbands.
   *
   * @param licenseKey - New show license key
   * @param favoriteArmbands - Favorite armbands for new show (from localStorage)
   */
  static async switchToShow(licenseKey: string, favoriteArmbands: number[] = []): Promise<boolean> {
    try {
      if (!this.isSupported()) {
        return false;
      }

      // Get current subscription endpoint
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
return false;
      }

      // Get passcode for troubleshooting (if available)
      const passcode = this.getStoredPasscode();

      // Update database with new show information
      const { error } = await supabase
        .from('push_subscriptions')
        .update({
          license_key: licenseKey,
          passcode, // Update passcode in case user logged in with different role
          notification_preferences: {
            announcements: true,
            up_soon: true,
            spam_limit: 10,
            favorite_armbands: favoriteArmbands,
            dogs_ahead: useSettingsStore.getState().settings.notifyYourTurnLeadDogs
          },
          updated_at: new Date().toISOString()
        })
        .eq('endpoint', subscription.endpoint);

      if (error) {
        logger.error('[Push] Switch show error:', error);
        throw error;
      }

return true;

    } catch (error) {
      logger.error('[Push] Switch show error:', error);
      return false;
    }
  }

  /**
   * Check if currently subscribed
   */
  static async isSubscribed(): Promise<boolean> {
    try {
      if (!this.isSupported()) {
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      return subscription !== null;
    } catch (error) {
      logger.error('[Push] Check subscription error:', error);
      return false;
    }
  }

  /**
   * Get current subscription details
   */
  static async getSubscription(): Promise<PushSubscription | null> {
    try {
      if (!this.isSupported()) {
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    } catch (error) {
      logger.error('[Push] Get subscription error:', error);
      return null;
    }
  }

  /**
   * Convert VAPID public key to Uint8Array
   */
  private static urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

export default PushNotificationService;
