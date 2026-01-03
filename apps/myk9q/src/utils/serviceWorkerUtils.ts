/**
 * Service Worker Utilities for Push Notifications
 * Handles communication between main thread and service worker
 */

import { getVapidPublicKey } from '../config/pushNotifications';
import { logger } from '@/utils/logger';

export interface ServiceWorkerMessage {
  type: string;
  [key: string]: unknown;
}

export class ServiceWorkerManager {
  private static instance: ServiceWorkerManager;
  private registration: ServiceWorkerRegistration | null = null;
  private currentLicenseKey: string | null = null;

  static getInstance(): ServiceWorkerManager {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  /**
   * Initialize service worker manager
   */
  async initialize(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      logger.warn('Service Worker not supported');
      return;
    }

    try {
      // Wait for service worker to be ready
      this.registration = await navigator.serviceWorker.ready;
// Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));

      // Listen for notification clicks
      this.setupNotificationClickHandler();

    } catch (error) {
      logger.error('Failed to initialize Service Worker Manager:', error);
    }
  }

  /**
   * Update the license key for tenant isolation
   */
  updateLicenseKey(licenseKey: string): void {
    this.currentLicenseKey = licenseKey;
    void this.currentLicenseKey; // Reserved for future tenant-specific caching

    if (this.registration?.active) {
      this.sendMessageToServiceWorker({
        type: 'UPDATE_LICENSE_KEY',
        licenseKey: licenseKey
      });
    }
  }

  /**
   * Get current push subscription
   */
  async getPushSubscription(): Promise<PushSubscription | null> {
    if (!this.registration) {
      await this.initialize();
    }

    if (!this.registration) {
      return null;
    }

    try {
      return await this.registration.pushManager.getSubscription();
    } catch (error) {
      logger.error('Failed to get push subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPushNotifications(vapidKey?: string): Promise<PushSubscription | null> {
    // Use provided VAPID key or get from config
    const publicKey = vapidKey || getVapidPublicKey();
    if (!this.registration) {
      await this.initialize();
    }

    if (!this.registration) {
      throw new Error('Service Worker not available');
    }

    if (Notification.permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }

    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey ? this.urlBase64ToUint8Array(publicKey) as BufferSource : undefined
      });

return subscription;
    } catch (error) {
      logger.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPushNotifications(): Promise<boolean> {
    const subscription = await this.getPushSubscription();

    if (!subscription) {
      return true;
    }

    try {
      const result = await subscription.unsubscribe();
return result;
    } catch (error) {
      logger.error('Failed to unsubscribe from push notifications:', error);
      return false;
    }
  }

  /**
   * Send message to service worker
   */
  private sendMessageToServiceWorker(message: ServiceWorkerMessage): void {
    if (this.registration?.active) {
      this.registration.active.postMessage(message);
    }
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { data } = event;

    if (data?.type === 'NOTIFICATION_CLICK') {
      // Handle notification click - navigate to specific page
      if (data.url && window.location.pathname !== data.url) {
        window.location.href = data.url;
      }

      // Focus the window
      window.focus();
    }
  }

  /**
   * Setup notification click handling for when app is already open
   */
  private setupNotificationClickHandler(): void {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        // If we're on React Router, we could use navigate here instead
        // For now, use simple navigation
        const url = event.data.url || '/announcements';
        if (window.location.pathname !== url) {
          window.location.href = url;
        }
        window.focus();
      }
    });
  }

  /**
   * Convert VAPID key from base64 to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
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

  /**
   * Test push notification (for development)
   */
  async sendTestNotification(): Promise<void> {
    if (!this.registration) {
      throw new Error('Service Worker not available');
    }

    // This would normally come from your server
    // For testing, we can simulate a push event
    if (Notification.permission === 'granted') {
const notification = new Notification('🧪 Test Notification', {
        body: 'This is a test notification from myK9Q Service Worker Manager',
        tag: 'test-sw-manager',
        requireInteraction: false
      });

      notification.onshow = () => {};

      notification.onerror = (error) => {
        logger.error('❌ Test notification error:', error);
      };

      notification.onclick = () => {
notification.close();
      };
    } else {
      logger.warn('❌ Notification permission not granted:', Notification.permission);
    }
  }
}

// Export singleton instance
export const serviceWorkerManager = ServiceWorkerManager.getInstance();