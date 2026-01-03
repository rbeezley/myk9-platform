/**
 * Settings Context
 *
 * Provides settings to all components via React Context.
 * Subscribes to settingsStore and distributes settings efficiently.
 * Prevents prop drilling and improves performance.
 */

import { createContext, useContext, ReactNode } from 'react';
import { useSettingsStore, AppSettings } from '@/stores/settingsStore';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Settings Provider Component
 * Wraps the app to provide settings to all components
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  // Subscribe to settingsStore
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const resetSettings = useSettingsStore((state) => state.resetSettings);

  const value: SettingsContextValue = {
    settings,
    updateSettings,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access settings from context
 * Use this instead of useSettingsStore in components
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }

  return context;
}

/**
 * Hook to access a specific setting
 * Optimized to only re-render when the specific setting changes
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return useSettingsStore((state) => state.settings[key]);
}

/**
 * Hook to access multiple specific settings
 * More efficient than useSettings() when you only need a few settings
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSpecificSettings<K extends keyof AppSettings>(
  ...keys: K[]
): Pick<AppSettings, K> {
  return useSettingsStore((state) => {
    const result = {} as Pick<AppSettings, K>;
    keys.forEach((key) => {
      result[key] = state.settings[key];
    });
    return result;
  });
}
