import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Clock, Shield, Smartphone } from 'lucide-react';
import { serviceWorkerManager } from '../../utils/serviceWorkerUtils';
import { pushNotificationService } from '../../utils/pushNotificationService';
import { useAnnouncementStore } from '../../stores/announcementStore';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

/** Tailwind styles for NotificationSettings */
const styles = {
  container: cn(
    "bg-[var(--card)] rounded-[var(--token-radius-lg)]",
    "border border-[var(--border)]",
    "p-[var(--token-space-xl)] m-[var(--token-space-xl)] mb-[var(--token-space-xl)]",
    "sm:p-[var(--token-space-2xl)] sm:m-0"
  ),
  header: cn(
    "flex flex-col items-start justify-between",
    "gap-[var(--token-space-md)] mb-[var(--token-space-2xl)]",
    "pb-[var(--token-space-lg)] border-b border-[var(--border)]",
    "sm:flex-row sm:items-center sm:gap-0"
  ),
  title: "flex items-center gap-[var(--token-space-md)]",
  titleText: "m-0 text-xl font-semibold text-[var(--foreground)]",
  titleIcon: "w-5 h-5 text-[var(--primary)]",
  permissionStatus: cn(
    "flex items-center gap-[var(--token-space-sm)]",
    "py-[var(--token-space-sm)] px-[var(--token-space-md)]",
    "rounded-[var(--token-radius-md)]",
    "text-sm font-medium"
  ),
  statusSuccess: "bg-[rgba(52,199,89,0.1)] text-[var(--success)]",
  statusError: "bg-[rgba(255,59,48,0.1)] text-[var(--error)]",
  statusWarning: "bg-[rgba(255,149,0,0.1)] text-[var(--warning)]",
  permissionRequest: cn(
    "bg-[var(--muted)] rounded-[var(--token-radius-lg)]",
    "p-[var(--token-space-2xl)] text-center"
  ),
  requestContent: cn(
    "flex flex-col items-center text-center",
    "gap-[var(--token-space-lg)] mb-[var(--token-space-xl)]",
    "sm:flex-row sm:text-left"
  ),
  requestIcon: "w-12 h-12 text-[var(--primary)] shrink-0",
  requestText: "flex-1 text-center sm:text-left",
  requestTitle: "m-0 mb-[var(--token-space-sm)] text-lg font-semibold text-[var(--foreground)]",
  requestDescription: "m-0 text-[var(--muted-foreground)] leading-relaxed",
  permissionButton: cn(
    "bg-[var(--primary)] text-[var(--primary-foreground)]",
    "border-none rounded-[var(--token-radius-md)]",
    "py-[var(--token-space-lg)] px-[var(--token-space-2xl)]",
    "text-base font-semibold cursor-pointer",
    "transition-all duration-[var(--token-transition-fast)]",
    "hover:brightness-110 hover:-translate-y-px",
    "disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
  ),
  permissionBlocked: cn(
    "bg-[rgba(255,59,48,0.05)] border border-[rgba(255,59,48,0.2)]",
    "rounded-[var(--token-radius-lg)] p-[var(--token-space-2xl)]",
    "flex flex-col items-center text-center gap-[var(--token-space-lg)]",
    "sm:flex-row sm:text-left"
  ),
  blockedIcon: "w-8 h-8 text-[var(--error)] shrink-0",
  blockedTitle: "m-0 mb-[var(--token-space-sm)] text-base font-semibold text-[var(--error)]",
  blockedDescription: "m-0 text-[var(--muted-foreground)] leading-relaxed text-sm",
  settingsContent: "flex flex-col gap-[var(--token-space-2xl)]",
  settingsSection: cn(
    "bg-[var(--muted)] rounded-[var(--token-radius-lg)]",
    "p-[var(--token-space-xl)]"
  ),
  sectionTitle: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-base font-semibold text-[var(--foreground)]"
  ),
  settingRow: cn(
    "flex items-center justify-between",
    "py-[var(--token-space-md)]",
    "border-b border-[var(--border)] last:border-b-0"
  ),
  settingInfo: "flex items-center gap-[var(--token-space-md)] flex-1",
  settingDescription: "text-[var(--muted-foreground)] text-sm",
  priorityBadge: cn(
    "py-[var(--token-space-xs)] px-[var(--token-space-sm)]",
    "rounded-[var(--token-radius-sm)]",
    "text-xs font-semibold font-mono"
  ),
  priorityUrgent: "bg-[rgba(255,59,48,0.1)] text-[var(--error)]",
  priorityHigh: "bg-[rgba(255,149,0,0.1)] text-[var(--warning)]",
  priorityNormal: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  toggleSwitch: "relative inline-block w-11 h-[var(--token-space-3xl)]",
  toggleInput: "opacity-0 w-0 h-0",
  slider: cn(
    "absolute cursor-pointer inset-0",
    "bg-[var(--border)] rounded-[var(--token-space-3xl)]",
    "transition-[var(--token-transition-fast)]",
    "before:absolute before:content-[''] before:h-[18px] before:w-[18px]",
    "before:left-[3px] before:bottom-[3px]",
    "before:bg-white before:rounded-full",
    "before:shadow-[var(--token-shadow-sm)]",
    "before:transition-[var(--token-transition-fast)]",
    "peer-checked:bg-[var(--primary)]",
    "peer-checked:before:translate-x-5"
  ),
  quietHoursSettings: cn(
    "bg-[var(--card)] rounded-[var(--token-radius-md)]",
    "p-[var(--token-space-lg)] mt-[var(--token-space-md)]"
  ),
  timeInputs: cn(
    "flex flex-col gap-[var(--token-space-lg)] mb-[var(--token-space-md)]",
    "sm:flex-row"
  ),
  timeInputGroup: "flex flex-col gap-[var(--token-space-sm)] flex-1",
  timeLabel: "text-sm font-medium text-[var(--foreground)]",
  timeInput: cn(
    "p-[var(--token-space-md)]",
    "border border-[var(--border)] rounded-[var(--token-radius-md)]",
    "bg-[var(--background)] text-[var(--foreground)] text-sm"
  ),
  quietHoursNote: "m-0 text-xs text-[var(--muted-foreground)] italic",
  testButton: cn(
    "bg-[var(--muted)] text-[var(--foreground)]",
    "border border-[var(--border)] rounded-[var(--token-radius-md)]",
    "py-[var(--token-space-md)] px-[var(--token-space-lg)]",
    "text-sm font-medium cursor-pointer w-full",
    "transition-all duration-[var(--token-transition-fast)]",
    "hover:bg-[var(--border)] hover:-translate-y-px",
    "disabled:cursor-not-allowed disabled:transform-none"
  ),
  testButtonSending: "bg-[var(--warning)] text-white",
  testButtonSent: "bg-[var(--success)] text-white",
  testButtonError: "bg-[var(--error)] text-white",
};

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

  const getStatusStyle = () => {
    switch (status.color) {
      case 'success': return styles.statusSuccess;
      case 'error': return styles.statusError;
      default: return styles.statusWarning;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Bell className={styles.titleIcon} />
          <h3 className={styles.titleText}>Push Notifications</h3>
        </div>
        <div className={cn(styles.permissionStatus, getStatusStyle())}>
          <StatusIcon size={16} style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span>{status.text}</span>
        </div>
      </div>

      {permission === 'default' && (
        <div className={styles.permissionRequest}>
          <div className={styles.requestContent}>
            <Smartphone className={styles.requestIcon} />
            <div className={styles.requestText}>
              <h4 className={styles.requestTitle}>Enable Push Notifications</h4>
              <p className={styles.requestDescription}>Get instant alerts for urgent announcements, even when the app is in the background.</p>
            </div>
          </div>
          <button
            className={styles.permissionButton}
            onClick={requestPermission}
            disabled={isLoading}
          >
            {isLoading ? 'Requesting...' : 'Enable Notifications'}
          </button>
        </div>
      )}

      {permission === 'denied' && (
        <div className={styles.permissionBlocked}>
          <Shield className={styles.blockedIcon} />
          <div>
            <h4 className={styles.blockedTitle}>Notifications Blocked</h4>
            <p className={styles.blockedDescription}>To enable notifications, click the lock icon in your browser's address bar and allow notifications for this site.</p>
          </div>
        </div>
      )}

      {permission === 'granted' && (
        <div className={styles.settingsContent}>
          {/* Priority Settings */}
          <div className={styles.settingsSection}>
            <h4 className={styles.sectionTitle}>Notification Types</h4>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={cn(styles.priorityBadge, styles.priorityUrgent)}>URGENT</span>
                <span className={styles.settingDescription}>Critical show updates (always notify)</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.urgentEnabled}
                  onChange={(e) => updatePreference('urgentEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={cn(styles.priorityBadge, styles.priorityHigh)}>HIGH</span>
                <span className={styles.settingDescription}>Important announcements</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.highEnabled}
                  onChange={(e) => updatePreference('highEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <span className={cn(styles.priorityBadge, styles.priorityNormal)}>NORMAL</span>
                <span className={styles.settingDescription}>General show information</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.normalEnabled}
                  onChange={(e) => updatePreference('normalEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>

          {/* Sound & Vibration */}
          <div className={styles.settingsSection}>
            <h4 className={styles.sectionTitle}>Notification Behavior</h4>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                {preferences.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />}
                <span>Sound</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.soundEnabled}
                  onChange={(e) => updatePreference('soundEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <Smartphone size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                <span>Vibration</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.vibrationEnabled}
                  onChange={(e) => updatePreference('vibrationEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className={styles.settingsSection}>
            <h4 className={styles.sectionTitle}>Quiet Hours</h4>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <Clock size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                <span>Do not disturb</span>
              </div>
              <label className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  className={cn(styles.toggleInput, "peer")}
                  checked={preferences.quietHoursEnabled}
                  onChange={(e) => updatePreference('quietHoursEnabled', e.target.checked)}
                />
                <span className={styles.slider}></span>
              </label>
            </div>

            {preferences.quietHoursEnabled && (
              <div className={styles.quietHoursSettings}>
                <div className={styles.timeInputs}>
                  <div className={styles.timeInputGroup}>
                    <label className={styles.timeLabel}>From:</label>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={preferences.quietStartTime}
                      onChange={(e) => updatePreference('quietStartTime', e.target.value)}
                    />
                  </div>
                  <div className={styles.timeInputGroup}>
                    <label className={styles.timeLabel}>To:</label>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={preferences.quietEndTime}
                      onChange={(e) => updatePreference('quietEndTime', e.target.value)}
                    />
                  </div>
                </div>
                <p className={styles.quietHoursNote}>
                  Urgent notifications will still be shown during quiet hours
                </p>
              </div>
            )}
          </div>

          {/* Test Notification */}
          <div className={styles.settingsSection}>
            <h4 className={styles.sectionTitle}>Test Notifications</h4>
            <button
              className={cn(
                styles.testButton,
                testStatus === 'sending' && styles.testButtonSending,
                testStatus === 'sent' && styles.testButtonSent,
                testStatus === 'error' && styles.testButtonError
              )}
              onClick={sendTestNotification}
              disabled={testStatus === 'sending'}
            >
              {testStatus === 'sending' && 'Sending...'}
              {testStatus === 'sent' && 'Test Sent!'}
              {testStatus === 'error' && 'Failed'}
              {testStatus === 'idle' && 'Send Test Notification'}
            </button>

            {/* Test Push Notification Button */}
            {currentLicenseKey && (
              <button
                className={cn(
                  styles.testButton,
                  testStatus === 'sending' && styles.testButtonSending,
                  testStatus === 'sent' && styles.testButtonSent,
                  testStatus === 'error' && styles.testButtonError,
                  "mt-[var(--token-space-md)]"
                )}
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
              >
                {testStatus === 'sending' && 'Sending Push...'}
                {testStatus === 'sent' && 'Push Sent!'}
                {testStatus === 'error' && 'Push Failed'}
                {testStatus === 'idle' && 'Test Push Notification'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};