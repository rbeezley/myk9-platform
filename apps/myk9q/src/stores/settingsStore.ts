/**
 * Settings Store
 *
 * Manages user preferences and app settings.
 * Persists to localStorage.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { importSettingsWithMigration } from '@/utils/settingsMigration';
import { logger } from '@/utils/logger';

export const SETTINGS_VERSION = '1.0.0';

export interface AppSettings {
  // Display
  theme: 'light' | 'dark' | 'auto';
  // Includes legacy values ('green', 'orange') for persisted-state
  // tolerance. The accent migration shim rewrites them to canonical
  // 'teal'/'terracotta' on first app load; new writes from the UI use
  // canonical values only.
  accentColor: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange';
  // Display mode: 'outdoor' toggles the high-contrast outdoor stylesheet.
  displayMode: 'default' | 'outdoor';

  // Performance
  enableAnimations: boolean | null; // null = auto-detect
  enableBlur: boolean | null; // null = auto-detect
  enableShadows: boolean | null; // null = auto-detect

  // Mobile
  pullToRefresh: boolean;
  hapticFeedback: boolean;

  // Notifications
  enableNotifications: boolean;
  voiceNotifications: boolean; // Speak push notifications aloud (everyone can see this)
  showBadges: boolean;
  notifyYourTurnLeadDogs: 1 | 2 | 3 | 4 | 5; // How many dogs ahead to notify

  // Scoring (judges/stewards/admins only)
  voiceAnnouncements: boolean; // Speak 30-second warning aloud (scoring section)

  // Voice configuration (shared by notifications and scoring)
  voiceName: string; // Voice name to use (empty = browser default)
  voiceRate: number; // 0.5 to 2.0 (speed)

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
  accentColor: 'teal',
  displayMode: 'default',

  // Performance
  enableAnimations: null,
  enableBlur: null,
  enableShadows: null,

  // Mobile
  pullToRefresh: false, // Disabled due to interference with scrolling
  hapticFeedback: true,

  // Notifications
  enableNotifications: false, // Default: disabled (users must explicitly opt-in)
  voiceNotifications: true, // Default: enabled (helps users who miss visual notifications)
  showBadges: true,
  notifyYourTurnLeadDogs: 3, // Default: notify when 3 dogs ahead

  // Scoring
  voiceAnnouncements: false,

  // Voice configuration
  voiceName: '', // Empty = browser default
  voiceRate: 1.0,

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

          // Apply display mode immediately
          if (updates.displayMode !== undefined) {
            applyDisplayMode(updates.displayMode);
          }
        },

        resetSettings: () => {
          set({ settings: defaultSettings });
          applyTheme('auto');
          applyAccentColor('teal');
          applyDisplayMode('default');
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
            applyAccentColor(newSettings.accentColor || 'teal');
            applyDisplayMode(newSettings.displayMode || 'default');

            return true;
          } catch (error) {
            logger.error('Failed to import settings:', error);
            return false;
          }
        },
      }),
      {
        name: 'myK9Q_settings',
      }
    ),
    { name: 'SettingsStore', enabled: import.meta.env.DEV }
  )
);

/**
 * Apply theme to document
 */
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;

  if (theme === 'auto') {
    // Detect system preference and apply appropriate class
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
  } else {
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);
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
      root.classList.remove('theme-light', 'theme-dark');
      root.classList.add(e.matches ? 'theme-dark' : 'theme-light');
    }
  };

  // Add listener
  mediaQuery.addEventListener('change', systemThemeListener);
}

/**
 * Apply accent color to document and update meta theme-color
 */
function applyAccentColor(color: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange') {
  const root = document.documentElement;
  root.classList.remove(
    'accent-green',
    'accent-blue',
    'accent-orange',
    'accent-purple',
    'accent-teal',
    'accent-terracotta'
  );
  root.classList.add(`accent-${color}`);

  // Meta theme-color values. Legacy values (green/orange) render the
  // v2 hex so the browser chrome matches the deprecation-aliased CSS.
  const accentColors: Record<string, string> = {
    teal: '#14b8a6',
    terracotta: '#c96442',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    green: '#14b8a6',
    orange: '#c96442',
  };
  const themeColor = accentColors[color] || '#14b8a6';
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', themeColor);
  });
}

/**
 * Apply display mode (default or outdoor) to document
 */
function applyDisplayMode(mode: 'default' | 'outdoor') {
  const root = document.documentElement;
  if (mode === 'outdoor') {
    root.classList.add('mode-outdoor');
  } else {
    root.classList.remove('mode-outdoor');
  }
}

/**
 * Initialize settings on app load
 * NOTE: Theme and theme color are initialized by blocking script in index.html
 */
export function initializeSettings() {
  const { settings } = useSettingsStore.getState();
  // Theme already applied by blocking script in index.html
  applyAccentColor(settings.accentColor || 'teal');
  applyDisplayMode(settings.displayMode || 'default');
  // Listen for system theme changes (for 'auto' mode)
  setupSystemThemeListener();
}
