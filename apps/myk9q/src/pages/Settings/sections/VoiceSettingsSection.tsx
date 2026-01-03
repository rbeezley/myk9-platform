/**
 * VoiceSettingsSection Component
 *
 * Shared voice configuration for all voice announcements.
 * Settings here apply to both notification voice and scoring/timer voice.
 * The toggles to enable voice are in the respective sections (Notifications, Scoring).
 */

import React, { useState, useEffect } from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useSettingsStore } from '@/stores/settingsStore';
import { Volume2, MessageSquare } from 'lucide-react';
import voiceAnnouncementService from '@/services/voiceAnnouncementService';

export function VoiceSettingsSection(): React.ReactElement {
    const { settings, updateSettings } = useSettingsStore();
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isTesting, setIsTesting] = useState(false);

    // Load available voices
    useEffect(() => {
        const loadVoices = () => {
            const availableVoices = window.speechSynthesis?.getVoices() || [];
            // Filter to English voices for clarity
            const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
            setVoices(englishVoices);
        };

        // Load voices (some browsers require this event)
        loadVoices();
        if (window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }

        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = null;
            }
        };
    }, []);

    // Test voice with sample announcement
    const handleTestVoice = () => {
        setIsTesting(true);
        voiceAnnouncementService.testVoice('This is a test of your selected voice.');
        // Reset after speech completes (estimate ~3 seconds)
        setTimeout(() => setIsTesting(false), 3000);
    };

    return (
        <SettingsSection title="Voice Settings">
            <SettingsRow
                icon={<MessageSquare size={20} />}
                label="Voice"
                description={voices.length > 0 ? 'Choose speaker' : 'Loading voices...'}
                action={
                    <select
                        value={settings.voiceName}
                        onChange={(e) => updateSettings({ voiceName: e.target.value })}
                        className="settings-select"
                        disabled={voices.length === 0}
                        style={{
                            backgroundColor: 'var(--input-bg)',
                            border: '1px solid var(--input-border)',
                            color: 'var(--input-text)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            minWidth: '180px'
                        }}
                    >
                        <option value="">Default</option>
                        {voices.map((voice) => (
                            <option key={voice.name} value={voice.name}>
                                {voice.name}
                            </option>
                        ))}
                    </select>
                }
            />

            <SettingsRow
                label={`Speed: ${settings.voiceRate.toFixed(1)}x`}
                description="Speaking rate"
                action={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>0.5x</span>
                        <input
                            type="range"
                            min="0.5"
                            max="2.0"
                            step="0.1"
                            value={settings.voiceRate}
                            onChange={(e) => updateSettings({ voiceRate: parseFloat(e.target.value) })}
                            style={{ width: '100px', accentColor: 'var(--accent-primary)' }}
                        />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>2x</span>
                    </div>
                }
            />

            <SettingsRow
                icon={<Volume2 size={20} />}
                label={isTesting ? 'Speaking...' : 'Test Voice'}
                description="Tap to hear a sample"
                onClick={!isTesting ? handleTestVoice : undefined}
            />
        </SettingsSection>
    );
}
