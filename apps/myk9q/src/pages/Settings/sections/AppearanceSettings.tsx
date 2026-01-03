import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useSettingsStore } from '@/stores/settingsStore';
import { Moon, Sun } from 'lucide-react';

export const AppearanceSettings: React.FC = () => {
    const { settings, updateSettings } = useSettingsStore();

    const accentColors = [
        { id: 'green', color: '#10b981', label: 'Emerald' },
        { id: 'blue', color: '#3b82f6', label: 'Ocean' },
        { id: 'orange', color: '#f97316', label: 'Sunset' },
        { id: 'purple', color: '#8b5cf6', label: 'Royal' },
    ] as const;

    return (
        <SettingsSection title="Appearance">
            {/* Theme Toggle */}
            <SettingsRow
                icon={settings.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                label="Theme"
                description={`Currently: ${settings.theme === 'auto' ? 'System Default' : settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}`}
                action={
                    <select
                        value={settings.theme}
                        onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
                        className="settings-select"
                        style={{
                            backgroundColor: 'var(--input-bg)',
                            border: '1px solid var(--input-border)',
                            color: 'var(--input-text)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            outline: 'none'
                        }}
                    >
                        <option value="auto">Auto</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                }
            />

            {/* Accent Color Picker */}
            <SettingsRow
                icon={<div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-primary)' }} />}
                label="Accent Color"
                description="Choose your primary brand color"
                action={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {accentColors.map((accent) => (
                            <button
                                key={accent.id}
                                onClick={() => updateSettings({ accentColor: accent.id })}
                                title={accent.label}
                                style={{
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: accent.color,
                                    border: settings.accentColor === accent.id ? '2px solid white' : '2px solid transparent',
                                    boxShadow: settings.accentColor === accent.id ? `0 0 0 2px ${accent.color}` : 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            />
                        ))}
                    </div>
                }
            />
        </SettingsSection>
    );
};
