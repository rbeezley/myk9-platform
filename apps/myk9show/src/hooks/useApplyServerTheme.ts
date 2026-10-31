import { useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/settingsStore';
import type { ThemePreferences } from '@/types/user-preferences';

/** Applies theme fields a newer server value (another device) put in place of this device's. */
export function useApplyServerTheme() {
  const { setThemeMode } = useTheme();
  const updateSettings = useSettingsStore(s => s.updateSettings);
  return useCallback(
    (adopted: Partial<ThemePreferences>) => {
      if (adopted.mode) {
        setThemeMode(adopted.mode);
        updateSettings({ theme: adopted.mode === 'system' ? 'auto' : adopted.mode });
      }
      if (adopted.colorScheme) updateSettings({ accentColor: adopted.colorScheme });
    },
    [setThemeMode, updateSettings]
  );
}
