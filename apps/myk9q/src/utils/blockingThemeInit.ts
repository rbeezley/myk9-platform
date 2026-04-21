/**
 * Blocking Theme Initialization
 *
 * This script runs BEFORE React renders to prevent flash of unstyled content (FOUC).
 * It reads theme preferences from localStorage and applies them to the HTML element
 * synchronously, ensuring the correct theme is applied before the first paint.
 *
 * CRITICAL: This must be imported in index.html as a blocking script, NOT in React.
 */

import { logger } from '@/utils/logger';

interface ThemeSettings {
  theme?: 'light' | 'dark' | 'system';
  accentColor?: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange';
  displayMode?: 'default' | 'outdoor';
}

/**
 * Initialize theme before React renders
 * - Reads from localStorage synchronously
 * - Applies theme class to HTML element
 * - Prevents FOUC by running before first paint
 */
export function initializeThemeBlocking(): void {
  try {
    // Read settings from localStorage (synchronous)
    const savedSettings = localStorage.getItem('myK9Q_settings');

    if (!savedSettings) {
      // No saved settings - use defaults (light theme, teal accent, default display mode)
      applyThemeClass('light');
      applyAccentColorClass('teal');
      applyDisplayModeClass('default');
      return;
    }

    // Zustand v5 persist stores data in { state: { settings: {...} } } format
    const persistedData = JSON.parse(savedSettings);

    // Extract settings from Zustand persist structure
    let settings: ThemeSettings = {};
    if (persistedData.state?.settings) {
      settings = persistedData.state.settings;
    } else if (persistedData.settings) {
      settings = persistedData.settings;
    } else {
      settings = persistedData;
    }

    // Apply theme mode (light/dark/system)
    const themeMode = settings.theme || 'light';

    if (themeMode === 'system') {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyThemeClass(prefersDark ? 'dark' : 'light');
    } else {
      applyThemeClass(themeMode);
    }

    // Apply accent color class
    const accentColor = settings.accentColor || 'teal';
    applyAccentColorClass(accentColor);

    // Apply display mode (outdoor high-contrast)
    const displayMode = settings.displayMode || 'default';
    applyDisplayModeClass(displayMode);
  } catch (error) {
    // Fail silently - use default light theme
    logger.warn('Failed to initialize theme from localStorage:', error);
    applyThemeClass('light');
  }
}

/**
 * Apply theme class to HTML element
 */
function applyThemeClass(theme: 'light' | 'dark'): void {
  const html = document.documentElement;

  if (theme === 'dark') {
    html.classList.add('theme-dark');
    html.classList.remove('theme-light');
  } else {
    html.classList.add('theme-light');
    html.classList.remove('theme-dark');
  }
}

/**
 * Apply accent color class to HTML element
 */
function applyAccentColorClass(
  color: 'teal' | 'terracotta' | 'blue' | 'purple' | 'green' | 'orange'
): void {
  const html = document.documentElement;

  // Remove all accent color classes (canonical + legacy aliases)
  html.classList.remove(
    'accent-teal',
    'accent-terracotta',
    'accent-blue',
    'accent-purple',
    'accent-green',
    'accent-orange'
  );

  // Add selected accent color class
  html.classList.add(`accent-${color}`);
}

/**
 * Apply display mode (default or outdoor) class to HTML element
 */
function applyDisplayModeClass(mode: 'default' | 'outdoor'): void {
  const html = document.documentElement;
  if (mode === 'outdoor') {
    html.classList.add('mode-outdoor');
  } else {
    html.classList.remove('mode-outdoor');
  }
}

// Auto-run if called directly (when imported as script in HTML)
if (typeof window !== 'undefined') {
  initializeThemeBlocking();
}
