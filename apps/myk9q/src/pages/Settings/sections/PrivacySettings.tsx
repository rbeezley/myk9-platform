import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsToggle } from '../components/SettingsToggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { Activity } from 'lucide-react';

export const PrivacySettings: React.FC = () => {
    const { settings, updateSettings } = useSettingsStore();

    return (
        <SettingsSection title="Privacy">
            <SettingsRow
                icon={<Activity size={20} />}
                label="Performance Analytics"
                description="Share anonymous usage data to help us improve"
                action={
                    <SettingsToggle
                        checked={settings.enablePerformanceMonitoring}
                        onChange={(checked) => updateSettings({ enablePerformanceMonitoring: checked })}
                    />
                }
            />
        </SettingsSection>
    );
};
