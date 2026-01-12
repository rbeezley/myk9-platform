/**
 * Firebase Cloud Messaging Service
 * Handles FCM token management, message receiving, and notification permissions
 */

import { 
import { logger } from '@/services/LoggingService';
  getToken, 
  onMessage, 
  deleteToken,
  MessagePayload,
  Unsubscribe 
} from 'firebase/messaging';
import { getFirebaseMessaging, isFCMConfigured } from '@/config/firebase';
import { supabase } from '@/lib/supabase';
import { 
  NotificationPayload, 
  FCMTokenRecord, 
  ServiceWorkerMessage 
} from '@/types/notification-types';
import { reportInfo, reportWarning, reportStoreError } from '@/utils/standardizedErrorHandler';

export class FCMService {
  private messaging;
  private currentToken: string | null = null;
  private messageUnsubscribe: Unsubscribe | null = null;
  private userId: string | null = null;

  constructor() {
    this.messaging = getFirebaseMessaging();
    this.initializeServiceWorkerListeners();
  }

  /**
   * Initialize the FCM service for a specific user
   */
  async initialize(userId: string): Promise<boolean> {
    try {
      if (!isFCMConfigured()) {
        reportWarning('fcm', 'FCM not properly configured - missing environment variables');
        return false;
      }

      if (!this.messaging) {
        reportWarning('fcm', 'FCM messaging not available');
        return false;
      }

      this.userId = userId;
      
      // Set up foreground message handling
      this.setupForegroundMessageHandler();
      
      reportInfo('fcm', 'FCM service initialized', { userId });
      return true;
    } catch (error) {
      reportStoreError('initialize', 'FCMService', error, { userId });
      return false;
    }
  }

  /**
   * Request notification permission and get FCM token
   */
  async requestPermissionAndGetToken(): Promise<string | null> {
    try {
      if (!this.messaging || !this.userId) {
        throw new Error('FCM service not initialized');
      }

      // Check if permission is already granted
      if (Notification.permission === 'granted') {
        return await this.getOrRefreshToken();
      }

      // Request permission
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        reportInfo('fcm', 'Notification permission granted');
        return await this.getOrRefreshToken();
      } else {
        reportWarning('fcm', 'Notification permission denied', { permission });
        return null;
      }
    } catch (error) {
      reportStoreError('requestPermissionAndGetToken', 'FCMService', error);
      return null;
    }
  }

  /**
   * Get current FCM token or refresh if needed
   */
  async getOrRefreshToken(): Promise<string | null> {
    try {
      if (!this.messaging) {
        throw new Error('FCM messaging not available');
      }

      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        throw new Error('VAPID key not configured');
      }

      const token = await getToken(this.messaging, { vapidKey });
      
      if (token && token !== this.currentToken) {
        this.currentToken = token;
        await this.saveTokenToDatabase(token);
        reportInfo('fcm', 'FCM token obtained', { tokenLength: token.length });
      }

      return token;
    } catch (error) {
      reportStoreError('getOrRefreshToken', 'FCMService', error);
      return null;
    }
  }

  /**
   * Save FCM token to Supabase database
   */
  private async saveTokenToDatabase(token: string): Promise<void> {
    try {
      if (!this.userId) {
        throw new Error('User ID not set');
      }

      const tokenRecord: Omit<FCMTokenRecord, 'id'> = {
        userId: this.userId,
        token,
        deviceType: 'web',
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          browser: this.getBrowserName(),
        },
        isActive: true,
        lastUsed: new Date(),
        createdAt: new Date(),
      };

      // Map FCMTokenRecord to database schema
      const dbTokenRecord = {
        user_id: tokenRecord.userId,
        token: tokenRecord.token,
        device_type: tokenRecord.deviceType,
        device_info: JSON.stringify(tokenRecord.deviceInfo),
        is_active: tokenRecord.isActive,
        last_used: tokenRecord.lastUsed.toISOString(),
        created_at: tokenRecord.createdAt.toISOString()
      };

      const { error } = await supabase
        .from('fcm_tokens')
        .upsert(dbTokenRecord, { 
          onConflict: 'user_id,token',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }

      // Also update user preferences with current token
      await this.updateUserPreferencesToken(token);
      
      reportInfo('fcm', 'FCM token saved to database');
    } catch (error) {
      reportStoreError('saveTokenToDatabase', 'FCMService', error, { 
        userId: this.userId,
        tokenLength: token.length 
      });
    }
  }

  /**
   * Update user notification preferences with current token
   */
  private async updateUserPreferencesToken(token: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('notification_preference')
        .upsert({ 
          user_id: this.userId!,
          fcm_token: token,
          updated_at: new Date().toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      reportStoreError('updateUserPreferencesToken', 'FCMService', error);
    }
  }

  /**
   * Set up foreground message handling
   */
  private setupForegroundMessageHandler(): void {
    if (!this.messaging) return;

    // Clean up existing listener
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
    }

    this.messageUnsubscribe = onMessage(this.messaging, (payload: MessagePayload) => {
      reportInfo('fcm', 'Foreground message received', { 
        title: payload.notification?.title 
      });
      
      this.handleForegroundMessage(payload);
    });
  }

  /**
   * Handle messages received while app is in foreground
   */
  private handleForegroundMessage(payload: MessagePayload): void {
    try {
      // Convert FCM payload to our notification format
      const notification: NotificationPayload = {
        title: payload.notification?.title || 'New Notification',
        body: payload.notification?.body || '',
        icon: payload.notification?.image || '/icons/notification-icon.png',
        badge: '/icons/app-badge.png',
        tag: payload.data?.tag || 'default',
        requireInteraction: payload.data?.requireInteraction === 'true',
        timestamp: Date.now(),
        data: payload.data || {},
        url: payload.data?.url,
      };

      // Show in-app notification or browser notification
      this.showNotification(notification);
      
      // Track message received
      this.trackNotificationEvent('received', payload);
    } catch (error) {
      reportStoreError('handleForegroundMessage', 'FCMService', error, { payload });
    }
  }

  /**
   * Show notification (browser or in-app)
   */
  private async showNotification(notification: NotificationPayload): Promise<void> {
    try {
      // Check if we should show browser notification or in-app
      if (document.hidden || !document.hasFocus()) {
        // Show browser notification when app is not focused
        await this.showBrowserNotification(notification);
      } else {
        // Show in-app notification when app is focused
        this.showInAppNotification(notification);
      }
    } catch (error) {
      reportStoreError('showNotification', 'FCMService', error);
    }
  }

  /**
   * Show browser notification
   */
  private async showBrowserNotification(notification: NotificationPayload): Promise<void> {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Use service worker to show notification
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          payload: notification
        });
      } else {
        // Fallback to direct browser notification
        const browserNotification = new Notification(notification.title, {
          body: notification.body,
          icon: notification.icon,
          badge: notification.badge,
          tag: notification.tag,
          requireInteraction: notification.requireInteraction,
          data: notification.data
        });

        // Handle notification click
        browserNotification.onclick = () => {
          this.handleNotificationClick(notification);
          browserNotification.close();
        };
      }
    } catch (error) {
      reportStoreError('showBrowserNotification', 'FCMService', error);
    }
  }

  /**
   * Show in-app notification (for when app is focused)
   */
  private showInAppNotification(notification: NotificationPayload): void {
    // Dispatch custom event for in-app notification components to handle
    const event = new CustomEvent('in-app-notification', {
      detail: notification
    });
    window.dispatchEvent(event);
  }

  /**
   * Handle notification click events
   */
  private handleNotificationClick(notification: NotificationPayload): void {
    try {
      // Focus the app window
      if (window.parent) {
        window.parent.focus();
      }
      window.focus();

      // Navigate to notification URL if provided
      if (notification.url) {
        window.location.href = notification.url;
      }

      // Track click event
      this.trackNotificationEvent('clicked', notification);
    } catch (error) {
      reportStoreError('handleNotificationClick', 'FCMService', error);
    }
  }

  /**
   * Track notification events for analytics
   */
  private async trackNotificationEvent(
    event: 'received' | 'clicked' | 'dismissed', 
    payload: unknown
  ): Promise<void> {
    try {
      // TODO: Implement proper notification_event table integration
      logger.debug('📊 Event logged (mock)', 'notifications', { data: { 
        user_id: this.userId,
        event_type: event,
        payload: typeof payload === 'object' ? payload : { data: payload }
      } });
    } catch (error) {
      // Don't report tracking errors to avoid noise
      console.debug('Failed to track notification event:', error);
    }
  }

  /**
   * Subscribe to notification topics
   */
  async subscribeToTopics(topics: string[]): Promise<void> {
    try {
      if (!this.currentToken) {
        await this.getOrRefreshToken();
      }

      if (!this.currentToken) {
        throw new Error('No FCM token available');
      }

      // Use Supabase Edge Function to subscribe to topics
      const { error } = await supabase.functions.invoke('fcm-topic-subscribe', {
        body: {
          token: this.currentToken,
          topics
        }
      });

      if (error) {
        throw error;
      }

      reportInfo('fcm', 'Subscribed to topics', { topics });
    } catch (error) {
      reportStoreError('subscribeToTopics', 'FCMService', error, { topics });
    }
  }

  /**
   * Unsubscribe from notification topics
   */
  async unsubscribeFromTopics(topics: string[]): Promise<void> {
    try {
      if (!this.currentToken) {
        return;
      }

      const { error } = await supabase.functions.invoke('fcm-topic-unsubscribe', {
        body: {
          token: this.currentToken,
          topics
        }
      });

      if (error) {
        throw error;
      }

      reportInfo('fcm', 'Unsubscribed from topics', { topics });
    } catch (error) {
      reportStoreError('unsubscribeFromTopics', 'FCMService', error, { topics });
    }
  }

  /**
   * Delete current FCM token (opt-out of notifications)
   */
  async deleteToken(): Promise<void> {
    try {
      if (!this.messaging || !this.currentToken) {
        return;
      }

      await deleteToken(this.messaging);
      
      // Mark token as inactive in database
      if (this.userId) {
        await supabase
          .from('fcm_tokens')
          .update({ is_active: false })
          .eq('user_id', this.userId)
          .eq('token', this.currentToken);
      }

      this.currentToken = null;
      reportInfo('fcm', 'FCM token deleted');
    } catch (error) {
      reportStoreError('deleteToken', 'FCMService', error);
    }
  }

  /**
   * Initialize service worker message listeners
   */
  private initializeServiceWorkerListeners(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const message: ServiceWorkerMessage = event.data;
        
        switch (message.type) {
          case 'NOTIFICATION_CLICKED':
            this.handleNotificationClick(message.payload as NotificationPayload);
            break;
          case 'NOTIFICATION_CLOSED':
            this.trackNotificationEvent('dismissed', message.payload as NotificationPayload);
            break;
          case 'FCM_TOKEN_UPDATE':
            if (message.payload && typeof message.payload === 'object' && 'token' in message.payload) {
              this.currentToken = message.payload.token as string;
            }
            break;
        }
      });
    }
  }

  /**
   * Get browser name for device info
   */
  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  /**
   * Get current token (for external access)
   */
  getCurrentToken(): string | null {
    return this.currentToken;
  }

  /**
   * Check if FCM is supported and configured
   */
  isSupported(): boolean {
    return !!this.messaging && isFCMConfigured();
  }

  /**
   * Cleanup service when component unmounts
   */
  cleanup(): void {
    if (this.messageUnsubscribe) {
      this.messageUnsubscribe();
      this.messageUnsubscribe = null;
    }
    this.currentToken = null;
    this.userId = null;
  }
}

// Export singleton instance
export const fcmService = new FCMService();