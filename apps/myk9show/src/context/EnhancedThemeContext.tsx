/**
 * Enhanced Theme Context
 * Phase 6.4: User Preferences & UI State
 *
 * Extended theme context that integrates with user preferences system
 */

import { createContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useAuthUser } from '@/hooks/useAuthUser';
import type { ThemeMode, ThemePreferences } from '@/types/user-preferences';
import { logger } from '@/services/LoggingService';

interface EnhancedThemeContextType {
  // Theme state
  theme: 'light' | 'dark';
  themeMode: ThemeMode;
  preferences: ThemePreferences | null;

  // Theme actions
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;

  // Loading state
  loading: boolean;

  // Utility functions
  applyThemePreferences: (prefs: ThemePreferences) => void;
  resetTheme: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const EnhancedThemeContext = createContext<EnhancedThemeContextType | undefined>(undefined);

export function EnhancedThemeProvider({ children }: { children: ReactNode }) {
  const user = useAuthUser();
  const { preferences: userPreferences, updatePreferences } = useUserPreferences(user?.id || null);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [loading, setLoading] = useState(true);

  // Get theme preferences from user preferences
  const themePreferences = userPreferences?.theme || null;

  /**
   * Apply system theme based on media query
   */
  const applySystemTheme = () => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
    setTheme(systemTheme);
    return systemTheme;
  };

  /**
   * Apply theme mode and update DOM
   */
  const applyThemeMode = useCallback((mode: ThemeMode) => {
    let effectiveTheme: 'light' | 'dark';

    switch (mode) {
      case 'dark':
        effectiveTheme = 'dark';
        break;
      case 'light':
        effectiveTheme = 'light';
        break;
      case 'system':
      default:
        effectiveTheme = applySystemTheme();
        break;
    }

    setTheme(effectiveTheme);
    setThemeModeState(mode);

    // Update DOM
    const root = document.documentElement;
    root.classList.toggle('dark', effectiveTheme === 'dark');

    return effectiveTheme;
  }, []);

  /**
   * Set theme mode and save to preferences
   */
  const setThemeMode = async (mode: ThemeMode) => {
    if (!user || !userPreferences) return;

    try {
      await updatePreferences({
        theme: {
          ...userPreferences.theme,
          mode,
        },
      });
      applyThemeMode(mode);
    } catch (error) {
      logger.error('Failed to update theme mode:', 'app', {}, error as Error);
      // Apply locally even if save fails
      applyThemeMode(mode);
    }
  };

  /**
   * Toggle between light and dark (when not in system mode)
   */
  const toggleTheme = () => {
    if (themeMode === 'system') {
      // If in system mode, switch to opposite of current theme
      const newMode = theme === 'dark' ? 'light' : 'dark';
      setThemeMode(newMode);
    } else {
      // If in manual mode, toggle
      const newMode = themeMode === 'dark' ? 'light' : 'dark';
      setThemeMode(newMode);
    }
  };

  /**
   * Apply complete theme preferences
   */
  const applyThemePreferences = useCallback(
    async (prefs: ThemePreferences) => {
      if (!user) return;

      try {
        // Apply theme mode
        applyThemeMode(prefs.mode);

        // Apply other visual preferences
        const root = document.documentElement;

        // Layout density
        document.body.className = document.body.className
          .replace(/\bdensity-\w+\b/g, '')
          .concat(` density-${prefs.layoutDensity}`);

        // Font size
        const fontScales = {
          small: '0.9',
          medium: '1.0',
          large: '1.2',
          'extra-large': '1.4',
        };
        root.style.setProperty('--font-scale', fontScales[prefs.fontSize]);

        // Accessibility
        root.classList.toggle('reduce-motion', prefs.reduceMotion);
        root.classList.toggle('high-contrast', prefs.highContrast);

        // Save to preferences if needed
        if (userPreferences) {
          await updatePreferences({ theme: prefs });
        }
      } catch (error) {
        logger.error('Failed to apply theme preferences:', 'app', {}, error as Error);
      }
    },
    [user, userPreferences, updatePreferences, applyThemeMode]
  );

  /**
   * Reset theme to defaults
   */
  const resetTheme = () => {
    setThemeMode('system');

    // Reset CSS custom properties
    const root = document.documentElement;
    root.style.removeProperty('--font-scale');
    root.classList.remove('reduce-motion', 'high-contrast');

    // Reset body classes
    document.body.className = document.body.className.replace(/\bdensity-\w+\b/g, '');
  };

  // Initialize theme on mount and when preferences change using render-time sync
  const preferencesKey = themePreferences ? JSON.stringify(themePreferences) : 'none';
  const userKey = user === null ? 'no-user' : user?.id || 'loading';
  const themeKey = `${preferencesKey}-${userKey}`;
  const [prevThemeKey, setPrevThemeKey] = useState(themeKey);
  if (themeKey !== prevThemeKey) {
    setPrevThemeKey(themeKey);
    if (themePreferences) {
      applyThemePreferences(themePreferences);
      setLoading(false);
    } else if (user === null) {
      // No user, use localStorage fallback
      const savedMode = localStorage.getItem('theme-mode') as ThemeMode;
      applyThemeMode(savedMode || 'system');
      setLoading(false);
    }
  }

  // Listen for system theme changes
  useEffect(() => {
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applySystemTheme();

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    return undefined;
  }, [themeMode]);

  // Save theme mode to localStorage as fallback
  useEffect(() => {
    localStorage.setItem('theme-mode', themeMode);
  }, [themeMode]);

  const value: EnhancedThemeContextType = {
    theme,
    themeMode,
    preferences: themePreferences,
    setThemeMode,
    toggleTheme,
    loading,
    applyThemePreferences,
    resetTheme,
  };

  return <EnhancedThemeContext.Provider value={value}>{children}</EnhancedThemeContext.Provider>;
}
