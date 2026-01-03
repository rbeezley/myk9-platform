import React, { useState } from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsToggle } from '../components/SettingsToggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { Bell, Mic, AlertCircle, CheckCircle, Send, Info, Volume2 } from 'lucide-react';
import type { BrowserCompatibility } from '../components/PushNotificationSettings';
import { useAuth } from '@/contexts/AuthContext';
import voiceAnnouncementService from '@/services/voiceAnnouncementService';
import { notificationSoundService } from '@/services/notificationSoundService';

// Get user-friendly label for permission state
function getPermissionLabel(state: NotificationPermission): { label: string; color: string } {
    switch (state) {
        case 'granted':
            return { label: 'Allowed', color: 'var(--token-success, #10b981)' };
        case 'denied':
            return { label: 'Blocked', color: 'var(--token-error, #ef4444)' };
        default:
            return { label: 'Not Asked', color: 'var(--token-warning, #f59e0b)' };
    }
}

interface NotificationSettingsProps {
    isPushSubscribed: boolean;
    isSubscribing: boolean;
    permissionState: NotificationPermission;
    onPushToggle: (enabled: boolean) => void;
    browserCompatibility: BrowserCompatibility | null;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({
    isPushSubscribed,
    isSubscribing,
    permissionState,
    onPushToggle,
    browserCompatibility: _browserCompatibility
}) => {
    const { settings, updateSettings } = useSettingsStore();
    const { showContext } = useAuth();
    const [testSent, setTestSent] = useState(false);

    /**
     * Send a test notification
     * In production: Uses service worker's SIMULATE_PUSH handler
     * In development: Falls back to direct Notification API (SW is disabled in dev)
     */
    const handleTestNotification = async () => {
        try {
            // Check if service worker is available (it's disabled in dev mode)
            const hasServiceWorker = 'serviceWorker' in navigator && navigator.serviceWorker.controller;

            if (hasServiceWorker) {
                // Production path: Use service worker
                const registration = await navigator.serviceWorker.ready;

                if (registration.active) {
                    const message = {
                        type: 'SIMULATE_PUSH',
                        data: {
                            id: `test-${Date.now()}`,  // Unique ID for each test notification
                            title: 'Test Notification',
                            content: 'This is a test notification to check styling on your device.',
                            showName: showContext?.showName || 'myK9Q',
                            priority: 'urgent',  // Use urgent for test to trigger heads-up display
                            licenseKey: showContext?.licenseKey || 'test'
                        }
                    };
                    registration.active.postMessage(message);
                }
            } else {
                // Development fallback: Use Notification API directly
                const showName = showContext?.showName || 'myK9Q';
                new Notification(`${showName}: Test Notification`, {
                    body: 'This is a test notification to check styling on your device.',
                    icon: '/myK9Q-teal-192.png',
                    badge: '/notification-badge.png',
                    tag: `test-${Date.now()}`,
                });
            }

            // Play notification sound
            notificationSoundService.testSound('urgent');

            // Also trigger voice announcement if enabled
            if (settings.voiceNotifications) {
                const showName = showContext?.showName || 'myK9Q';
                voiceAnnouncementService.testVoice(
                    `${showName}: This is a test notification to check voice announcements on your device.`
                );
            }

            setTestSent(true);
            // Reset after 3 seconds
            setTimeout(() => setTestSent(false), 3000);
        } catch (error) {
            console.error('[NotificationSettings] Failed to send test notification:', error);
        }
    };

    return (
        <SettingsSection title="Notifications">
            {/* Master Toggle */}
            <SettingsRow
                icon={<Bell size={20} />}
                label="Enable Notifications"
                description="Get alerts when your dog is up next"
                action={
                    <SettingsToggle
                        checked={settings.enableNotifications}
                        onChange={onPushToggle}
                        disabled={isSubscribing}
                    />
                }
            />

            {/* Browser Permission Status - always visible for troubleshooting */}
            <SettingsRow
                icon={<Info size={20} />}
                label="Browser Permission"
                description="Your browser's notification setting"
                action={
                    <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: getPermissionLabel(permissionState).color
                    }}>
                        {getPermissionLabel(permissionState).label}
                    </span>
                }
            />

            {/* Warnings / Status */}
            {settings.enableNotifications && (
                <div style={{ padding: '0 20px 16px 20px' }}>
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
                                <div style={{ color: 'var(--token-error)', fontWeight: 600, fontSize: '14px' }}>Notifications Blocked</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                                    Please enable notifications in your browser settings to receive alerts.
                                </div>
                            </div>
                        </div>
                    )}

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
            )}

            {/* Sub-settings */}
            {settings.enableNotifications && (
                <>
                    <SettingsRow
                        label="Notify when my dog is..."
                        description="Set your lead time preference"
                        action={
                            <select
                                value={settings.notifyYourTurnLeadDogs}
                                onChange={(e) => updateSettings({ notifyYourTurnLeadDogs: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5 })}
                                className="settings-select"
                                style={{
                                    backgroundColor: 'var(--input-bg)',
                                    border: '1px solid var(--input-border)',
                                    color: 'var(--input-text)',
                                    padding: '6px 12px',
                                    borderRadius: '8px'
                                }}
                            >
                                <option value="1">Next in ring</option>
                                <option value="2">2nd in line</option>
                                <option value="3">3rd in line</option>
                                <option value="4">4th in line</option>
                                <option value="5">5th in line</option>
                            </select>
                        }
                    />

                    <SettingsRow
                        icon={<Mic size={20} />}
                        label="Voice Announcements"
                        description="Speak notifications aloud"
                        action={
                            <SettingsToggle
                                checked={settings.voiceNotifications}
                                onChange={(checked) => updateSettings({ voiceNotifications: checked })}
                            />
                        }
                    />

                    {/* Sound Preview */}
                    <SettingsRow
                        icon={<Volume2 size={20} />}
                        label="Preview Alert Sounds"
                        description="Tap to hear notification chimes"
                        action={
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => notificationSoundService.testSound('normal')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--input-border)',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Normal
                                </button>
                                <button
                                    onClick={() => notificationSoundService.testSound('urgent')}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--token-error)',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: 'var(--token-error)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Urgent
                                </button>
                            </div>
                        }
                    />

                    {/* Test Notification - at bottom for visibility */}
                    {permissionState === 'granted' && (
                        <SettingsRow
                            icon={<Send size={20} />}
                            label={testSent ? 'Test Notification Sent!' : 'Test Notification'}
                            description="Tap to send a sample notification"
                            onClick={testSent ? undefined : handleTestNotification}
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
};
