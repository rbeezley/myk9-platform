/**
 * React Hook for FCM Notification Management
 * Provides notification permission management, token handling, and user preferences
 */

import { useState, useEffect, useCallback } from 'react';
import { fcmService } from '@/services/notifications/FCMService';
import { supabase } from '@/lib/supabase';
import { 
  NotificationPreferences, 
  NotificationPayload,
  NotificationTemplateKey
} from '@/types/notification-types';
import { reportInfo, reportWarning, reportStoreError } from '@/utils/standardizedErrorHandler';

export interface NotificationState {
  // Permission and support
  isSupported: boolean;
  permission: NotificationPermission | null;
  isInitialized: boolean;
  
  // FCM token
  fcmToken: string | null;
  tokenLoading: boolean;
  
  // User preferences
  preferences: NotificationPreferences | null;
  preferencesLoading: boolean;
  
  // Error handling
  error: string | null;
  
  // In-app notifications
  currentNotification: NotificationPayload | null;
}

export interface NotificationActions {
  // Initialization and permissions
  initialize: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
  
  // Token management
  getToken: () => Promise<string | null>;
  refreshToken: () => Promise<string | null>;
  
  // Preferences management
  loadPreferences: () => Promise<void>;
  updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
  subscribeToTopics: (topics: string[]) => Promise<void>;
  unsubscribeFromTopics: (topics: string[]) => Promise<void>;
  
  // Notification interaction
  dismissCurrentNotification: () => void;
  testNotification: (templateKey: NotificationTemplateKey, data?: Record<string, unknown>) => Promise<void>;
  
  // Cleanup
  cleanup: () => void;
  clearError: () => void;
}

export function useNotifications(userId?: string) {
  const [state, setState] = useState<NotificationState>({
    isSupported: false,
    permission: null,
    isInitialized: false,
    fcmToken: null,
    tokenLoading: false,
    preferences: null,
    preferencesLoading: false,
    error: null,
    currentNotification: null,
  });

  // Load user preferences - defined early to avoid circular dependency
  const loadPreferences = useCallback(async (): Promise<void> => {
    if (!userId) return;
    
    try {
      setState(prev => ({ ...prev, preferencesLoading: true, error: null }));

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      // Map database columns to NotificationPreferences structure
      // Cast data to access all columns (some may not be in strict Supabase types)
      const dbData = data as Record<string, unknown>;
      const preferences: NotificationPreferences = data ? {
        userId: (dbData.user_id as string) || userId,
        enabled: (dbData.push_enabled as boolean) ?? true,
        // fcmToken is optional and should be omitted when not present
        types: {
          showReminders: (dbData.show_reminders as boolean) ?? true,
          entryDeadlines: true,
          resultUpdates: (dbData.result_updates as boolean) ?? true,
          scheduleChanges: (dbData.schedule_updates as boolean) ?? true,
          judgeAssignments: false,
          emergencyAlerts: true,
          paymentReminders: (dbData.payment_receipts as boolean) ?? true,
          entryConfirmations: (dbData.entry_confirmations as boolean) ?? true,
        },
        timing: {
          showReminderHours: [24, 48],
          entryDeadlineHours: [24, 48],
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York"
          }
        },
        delivery: {
          browser: (dbData.push_enabled as boolean) ?? true,
          email: (dbData.email_enabled as boolean) ?? true,
          sms: (dbData.sms_enabled as boolean) ?? false
        },
        topics: [],
        createdAt: new Date((dbData.created_at as string) || Date.now()),
        updatedAt: new Date((dbData.updated_at as string) || Date.now())
      } : {
        userId,
        enabled: true,
        types: {
          showReminders: true,
          entryDeadlines: true,
          resultUpdates: true,
          scheduleChanges: true,
          judgeAssignments: false,
          emergencyAlerts: true,
          paymentReminders: true,
          entryConfirmations: true,
        },
        timing: {
          showReminderHours: [24, 48],
          entryDeadlineHours: [24, 48],
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York"
          }
        },
        delivery: {
          browser: true,
          email: true,
          sms: false
        },
        topics: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      setState(prev => ({ 
        ...prev, 
        preferences, 
        preferencesLoading: false 
      }));

      reportInfo('notifications', 'Preferences loaded successfully');
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        preferencesLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load preferences'
      }));
      reportStoreError('loadPreferences', 'useNotifications', error, { userId });
    }
  }, [userId]);

  // Initialize FCM service
  const initialize = useCallback(async (): Promise<boolean> => {
    try {
      if (!userId) {
        setState(prev => ({ ...prev, error: 'User ID is required' }));
        return false;
      }

      setState(prev => ({ ...prev, error: null }));

      // Check if FCM is supported
      const isSupported = fcmService.isSupported();
      
      setState(prev => ({ 
        ...prev, 
        isSupported,
        permission: Notification.permission 
      }));

      if (!isSupported) {
        reportWarning('notifications', 'FCM not supported in this browser');
        return false;
      }

      // Initialize FCM service
      const initialized = await fcmService.initialize(userId);
      
      setState(prev => ({ ...prev, isInitialized: initialized }));

      if (initialized) {
        // Load user preferences
        await loadPreferences();
        reportInfo('notifications', 'FCM service initialized successfully');
      }

      return initialized;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize notifications';
      setState(prev => ({ ...prev, error: errorMessage }));
      reportStoreError('initialize', 'useNotifications', error, { userId });
      return false;
    }
  }, [userId, loadPreferences]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, error: null, tokenLoading: true }));

      const token = await fcmService.requestPermissionAndGetToken();
      const permission = Notification.permission;

      setState(prev => ({ 
        ...prev, 
        permission,
        fcmToken: token,
        tokenLoading: false
      }));

      if (token) {
        reportInfo('notifications', 'Permission granted and token obtained');
        return true;
      } else {
        reportWarning('notifications', 'Permission denied or token not obtained');
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request permission';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage, 
        tokenLoading: false 
      }));
      reportStoreError('requestPermission', 'useNotifications', error);
      return false;
    }
  }, []);

  // Get current FCM token
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      setState(prev => ({ ...prev, tokenLoading: true }));
      
      const token = await fcmService.getOrRefreshToken();
      
      setState(prev => ({ 
        ...prev, 
        fcmToken: token, 
        tokenLoading: false 
      }));
      
      return token;
    } catch (error) {
      setState(prev => ({ ...prev, tokenLoading: false }));
      reportStoreError('getToken', 'useNotifications', error);
      return null;
    }
  }, []);

  // Refresh FCM token
  const refreshToken = useCallback(async (): Promise<string | null> => {
    return await getToken();
  }, [getToken]);


  // Update notification preferences
  const updatePreferences = useCallback(async (
    updates: Partial<NotificationPreferences>
  ): Promise<void> => {
    try {
      if (!userId) return;

      setState(prev => ({ ...prev, preferencesLoading: true }));

      // Map NotificationPreferences to database columns
      const dbUpdates: Record<string, unknown> = {
        user_id: userId,
        updated_at: new Date().toISOString()
      };

      if (updates.enabled !== undefined) {
        dbUpdates.push_enabled = updates.enabled;
      }
      if (updates.types) {
        if (updates.types.showReminders !== undefined) dbUpdates.show_reminders = updates.types.showReminders;
        if (updates.types.resultUpdates !== undefined) dbUpdates.result_updates = updates.types.resultUpdates;
        if (updates.types.scheduleChanges !== undefined) dbUpdates.schedule_updates = updates.types.scheduleChanges;
        if (updates.types.paymentReminders !== undefined) dbUpdates.payment_receipts = updates.types.paymentReminders;
        if (updates.types.entryConfirmations !== undefined) dbUpdates.entry_confirmations = updates.types.entryConfirmations;
      }
      if (updates.delivery) {
        if (updates.delivery.browser !== undefined) dbUpdates.push_enabled = updates.delivery.browser;
        if (updates.delivery.email !== undefined) dbUpdates.email_enabled = updates.delivery.email;
        if (updates.delivery.sms !== undefined) dbUpdates.sms_enabled = updates.delivery.sms;
      }

      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert(dbUpdates, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Convert database row to NotificationPreferences interface
      // Cast data to access all columns (some may not be in strict Supabase types)
      const dbResult = data as Record<string, unknown>;
      const updatedPrefs: NotificationPreferences = {
        userId: (dbResult.user_id as string) || userId,
        enabled: (dbResult.push_enabled as boolean) ?? true,
        // fcmToken is optional and should be omitted when not present
        types: {
          showReminders: (dbResult.show_reminders as boolean) ?? true,
          entryDeadlines: true,
          resultUpdates: (dbResult.result_updates as boolean) ?? true,
          scheduleChanges: (dbResult.schedule_updates as boolean) ?? true,
          judgeAssignments: false,
          emergencyAlerts: true,
          paymentReminders: (dbResult.payment_receipts as boolean) ?? true,
          entryConfirmations: (dbResult.entry_confirmations as boolean) ?? true,
        },
        timing: {
          showReminderHours: [24, 48],
          entryDeadlineHours: [24, 48],
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York"
          }
        },
        delivery: {
          browser: (dbResult.push_enabled as boolean) ?? true,
          email: (dbResult.email_enabled as boolean) ?? true,
          sms: (dbResult.sms_enabled as boolean) ?? false
        },
        topics: [],
        createdAt: new Date((dbResult.created_at as string) || Date.now()),
        updatedAt: new Date((dbResult.updated_at as string) || Date.now())
      };

      setState(prev => ({
        ...prev,
        preferences: updatedPrefs,
        preferencesLoading: false
      }));

      reportInfo('notifications', 'Preferences updated successfully');
    } catch (error) {
      setState(prev => ({ ...prev, preferencesLoading: false }));
      reportStoreError('updatePreferences', 'useNotifications', error, { userId, updates });
      throw error;
    }
  }, [userId]);

  // Subscribe to FCM topics
  const subscribeToTopics = useCallback(async (topics: string[]): Promise<void> => {
    try {
      await fcmService.subscribeToTopics(topics);
      
      // Update preferences with new topics
      if (state.preferences) {
        const existingTopics = state.preferences.topics || [];
        const newTopics = [...new Set([...existingTopics, ...topics])];
        
        await updatePreferences({ topics: newTopics });
      }
      
      reportInfo('notifications', 'Subscribed to topics', { topics });
    } catch (error) {
      reportStoreError('subscribeToTopics', 'useNotifications', error, { topics });
      throw error;
    }
  }, [state.preferences, updatePreferences]);

  // Unsubscribe from FCM topics
  const unsubscribeFromTopics = useCallback(async (topics: string[]): Promise<void> => {
    try {
      await fcmService.unsubscribeFromTopics(topics);
      
      // Update preferences to remove topics
      if (state.preferences) {
        const updatedTopics = (state.preferences.topics || []).filter(
          topic => !topics.includes(topic)
        );
        
        await updatePreferences({ topics: updatedTopics });
      }
      
      reportInfo('notifications', 'Unsubscribed from topics', { topics });
    } catch (error) {
      reportStoreError('unsubscribeFromTopics', 'useNotifications', error, { topics });
      throw error;
    }
  }, [state.preferences, updatePreferences]);

  // Dismiss current in-app notification
  const dismissCurrentNotification = useCallback(() => {
    setState(prev => ({ ...prev, currentNotification: null }));
  }, []);

  // Send test notification
  const testNotification = useCallback(async (
    templateKey: NotificationTemplateKey, 
    data: Record<string, unknown> = {}
  ): Promise<void> => {
    try {
      // This would typically be handled by your backend
      // For now, we'll show a test in-app notification
      const testPayload: NotificationPayload = {
        title: `Test: ${templateKey}`,
        body: 'This is a test notification',
        icon: '/icons/notification-icon.png',
        badge: '/icons/app-badge.png',
        tag: 'test-notification',
        timestamp: Date.now(),
        data: { templateKey, ...data }
      };

      setState(prev => ({ ...prev, currentNotification: testPayload }));
      
      reportInfo('notifications', 'Test notification sent', { templateKey });
    } catch (error) {
      reportStoreError('testNotification', 'useNotifications', error, { templateKey, data });
      throw error;
    }
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    fcmService.cleanup();
    setState(prev => ({ 
      ...prev, 
      isInitialized: false, 
      fcmToken: null,
      currentNotification: null 
    }));
  }, []);

  // Set up in-app notification listener
  useEffect(() => {
    const handleInAppNotification = (event: CustomEvent<NotificationPayload>) => {
      setState(prev => ({ ...prev, currentNotification: event.detail }));
    };

    window.addEventListener('in-app-notification', handleInAppNotification as EventListener);

    return () => {
      window.removeEventListener('in-app-notification', handleInAppNotification as EventListener);
    };
  }, []);

  // Auto-initialize when userId is available
  useEffect(() => {
    if (userId && !state.isInitialized && !state.error) {
      initialize();
    }
  }, [userId, state.isInitialized, state.error, initialize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const actions: NotificationActions = {
    initialize,
    requestPermission,
    getToken,
    refreshToken,
    loadPreferences,
    updatePreferences,
    subscribeToTopics,
    unsubscribeFromTopics,
    dismissCurrentNotification,
    testNotification,
    cleanup,
    clearError,
  };

  return {
    ...state,
    actions
  };
}