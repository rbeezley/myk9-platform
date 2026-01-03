/**
 * useAdminName Hook
 *
 * Manages admin name state with localStorage persistence for Competition Admin.
 * Extracts ~30 lines of admin name logic from CompetitionAdmin.tsx.
 *
 * Features:
 * - Load admin name from localStorage on mount
 * - Save admin name to localStorage when changed
 * - Clear admin name
 * - Trim whitespace automatically
 *
 * Dependencies:
 * - localStorageUtils (Phase 1) for safe localStorage operations
 */

import { useState, useEffect } from 'react';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/localStorageUtils';

const ADMIN_NAME_KEY = 'myk9q_admin_name';

export interface UseAdminNameOptions {
  /**
   * Optional default admin name if not found in localStorage
   */
  defaultName?: string;

  /**
   * Optional callback when admin name changes
   */
  onNameChange?: (name: string) => void;
}

export interface UseAdminNameReturn {
  /**
   * Current admin name
   */
  adminName: string;

  /**
   * Set admin name (will be trimmed and saved to localStorage)
   */
  setAdminName: (name: string) => void;

  /**
   * Clear admin name (removes from localStorage)
   */
  clearAdminName: () => void;

  /**
   * Check if admin name is set (non-empty after trimming)
   */
  hasAdminName: boolean;
}

/**
 * Custom hook for managing admin name with localStorage persistence
 *
 * Consolidates the admin name logic from CompetitionAdmin.tsx (lines 37-101).
 * Automatically saves to localStorage and handles trimming.
 *
 * @param options - Configuration options
 * @returns Admin name state and methods
 *
 * @example
 * ```typescript
 * const {
 *   adminName,
 *   setAdminName,
 *   clearAdminName,
 *   hasAdminName
 * } = useAdminName();
 *
 * // Set admin name
 * setAdminName('John Smith');
 *
 * // Clear admin name
 * clearAdminName();
 *
 * // Check if name is set
 * if (hasAdminName) {
 *   // ...
 * }
 * ```
 */
export function useAdminName(
  options: UseAdminNameOptions = {}
): UseAdminNameReturn {
  const { defaultName = '', onNameChange } = options;

  // Load admin name from localStorage on mount
  const [adminName, setAdminNameState] = useState<string>(() => {
    return safeLocalStorageGet(ADMIN_NAME_KEY, defaultName);
  });

  // Save admin name to localStorage whenever it changes
  useEffect(() => {
    const trimmedName = adminName.trim();

    if (trimmedName) {
      safeLocalStorageSet(ADMIN_NAME_KEY, trimmedName);
    } else {
      // If empty after trimming, remove from localStorage
      safeLocalStorageRemove(ADMIN_NAME_KEY);
    }

    // Notify callback if provided
    if (onNameChange) {
      onNameChange(trimmedName);
    }
  }, [adminName, onNameChange]);

  // Set admin name
  const setAdminName = (name: string) => {
    setAdminNameState(name);
  };

  // Clear admin name
  const clearAdminName = () => {
    setAdminNameState('');
    safeLocalStorageRemove(ADMIN_NAME_KEY);

    if (onNameChange) {
      onNameChange('');
    }
  };

  // Check if admin name is set
  const hasAdminName = adminName.trim().length > 0;

  return {
    adminName,
    setAdminName,
    clearAdminName,
    hasAdminName,
  };
}
