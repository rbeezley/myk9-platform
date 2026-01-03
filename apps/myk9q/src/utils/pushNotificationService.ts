/**
 * Push Notification Service
 * Handles sending push notifications when announcements are created
 */

import type { Announcement } from '../stores/announcementStore';
import { logger } from '@/utils/logger';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  licenseKey: string;
  userId: string;
  createdAt: string;
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private subscriptions: Map<string, PushSubscriptionData[]> = new Map();

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Store a push subscription for a license key (tenant)
   */
  storeSubscription(subscription: PushSubscription, licenseKey: string, userId: string): void {
    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.getKey('p256dh') ? this.arrayBufferToBase64(subscription.getKey('p256dh')!) : '',
        auth: subscription.getKey('auth') ? this.arrayBufferToBase64(subscription.getKey('auth')!) : ''
      },
      licenseKey,
      userId,
      createdAt: new Date().toISOString()
    };

    // Get existing subscriptions for this license key
    const existingSubscriptions = this.subscriptions.get(licenseKey) || [];

    // Remove any existing subscription for this user to avoid duplicates
    const filteredSubscriptions = existingSubscriptions.filter(sub => sub.userId !== userId);

    // Add new subscription
    this.subscriptions.set(licenseKey, [...filteredSubscriptions, subscriptionData]);

}

  /**
   * Remove a push subscription
   */
  removeSubscription(endpoint: string, licenseKey: string): void {
    const subscriptions = this.subscriptions.get(licenseKey) || [];
    const filtered = subscriptions.filter(sub => sub.endpoint !== endpoint);
    this.subscriptions.set(licenseKey, filtered);

}

  /**
   * Send push notification to all subscribers of a license key
   * In a real app, this would be done on the server side
   */
  async sendAnnouncementNotification(announcement: Announcement): Promise<void> {
    const subscriptions = this.subscriptions.get(announcement.license_key) || [];

    if (subscriptions.length === 0) {
return;
    }

// In a real implementation, you would:
    // 1. Send this data to your server
    // 2. Server would use web-push library with VAPID keys
    // 3. Server would send push notifications to all endpoints

    // For now, we'll simulate this by triggering the service worker directly
    this.simulatePushNotification(announcement);
  }

  /**
   * Simulate server push notification by directly calling service worker
   * This is for development/testing purposes only
   */
  private async simulatePushNotification(announcement: Announcement): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;

        // Create push event data
        const pushData = {
          id: announcement.id,
          licenseKey: announcement.license_key,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority,
          showName: localStorage.getItem('current_show_name') || 'myK9Q Show',
          timestamp: new Date().toISOString()
        };

        // In a real app, this would come from the server as a real push event
        // For testing, we'll dispatch a custom event to the service worker
        registration.active?.postMessage({
          type: 'SIMULATE_PUSH',
          data: pushData
        });

} catch (error) {
        logger.error('Failed to simulate push notification:', error);
      }
    }
  }

  /**
   * Get subscription count for a license key
   */
  getSubscriptionCount(licenseKey: string): number {
    return this.subscriptions.get(licenseKey)?.length || 0;
  }

  /**
   * Get all subscriptions for debugging
   */
  getAllSubscriptions(): Map<string, PushSubscriptionData[]> {
    return this.subscriptions;
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  /**
   * Test function to send a test push notification
   */
  async sendTestNotification(licenseKey: string): Promise<void> {
    const testAnnouncement: Partial<Announcement> = {
      id: -1,
      license_key: licenseKey,
      title: '🧪 Test Push Notification',
      content: 'This is a test push notification from the Push Notification Service',
      priority: 'normal',
      author_role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true
    };

    await this.sendAnnouncementNotification(testAnnouncement as Announcement);
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();