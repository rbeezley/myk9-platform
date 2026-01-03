import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SettingsToggle } from '../components/SettingsToggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { Mic } from 'lucide-react';

export const ScoringSettings: React.FC = () => {
    const { settings, updateSettings } = useSettingsStore();

    return (
        <SettingsSection title="Scoring">
            <SettingsRow
                icon={<Mic size={20} />}
                label="Voice Announcements"
                description="Announce 30-second warning aloud"
                action={
                    <SettingsToggle
                        checked={settings.voiceAnnouncements}
                        onChange={(checked) => updateSettings({ voiceAnnouncements: checked })}
                    />
                }
            />
        </SettingsSection>
    );
};
