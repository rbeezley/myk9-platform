import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Clock, Shield, Smartphone } from 'lucide-react';
import { serviceWorkerManager } from '../../utils/serviceWorkerUtils';
import { pushNotificationService } from '../../utils/pushNotificationService';
import { useAnnouncementStore } from '../../stores/announcementStore';
import { logger } from '@/utils/logger';
import './NotificationSettings.css';

interface NotificationPreferences {
  enabled: boolean;
  urgentEnabled: boolean;
  highEnabled: boolean;
  normalEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStartTime: string;
  quietEndTime: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const defaultPreferences: NotificationPreferences = {
  enabled: false,
  urgentEnabled: true,
  highEnabled: true,
  normalEnabled: false,
  quietHoursEnabled: false,
  quietStartTime: '22:00',
  quietEndTime: '08:00',
  soundEnabled: true,
  vibrationEnabled: true
};

/**
 * Handle granted notification permission
 * Extracted to reduce nesting depth (DEBT-009)
 */
async function handleGrantedPermission(
  currentLicenseKey: string | null,
  setPreferences: React.Dispatch<React.SetStateAction<NotificationPreferences>>
): Promise<void> {
  try {
    const subscription = await serviceWorkerManager.subscribeToPushNotifications();
    // Store subscription with push notification service
    if (subscription && currentLicenseKey) {
      const userId = sessionStorage.getItem('user_session_id') || 'anonymous';
      pushNotificationService.storeSubscription(subscription, currentLicenseKey, userId);
    }
    setPreferences(prev => ({ ...prev, enabled: true }));
  } catch (subscriptionError) {
    logger.warn('Push subscription failed, but basic notifications will still work:', subscriptionError);
    // Even if push subscription fails, basic notifications can still work
    setPreferences(prev => ({ ...prev, enabled: true }));
  }
}

export const NotificationSettings: React.FC = () => {
  const { currentLicenseKey } = useAnnouncementStore();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Load preferences from localStorage on component mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('notification_preferences');
    if (savedPreferences) {
      try {
        setPreferences({ ...defaultPreferences, ...JSON.parse(savedPreferences) });
      } catch (error) {
        logger.error('Error loading notification preferences:', error);
      }
    }

    // Check current permission status
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notification_preferences', JSON.stringify(preferences));
  }, [preferences]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    if ('serviceWorker' in navigator) {
      setIsLoading(true);
      try {
        const permission = await Notification.requestPermission();
        setPermission(permission);

        if (permission === 'granted') {
          // Subscribe to push notifications using service worker manager
          await handleGrantedPermission(currentLicenseKey, setPreferences);
        }
      } catch (error) {
        logger.error('Error requesting notification permission:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const sendTestNotification = async () => {
    setTestStatus('sending');

    try {
      // Check and request permission if needed
      if (permission !== 'granted') {
const newPermission = await Notification.requestPermission();
        setPermission(newPermission);

        if (newPermission !== 'granted') {
          alert('Notification permission denied. Please enable notifications in browser settings.');
          setTestStatus('error');
          setTimeout(() => setTestStatus('idle'), 3000);
          return;
        }
      }

      // Send test notification using service worker manager
      await serviceWorkerManager.sendTestNotification();

      setTestStatus('sent');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (error) {
      logger.error('Error sending test notification:', error);
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const getPermissionStatus = () => {
    switch (permission) {
      case 'granted':
        return { text: 'Enabled', color: 'success', icon: Bell };
      case 'denied':
        return { text: 'Blocked', color: 'error', icon: BellOff };
      default:
        return { text: 'Not Set', color: 'warning', icon: Bell };
    }
  };

  const status = getPermissionStatus();
  const StatusIcon = status.icon;

  return (
    <div className="notification-settings">
      <div className="settings-header">
        <div className="settings-title">
          <Bell className="settings-icon" />
          <h3>Push Notifications</h3>
        </div>
        <div className={`permission-status ${status.color}`}>
          <StatusIcon size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span>{status.text}</span>
        </div>
      </div>

      {permission === 'default' && (
        <div className="permission-request">
          <div className="request-content">
            <Smartphone className="request-icon" />
            <div className="request-text">
              <h4>Enable Push Notifications</h4>
              <p>Get instant alerts for urgent announcements, even when the app is in the background.</p>
            </div>
          </div>
          <button
            className="permission-button"
            onClick={requestPermission}
            disabled={isLoading}
          >
            {isLoading ? 'Requesting...' : 'Enable Notifications'}
          </button>
        </div>
      )}

      {permission === 'denied' && (
        <div className="permission-blocked">
          <Shield className="blocked-icon" />
          <div className="blocked-content">
            <h4>Notifications Blocked</h4>
            <p>To enable notifications, click the 🔒 icon in your browser's address bar and allow notifications for this site.</p>
          </div>
        </div>
      )}

      {permission === 'granted' && (
        <div className="settings-content">
          {/* Priority Settings */}
          <div className="settings-section">
            <h4>Notification Types</h4>
            <div className="setting-row">
              <div className="setting-info">
                <span className="priority-badge urgent">🚨 URGENT</span>
                <span className="setting-description">Critical show updates (always notify)</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.urgentEnabled}
                  onChange={(e) => updatePreference('urgentEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <span className="priority-badge high">⚠️ HIGH</span>
                <span className="setting-description">Important announcements</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.highEnabled}
                  onChange={(e) => updatePreference('highEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <span className="priority-badge normal">ℹ️ NORMAL</span>
                <span className="setting-description">General show information</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.normalEnabled}
                  onChange={(e) => updatePreference('normalEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Sound & Vibration */}
          <div className="settings-section">
            <h4>Notification Behavior</h4>
            <div className="setting-row">
              <div className="setting-info">
                {preferences.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />}
                <span>Sound</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => updatePreference('soundEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <Smartphone size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                <span>Vibration</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.vibrationEnabled}
                  onChange={(e) => updatePreference('vibrationEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="settings-section">
            <h4>Quiet Hours</h4>
            <div className="setting-row">
              <div className="setting-info">
                <Clock size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                <span>Do not disturb</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.quietHoursEnabled}
                  onChange={(e) => updatePreference('quietHoursEnabled', e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            {preferences.quietHoursEnabled && (
              <div className="quiet-hours-settings">
                <div className="time-inputs">
                  <div className="time-input-group">
                    <label>From:</label>
                    <input
                      type="time"
                      value={preferences.quietStartTime}
                      onChange={(e) => updatePreference('quietStartTime', e.target.value)}
                    />
                  </div>
                  <div className="time-input-group">
                    <label>To:</label>
                    <input
                      type="time"
                      value={preferences.quietEndTime}
                      onChange={(e) => updatePreference('quietEndTime', e.target.value)}
                    />
                  </div>
                </div>
                <p className="quiet-hours-note">
                  Urgent notifications will still be shown during quiet hours
                </p>
              </div>
            )}
          </div>

          {/* Test Notification */}
          <div className="settings-section">
            <h4>Test Notifications</h4>
            <button
              className={`test-button ${testStatus}`}
              onClick={sendTestNotification}
              disabled={testStatus === 'sending'}
            >
              {testStatus === 'sending' && '⏳ Sending...'}
              {testStatus === 'sent' && '✅ Test Sent!'}
              {testStatus === 'error' && '❌ Failed'}
              {testStatus === 'idle' && '🧪 Send Test Notification'}
            </button>

            {/* Test Push Notification Button */}
            {currentLicenseKey && (
              <button
                className={`test-button ${testStatus}`}
                onClick={() => {
                  if (currentLicenseKey) {
                    setTestStatus('sending');
                    pushNotificationService.sendTestNotification(currentLicenseKey)
                      .then(() => {
                        setTestStatus('sent');
                        setTimeout(() => setTestStatus('idle'), 3000);
                      })
                      .catch(() => {
                        setTestStatus('error');
                        setTimeout(() => setTestStatus('idle'), 3000);
                      });
                  }
                }}
                disabled={testStatus === 'sending'}
                style={{ marginTop: '10px' }}
              >
                {testStatus === 'sending' && '⏳ Sending Push...'}
                {testStatus === 'sent' && '✅ Push Sent!'}
                {testStatus === 'error' && '❌ Push Failed'}
                {testStatus === 'idle' && '🚀 Test Push Notification'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};