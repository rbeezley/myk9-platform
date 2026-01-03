/**
 * PushNotificationSettings Component
 *
 * Displays browser compatibility warnings, permission status, and subscription state
 * for push notifications.
 *
 * Extracted from NotificationSettings.tsx
 */

import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

/**
 * Browser compatibility information
 */
export interface BrowserCompatibility {
  supported: boolean;
  reason?: string;
}

/**
 * Props for PushNotificationSettings component
 */
export interface PushNotificationSettingsProps {
  /** Whether notifications are enabled in settings */
  isEnabled: boolean;
  /** Current notification permission state */
  permissionState: NotificationPermission;
  /** Whether user is subscribed to push notifications */
  isPushSubscribed: boolean;
  /** Browser compatibility information */
  browserCompatibility: BrowserCompatibility;
}

/**
 * PushNotificationSettings Component
 *
 * Shows status indicators and warnings for push notifications based on:
 * - Browser compatibility
 * - Permission state (granted, denied, default)
 * - Subscription status
 *
 * **Features:**
 * - Browser compatibility warning (if unsupported)
 * - Permission denied warning with instructions
 * - Active/ready indicator when subscribed
 * - Only shown when notifications are enabled
 *
 * **Use Cases:**
 * - Inform users about notification permission issues
 * - Guide users to fix browser settings
 * - Show confirmation when successfully subscribed
 *
 * @example
 * ```tsx
 * <PushNotificationSettings
 *   isEnabled={settings.enableNotifications}
 *   permissionState="granted"
 *   isPushSubscribed={true}
 *   browserCompatibility={{ supported: true }}
 * />
 * ```
 */
export function PushNotificationSettings({
  isEnabled,
  permissionState,
  isPushSubscribed,
  browserCompatibility
}: PushNotificationSettingsProps): React.ReactElement | null {
  // Only show when notifications are enabled
  if (!isEnabled) {
    return null;
  }

  return (
    <div style={{ padding: '0 20px 16px 20px' }}>
      {/* Browser not supported warning */}
      {!browserCompatibility.supported && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'start',
          marginBottom: '12px'
        }}>
          <AlertCircle size={18} style={{ marginTop: '2px', color: 'var(--token-warning)' }} />
          <div>
            <div style={{ color: 'var(--token-warning)', fontWeight: 600, fontSize: '14px' }}>
              Browser Not Supported
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              {browserCompatibility.reason || 'Push notifications are not supported in this browser.'}
            </div>
          </div>
        </div>
      )}

      {/* Permission denied warning */}
      {permissionState === 'denied' && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'start'
        }}>
          <AlertCircle size={18} style={{ marginTop: '2px', color: 'var(--token-error)' }} />
          <div>
            <div style={{ color: 'var(--token-error)', fontWeight: 600, fontSize: '14px' }}>
              Notifications Blocked
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Please enable notifications in your browser settings to receive alerts.
            </div>
          </div>
        </div>
      )}

      {/* Active and subscribed indicator */}
      {permissionState === 'granted' && isPushSubscribed && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <CheckCircle size={18} style={{ color: 'var(--token-success)' }} />
          <div style={{ color: 'var(--token-success)', fontWeight: 600, fontSize: '14px' }}>
            Active & Ready
          </div>
        </div>
      )}
    </div>
  );
}
