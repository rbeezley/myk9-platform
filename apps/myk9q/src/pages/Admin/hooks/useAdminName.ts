/**
 * useAdminName Hook
 *
 * Manages administrator name state with localStorage persistence.
 * Provides synchronous access via ref for action validation.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'myk9q_admin_name';

/**
 * Hook return type
 */
export interface UseAdminNameReturn {
  /** Current admin name */
  adminName: string;
  /** Set admin name (also updates ref and localStorage) */
  setAdminName: (name: string) => void;
  /** Ref for synchronous access to current admin name */
  adminNameRef: React.RefObject<string>;
  /**
   * Check if admin name is available.
   * If not, calls onMissing callback and returns false.
   * If yes, returns true.
   */
  requireAdminName: (onMissing: () => void) => boolean;
}

/**
 * Custom hook for managing administrator name
 *
 * Features:
 * - Persists to localStorage automatically
 * - Provides ref for synchronous access (needed for action validation)
 * - Helper to require admin name before actions
 *
 * @returns Admin name state and utilities
 *
 * @example
 * ```tsx
 * function CompetitionAdmin() {
 *   const { adminName, setAdminName, requireAdminName } = useAdminName();
 *
 *   const handleAction = () => {
 *     if (!requireAdminName(() => showAdminNameDialog())) {
 *       return; // Dialog shown, action will retry after name entered
 *     }
 *     // Proceed with action using adminName
 *   };
 *
 *   return (
 *     <input
 *       value={adminName}
 *       onChange={(e) => setAdminName(e.target.value)}
 *     />
 *   );
 * }
 * ```
 */
export function useAdminName(): UseAdminNameReturn {
  // Load from localStorage on mount
  const [adminName, setAdminNameState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });

  // Ref for synchronous access
  const adminNameRef = useRef<string>(adminName);

  // Keep ref in sync with state
  useEffect(() => {
    adminNameRef.current = adminName;
  }, [adminName]);

  // Save to localStorage when name changes
  useEffect(() => {
    if (adminName.trim()) {
      localStorage.setItem(STORAGE_KEY, adminName.trim());
    }
  }, [adminName]);

  /**
   * Set admin name - updates state, ref, and localStorage
   */
  const setAdminName = useCallback((name: string) => {
    const trimmed = name.trim();
    adminNameRef.current = trimmed;
    setAdminNameState(trimmed);
  }, []);

  /**
   * Check if admin name is available for an action.
   * If not available, calls onMissing callback.
   * @returns true if name is available, false if onMissing was called
   */
  const requireAdminName = useCallback((onMissing: () => void): boolean => {
    if (adminNameRef.current.trim()) {
      return true;
    }
    onMissing();
    return false;
  }, []);

  return {
    adminName,
    setAdminName,
    adminNameRef,
    requireAdminName,
  };
}
