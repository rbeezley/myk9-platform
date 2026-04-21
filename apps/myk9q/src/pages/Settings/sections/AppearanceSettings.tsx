import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useSettingsStore } from '@/stores/settingsStore';
import { Moon, Sun, Sunrise } from 'lucide-react';

const ACCENT_OPTIONS = [
  { id: 'teal', color: '#14b8a6', label: 'Teal' },
  { id: 'terracotta', color: '#c96442', label: 'Terracotta' },
  { id: 'blue', color: '#3b82f6', label: 'Ocean' },
  { id: 'purple', color: '#8b5cf6', label: 'Royal' },
] as const;

type AccentOption = (typeof ACCENT_OPTIONS)[number]['id'];

// prefers-contrast: more hint (spec §6.1 "Optional auto-detection").
// Reads once on mount and on the MQ's change event. Never forces — only hints.
function usePrefersHighContrast(): boolean {
  const [prefers, setPrefers] = React.useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-contrast: more)').matches;
  });
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-contrast: more)');
    const listener = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return prefers;
}

export const AppearanceSettings: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const prefersHighContrast = usePrefersHighContrast();

  // Legacy persisted values ('green', 'orange') render as teal/terracotta
  // respectively — map to the canonical option for the picker's selection
  // ring so the UI reflects what the user actually sees on screen.
  const selectedAccent: AccentOption =
    settings.accentColor === 'green'
      ? 'teal'
      : settings.accentColor === 'orange'
        ? 'terracotta'
        : (settings.accentColor as AccentOption);

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        icon={settings.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
        label="Theme"
        description={`Currently: ${
          settings.theme === 'auto'
            ? 'System Default'
            : settings.theme === 'dark'
              ? 'Dark Mode'
              : 'Light Mode'
        }`}
        action={
          <select
            value={settings.theme}
            onChange={e => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
            className="settings-select"
            style={{
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              color: 'var(--input-text)',
              padding: '6px 12px',
              borderRadius: '8px',
              outline: 'none',
            }}
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        }
      />

      <SettingsRow
        icon={
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--accent-primary)',
            }}
          />
        }
        label="Accent Color"
        description="Choose your primary brand color"
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            {ACCENT_OPTIONS.map(accent => (
              <button
                key={accent.id}
                type="button"
                onClick={() => updateSettings({ accentColor: accent.id })}
                title={accent.label}
                aria-label={`Set accent color to ${accent.label}`}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: accent.color,
                  border:
                    selectedAccent === accent.id ? '2px solid white' : '2px solid transparent',
                  boxShadow: selectedAccent === accent.id ? `0 0 0 2px ${accent.color}` : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        }
      />

      <SettingsRow
        icon={<Sunrise size={20} />}
        label="Display Mode"
        description="Outdoor mode boosts contrast for direct sunlight readability"
        action={
          <select
            value={settings.displayMode}
            onChange={e => updateSettings({ displayMode: e.target.value as 'default' | 'outdoor' })}
            className="settings-select"
            aria-label="Display Mode"
            style={{
              backgroundColor: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              color: 'var(--input-text)',
              padding: '6px 12px',
              borderRadius: '8px',
              outline: 'none',
            }}
          >
            <option value="default">Default</option>
            <option value="outdoor">Outdoor</option>
          </select>
        }
      />

      {prefersHighContrast && settings.displayMode !== 'outdoor' && (
        <div
          role="status"
          aria-live="polite"
          className="appearance-contrast-hint"
          style={{
            padding: '8px 12px',
            margin: '4px 0 0',
            fontSize: '13px',
            color: 'var(--muted-foreground)',
            borderLeft: '2px solid var(--primary)',
            background: 'var(--background-subtle, transparent)',
          }}
        >
          Your device prefers high contrast — consider Outdoor mode.
        </div>
      )}
    </SettingsSection>
  );
};
