import { useState, useEffect, useCallback } from 'react';
import { NotificationPreferences } from '@/types/exhibitor-types';
import { logger } from '@/services/LoggingService';

interface PushNotificationState {
  supported: boolean;
  permission: NotificationPermission;
  preferences: NotificationPreferences;
  requestPermission: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  sendNotification: (title: string, options?: NotificationOptions) => void;
}

const defaultPreferences: NotificationPreferences = {
  ringCalls: true,
  results: true,
  delays: true,
  scheduling: true,
  titles: true
};

export function usePushNotifications(): PushNotificationState {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);

  // Check if notifications are supported
  useEffect(() => {
    setSupported('Notification' in window);
    if ('Notification' in window) {
      setPermission(Notification.permission);
      
      // Load saved preferences
      const saved = localStorage.getItem('notificationPreferences');
      if (saved) {
        try {
          setPreferences(JSON.parse(saved));
        } catch (e) {
          logger.error('Error loading notification preferences:', 'hooks', {}, e as Error);
        }
      }
    }
  }, []);


  // Send a notification
  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!supported || permission !== 'granted') return;

    try {
      const notificationOptions: NotificationOptions = {
        icon: '/logo.png',
        badge: '/badge.png',
        ...options
      };

      const notification = new Notification(title, notificationOptions);

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    } catch (error) {
      logger.error('Error sending notification:', 'hooks', {}, error as Error);
    }
  }, [supported, permission]);

  // Update notification preferences
  const updatePreferences = useCallback((prefs: Partial<NotificationPreferences>) => {
    const newPrefs = { ...preferences, ...prefs };
    setPreferences(newPrefs);
    localStorage.setItem('notificationPreferences', JSON.stringify(newPrefs));
  }, [preferences]);

  // Request permission with welcome notification
  const requestPermissionWithWelcome = useCallback(async () => {
    if (!supported) return;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        // Send a welcome notification
        sendNotification('Notifications Enabled!', {
          body: 'You\'ll receive updates about your ring times and results.',
          icon: '/logo.png',
          badge: '/badge.png'
        });
      }
    } catch (error) {
      logger.error('Error requesting notification permission:', 'hooks', {}, error as Error);
    }
  }, [supported, sendNotification]);


  return {
    supported,
    permission,
    preferences,
    requestPermission: requestPermissionWithWelcome,
    updatePreferences,
    sendNotification
  };
}

// Notification templates for different scenarios
export const notificationTemplates = {
  ringCall: (ringNumber: number, position: number) => ({
    title: '🔔 Ring Call!',
    options: {
      body: `You're ${position === 1 ? 'next' : `${position} dogs away`} at Ring ${ringNumber}`,
      tag: 'ring-call',
      requireInteraction: true
    }
  }),

  resultPosted: (className: string, placement?: number) => ({
    title: '🏆 Results Posted!',
    options: {
      body: placement 
        ? `You placed ${placement}${getOrdinalSuffix(placement)} in ${className}!`
        : `Your results for ${className} are now available`,
      tag: 'result-posted'
    }
  }),

  ringDelay: (ringNumber: number, minutes: number) => ({
    title: '⏰ Ring Delay',
    options: {
      body: `Ring ${ringNumber} is running ${minutes} minutes behind schedule`,
      tag: 'ring-delay'
    }
  }),

  scheduleChange: (className: string, newTime: string) => ({
    title: '📅 Schedule Change',
    options: {
      body: `${className} has been moved to ${newTime}`,
      tag: 'schedule-change'
    }
  }),

  titleLeg: (title: string, legsNeeded: number) => ({
    title: '🎉 Title Progress!',
    options: {
      body: legsNeeded === 0 
        ? `Congratulations! You've completed your ${title}!`
        : `Great job! You need ${legsNeeded} more leg${legsNeeded === 1 ? '' : 's'} for ${title}`,
      tag: 'title-progress'
    }
  })
};

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}