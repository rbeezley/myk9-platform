import { createContext, useEffect, useState, ReactNode } from 'react';
import { Theme, ThemeContextType } from './themeUtils';
import { applyThemeClasses } from './themeClasses';

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme') as Theme;
      if (savedTheme) {
        return savedTheme;
      }
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    // Apply the full theme-class trio (theme-light/theme-dark/dark) — NOT just
    // `.dark`. Toggling `.dark` alone left a stale `.theme-dark` behind (set by
    // theme-init.js / settingsStore on an OS-dark boot), which leaks the DARK
    // --accent into a LIGHT page: hover:bg-accent buttons filled near-black.
    // See applyThemeClasses for the full explanation.
    applyThemeClasses(document.documentElement, theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

