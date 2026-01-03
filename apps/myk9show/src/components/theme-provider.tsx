/**
 * Theme provider component for managing application-wide theme state
 * Provides light/dark mode switching with localStorage persistence
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeProviderContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'dark' | 'light'; // Resolved theme (system preference resolved)
}

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string;
}

/**
 * Get system theme preference
 */
function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'light';
  
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve the actual theme based on user preference and system settings
 */
function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  attribute = 'class',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize theme from localStorage or default
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey) as Theme;
      if (stored && ['dark', 'light', 'system'].includes(stored)) {
        return stored;
      }
    }
    return defaultTheme;
  });

  const [actualTheme, setActualTheme] = useState<'dark' | 'light'>(() => {
    return resolveTheme(theme);
  });

  // Update actual theme when theme or system preference changes
  useEffect(() => {
    const newActualTheme = resolveTheme(theme);
    setActualTheme(newActualTheme);

    // Apply theme to document
    if (typeof window !== 'undefined') {
      const root = window.document.documentElement;
      
      if (attribute === 'class') {
        root.classList.remove('light', 'dark');
        root.classList.add(newActualTheme);
      } else {
        root.setAttribute(attribute, newActualTheme);
      }
    }
  }, [theme, attribute]);

  // Listen for system theme changes when using 'system' theme
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      const newActualTheme = getSystemTheme();
      setActualTheme(newActualTheme);
      
      // Apply theme immediately
      const root = window.document.documentElement;
      if (attribute === 'class') {
        root.classList.remove('light', 'dark');
        root.classList.add(newActualTheme);
      } else {
        root.setAttribute(attribute, newActualTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, attribute]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, newTheme);
    }
  };

  const value: ThemeProviderContextType = {
    theme,
    setTheme,
    actualTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/**
 * Hook to use theme context
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeProviderContextType {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}

/**
 * Hook to toggle between light and dark themes
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useThemeToggle() {
  const { theme, setTheme, actualTheme } = useTheme();
  
  const toggleTheme = () => {
    if (theme === 'system') {
      // If currently system, switch to opposite of current actual theme
      setTheme(actualTheme === 'dark' ? 'light' : 'dark');
    } else {
      // Toggle between light and dark
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };
  
  const setSystemTheme = () => {
    setTheme('system');
  };
  
  return {
    toggleTheme,
    setSystemTheme,
    isDark: actualTheme === 'dark',
    isLight: actualTheme === 'light',
    isSystem: theme === 'system',
  };
}

/**
 * Component for theme toggle button
 */
export function ThemeToggle({ 
  className,
  showSystemOption = true 
}: { 
  className?: string;
  showSystemOption?: boolean;
}) {
  const { theme, setTheme, actualTheme } = useTheme();
  
  const nextTheme = () => {
    if (showSystemOption) {
      // Cycle: light -> dark -> system -> light
      switch (theme) {
        case 'light': return 'dark';
        case 'dark': return 'system';
        case 'system': return 'light';
        default: return 'light';
      }
    } else {
      // Simple toggle: light <-> dark
      return actualTheme === 'dark' ? 'light' : 'dark';
    }
  };
  
  const handleClick = () => {
    setTheme(nextTheme());
  };
  
  const getIcon = () => {
    if (theme === 'system') return '🌓'; // System
    return actualTheme === 'dark' ? '🌙' : '☀️';
  };
  
  const getLabel = () => {
    if (theme === 'system') return 'System theme';
    return actualTheme === 'dark' ? 'Dark theme' : 'Light theme';
  };
  
  return (
    <button
      onClick={handleClick}
      className={className}
      title={getLabel()}
      aria-label={getLabel()}
    >
      {getIcon()}
    </button>
  );
}

// Export types for external use
export type { Theme, ThemeProviderContextType };