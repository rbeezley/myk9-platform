/**
 * DeveloperToolsSection Component
 *
 * Provides developer tools and debugging controls for advanced users.
 * Simplified to essential tools only - use browser DevTools for detailed debugging.
 */

import React from 'react';
import { SettingsRow } from './SettingsRow';
import { SettingsToggle } from './SettingsToggle';
import { Terminal } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * DeveloperToolsSection Component
 *
 * Displays developer mode toggle and console logging control:
 * - Developer Mode: Enables subscription monitor for leak detection
 * - Console Logging: Verbosity level control (none/errors/all)
 *
 * Note: For performance/network debugging, use browser DevTools which
 * provides far more comprehensive analysis capabilities.
 */
export function DeveloperToolsSection(): React.ReactElement {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <>
      {/* Developer Mode Toggle */}
      <SettingsRow
        icon={<Terminal size={20} />}
        label="Developer Mode"
        description="Enable subscription monitor"
        action={
          <SettingsToggle
            checked={settings.developerMode}
            onChange={(checked) => updateSettings({ developerMode: checked })}
          />
        }
      />

      {/* Conditional Developer Tools */}
      {settings.developerMode && (
        <>
          {/* Console Logging */}
          <SettingsRow
            label="Console Logging"
            description="Verbosity level"
            action={
              <select
                value={settings.consoleLogging}
                onChange={(e) => updateSettings({ consoleLogging: e.target.value as 'none' | 'errors' | 'all' })}
                className="settings-select"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  padding: '6px 12px',
                  borderRadius: '8px'
                }}
              >
                <option value="none">None</option>
                <option value="errors">Errors</option>
                <option value="all">All</option>
              </select>
            }
          />
        </>
      )}
    </>
  );
}
