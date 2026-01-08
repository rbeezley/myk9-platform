import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsToggle } from '../components/SettingsToggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { Smartphone, RotateCcw, RefreshCw } from 'lucide-react';

/**
 * Test vibration when haptic feedback is enabled
 * Bypasses the setting check since we're testing the feature itself
 */
function testVibration(): void {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate([75, 100, 75]); // Double pulse to confirm it's working
        } catch {
            // Silent fail
        }
    }
}

interface GeneralSettingsProps {
    onShowOnboarding: () => void;
    onRefreshAllData: () => void;
    isRefreshing: boolean;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ onShowOnboarding, onRefreshAllData, isRefreshing }) => {
    const { settings, updateSettings } = useSettingsStore();

    return (
        <SettingsSection title="General">
            <SettingsRow
                icon={<Smartphone size={20} />}
                label="Haptic Feedback"
                description="Vibrate on touch interactions"
                action={
                    <SettingsToggle
                        checked={settings.hapticFeedback}
                        onChange={(checked) => {
                            updateSettings({ hapticFeedback: checked });
                            // Test vibration when enabling to confirm it works
                            if (checked) {
                                testVibration();
                            }
                        }}
                    />
                }
            />

            <SettingsRow
                icon={<RotateCcw size={20} />}
                label="Replay Onboarding"
                description="View the welcome tour again"
                onClick={onShowOnboarding}
            />

            <SettingsRow
                icon={<RefreshCw size={20} />}
                label={isRefreshing ? "Refreshing..." : "Refresh All Data"}
                description="Clear cache and reload fresh data from server"
                onClick={onRefreshAllData}
            />
        </SettingsSection>
    );
};
