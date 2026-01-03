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
        .from('notification_preference')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      const preferences: NotificationPreferences = data ? {
        userId: data.user_id,
        enabled: data.enabled ?? true,
        fcmToken: data.fcm_token || undefined,
        types: typeof data.types === 'object' ? data.types as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          showReminders: true,
          entryDeadlines: true,
          resultUpdates: true,
          scheduleChanges: true,
          judgeAssignments: false,
          emergencyAlerts: true,
          paymentReminders: true,
          entryConfirmations: true,
        },
        timing: typeof data.timing === 'object' ? data.timing as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          showReminderHours: [24, 48],
          entryDeadlineHours: [24, 48],
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York"
          }
        },
        delivery: typeof data.delivery === 'object' ? data.delivery as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          browser: true,
          email: true,
          sms: false
        },
        topics: Array.isArray(data.topics) ? data.topics : [],
        createdAt: new Date(data.created_at || Date.now()),
        updatedAt: new Date(data.updated_at || Date.now())
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

      const updatedPreferences = {
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('notification_preference')
        .upsert(updatedPreferences, { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Convert database row to NotificationPreferences interface
      const updatedPrefs: NotificationPreferences = {
        userId: data.user_id,
        enabled: data.enabled ?? false,
        fcmToken: data.fcm_token || undefined,
        types: typeof data.types === 'object' ? data.types as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          showReminders: true,
          entryDeadlines: true,
          resultUpdates: true,
          scheduleChanges: true,
          judgeAssignments: false,
          emergencyAlerts: true,
          paymentReminders: true,
          entryConfirmations: true,
        },
        timing: typeof data.timing === 'object' ? data.timing as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          showReminderHours: [24, 48],
          entryDeadlineHours: [24, 48],
          quietHours: {
            enabled: false,
            startTime: "22:00",
            endTime: "08:00",
            timezone: "America/New_York"
          }
        },
        delivery: typeof data.delivery === 'object' ? data.delivery as any /* eslint-disable-line @typescript-eslint/no-explicit-any */ : {
          browser: true,
          email: true,
          sms: false
        },
        topics: Array.isArray(data.topics) ? data.topics : [],
        createdAt: new Date(data.created_at || Date.now()),
        updatedAt: new Date(data.updated_at || Date.now())
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