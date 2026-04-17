/**
 * Settings Store
 *
 * Manages user preferences and app settings.
 * Persists to localStorage.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { importSettingsWithMigration } from '@/utils/settingsMigration';
import { ACCENT_V1_TO_V2 } from '@/utils/accentMigrationMap';
import { logger } from '@/utils/logger';

export const SETTINGS_VERSION = '1.0.0';

export interface AppSettings {
  // Display
  theme: 'light' | 'dark' | 'auto';
  accentColor: 'clay' | 'grove' | 'dusk' | 'heather';

  // Performance
  enableAnimations: boolean | null; // null = auto-detect
  enableBlur: boolean | null; // null = auto-detect
  enableShadows: boolean | null; // null = auto-detect

  // Mobile
  pullToRefresh: boolean;
  hapticFeedback: boolean;

  // Notifications
  enableNotifications: boolean;
  showBadges: boolean;
  notifyYourTurnLeadDogs: 1 | 2 | 3 | 4 | 5; // How many dogs ahead to notify

  // Privacy & Security
  autoLogout: 480; // minutes, fixed at 8 hours

  // Developer Tools
  developerMode: boolean;
  consoleLogging: 'none' | 'errors' | 'all';
  enableBetaFeatures: boolean;
  enablePerformanceMonitoring: boolean; // Track metrics to database
}

interface SettingsState {
  settings: AppSettings;

  // Actions
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  resetSection: (section: keyof typeof defaultSettings) => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
}

const defaultSettings: AppSettings = {
  // Display
  theme: 'auto',
  accentColor: 'clay',

  // Performance
  enableAnimations: null,
  enableBlur: null,
  enableShadows: null,

  // Mobile
  pullToRefresh: false, // Disabled due to interference with scrolling
  hapticFeedback: true,

  // Notifications
  enableNotifications: false, // Default: disabled (users must explicitly opt-in)
  showBadges: true,
  notifyYourTurnLeadDogs: 3, // Default: notify when 3 dogs ahead

  // Privacy & Security
  autoLogout: 480, // Default: 8 hours (typical trial length)

  // Developer Tools
  developerMode: false,
  consoleLogging: 'errors',
  enableBetaFeatures: false,
  enablePerformanceMonitoring: true, // Auto-enabled to help improve the app
};

export const useSettingsStore = create<SettingsState>()(
  devtools(
    persist(
      (set, get) => ({
        settings: defaultSettings,

        updateSettings: updates => {
          set(state => ({
            settings: {
              ...state.settings,
              ...updates,
            },
          }));

          // Apply theme immediately
          if (updates.theme) {
            applyTheme(updates.theme);
          }

          // Apply accent color immediately
          if (updates.accentColor) {
            applyAccentColor(updates.accentColor);
          }
        },

        resetSettings: () => {
          set({ settings: defaultSettings });
          applyTheme('auto');
          applyAccentColor('clay');
        },

        resetSection: _section => {
          // This would reset specific sections - implement as needed
        },

        exportSettings: () => {
          const exportData = {
            version: SETTINGS_VERSION,
            exportedAt: new Date().toISOString(),
            settings: get().settings,
          };
          return JSON.stringify(exportData, null, 2);
        },

        importSettings: json => {
          try {
            const imported = JSON.parse(json);

            // Use migration system to handle version differences
            const result = importSettingsWithMigration(imported, defaultSettings);

            if (!result.success) {
              logger.error('Failed to import settings');
              return false;
            }

            // Apply imported settings
            set({ settings: result.settings });

            // Apply settings immediately
            const newSettings = get().settings;
            applyTheme(newSettings.theme);
            applyAccentColor(newSettings.accentColor || 'clay');

            return true;
          } catch (error) {
            logger.error('Failed to import settings:', String(error));
            return false;
          }
        },
      }),
      {
        name: 'myK9Q_settings',
        onRehydrateStorage: () => state => {
          // Called after settings are loaded from localStorage
          if (state) {
            const raw = state.settings.accentColor as string;
            if (ACCENT_V1_TO_V2[raw]) {
              state.settings.accentColor = ACCENT_V1_TO_V2[raw];
            }
            applyAccentColor(state.settings.accentColor || 'clay');
            applyTheme(state.settings.theme || 'auto');
          }
        },
      }
    ),
    { name: 'SettingsStore', enabled: import.meta.env.DEV }
  )
);

/**
 * Apply theme to document
 * Applies both theme-light/theme-dark classes AND Tailwind's .dark class
 */
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;

  if (theme === 'auto') {
    // Detect system preference and apply appropriate class
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.remove('theme-light', 'theme-dark', 'dark');
    root.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
    if (prefersDark) root.classList.add('dark'); // Tailwind dark mode
  } else {
    root.classList.remove('theme-light', 'theme-dark', 'dark');
    root.classList.add(`theme-${theme}`);
    if (theme === 'dark') root.classList.add('dark'); // Tailwind dark mode
  }
}

/**
 * Listen for system theme changes and update when in 'auto' mode
 */
let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

function setupSystemThemeListener() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // Remove existing listener if any
  if (systemThemeListener) {
    mediaQuery.removeEventListener('change', systemThemeListener);
  }

  // Create new listener
  systemThemeListener = (e: MediaQueryListEvent) => {
    const { settings } = useSettingsStore.getState();
    if (settings.theme === 'auto') {
      const root = document.documentElement;
      root.classList.remove('theme-light', 'theme-dark', 'dark');
      root.classList.add(e.matches ? 'theme-dark' : 'theme-light');
      if (e.matches) root.classList.add('dark'); // Tailwind dark mode
    }
  };

  // Add listener
  mediaQuery.addEventListener('change', systemThemeListener);
}

/**
 * Apply accent color to document and update meta theme-color
 */
function applyAccentColor(color: 'clay' | 'grove' | 'dusk' | 'heather') {
  const root = document.documentElement;
  if (root.getAttribute('data-accent') !== color) {
    root.setAttribute('data-accent', color);
  }

  const accentColors: Record<string, string> = {
    clay: '#c96442',
    grove: '#2f8a7f',
    dusk: '#3d6d8c',
    heather: '#7b5aa6',
  };
  const themeColor = accentColors[color] || '#c96442';
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', themeColor);
}

/**
 * Initialize settings on app load
 * NOTE: Theme and theme color are initialized by blocking script in index.html
 */
export function initializeSettings() {
  const { settings } = useSettingsStore.getState();
  // Theme already applied by blocking script in index.html
  applyAccentColor(settings.accentColor || 'clay');
  // Listen for system theme changes (for 'auto' mode)
  setupSystemThemeListener();
}
