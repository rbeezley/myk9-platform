/**
 * Theme utility hooks
 * Extracted from EnhancedThemeContext to fix fast refresh warnings
 */

import { useContext } from 'react';
import { EnhancedThemeContext } from '@/context/EnhancedThemeContext';

export function useEnhancedTheme() {
  const context = useContext(EnhancedThemeContext);
  if (context === undefined) {
    throw new Error('useEnhancedTheme must be used within an EnhancedThemeProvider');
  }
  return context;
}

// Hook for simple theme toggle (maintains backward compatibility)
export function useThemeToggle() {
  const { theme, toggleTheme } = useEnhancedTheme();
  return { theme, toggleTheme };
}