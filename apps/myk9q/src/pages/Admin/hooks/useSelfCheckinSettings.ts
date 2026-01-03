/**
 * useSelfCheckinSettings Hook
 *
 * Manages self check-in settings with cascade logic (Show → Trial → Class).
 * Handles show-level defaults, trial-level overrides, and class-level overrides.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import { useState, useCallback } from 'react';
import { logger } from '@/utils/logger';
import {
  setShowSelfCheckin,
  setTrialSelfCheckin,
  removeTrialSelfCheckinOverride,
} from '@/services/resultVisibilityService';

/**
 * Result type for async operations
 */
export interface Result {
  success: boolean;
  error?: string;
}

/**
 * Hook return type
 */
export interface UseSelfCheckinSettingsReturn {
  // State
  showSelfCheckinEnabled: boolean;
  trialSelfCheckinSettings: Map<number, boolean>;
  checkinSectionExpanded: boolean;

  // Actions
  setShowSelfCheckinEnabled: (enabled: boolean) => void;
  setTrialSelfCheckinSettings: (settings: Map<number, boolean>) => void;
  setCheckinSectionExpanded: (expanded: boolean) => void;
  handleSetShowSelfCheckin: (enabled: boolean, licenseKey: string) => Promise<Result>;
  handleSetTrialSelfCheckin: (trialId: number, enabled: boolean, trialLabel: string) => Promise<Result>;
  handleRemoveTrialSelfCheckin: (trialId: number, trialLabel: string) => Promise<Result>;
}

/**
 * Custom hook for managing self check-in settings
 *
 * Provides state and methods for:
 * - Show-level check-in defaults (all classes inherit unless overridden)
 * - Trial-level check-in overrides (classes in trial inherit unless overridden)
 * - Removing trial overrides (fall back to show default)
 *
 * **Cascade Logic**: Show → Trial → Class
 * - Show default applies to all classes unless overridden at trial or class level
 * - Trial override applies to all classes in that trial unless overridden at class level
 * - Class override is the most specific and always wins
 *
 * @returns Self check-in settings state and control methods
 *
 * @example
 * ```tsx
 * function CompetitionAdmin() {
 *   const {
 *     showSelfCheckinEnabled,
 *     trialSelfCheckinSettings,
 *     handleSetShowSelfCheckin,
 *     handleSetTrialSelfCheckin
 *   } = useSelfCheckinSettings();
 *
 *   const handleShowChange = async (enabled: boolean) => {
 *     const result = await handleSetShowSelfCheckin(enabled, 'license-123');
 *     if (!result.success) {
 *       logger.error(result.error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input
 *         type="checkbox"
 *         checked={showSelfCheckinEnabled}
 *         onChange={(e) => handleShowChange(e.target.checked)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function useSelfCheckinSettings(): UseSelfCheckinSettingsReturn {
  // State
  const [showSelfCheckinEnabled, setShowSelfCheckinEnabled] = useState<boolean>(true);
  const [trialSelfCheckinSettings, setTrialSelfCheckinSettings] = useState<Map<number, boolean>>(new Map());
  const [checkinSectionExpanded, setCheckinSectionExpanded] = useState(false);

  /**
   * Set show-level self check-in default (all classes inherit unless overridden)
   */
  const handleSetShowSelfCheckin = useCallback(async (
    enabled: boolean,
    licenseKey: string
  ): Promise<Result> => {
    try {
      await setShowSelfCheckin(licenseKey, enabled);
      setShowSelfCheckinEnabled(enabled);

      return { success: true };
    } catch (err) {
      logger.error('Error setting show self check-in:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update show self check-in'
      };
    }
  }, []);

  /**
   * Set trial-level self check-in override
   */
  const handleSetTrialSelfCheckin = useCallback(async (
    trialId: number,
    enabled: boolean,
    _trialLabel: string
  ): Promise<Result> => {
    try {
      await setTrialSelfCheckin(trialId, enabled);

      // Update local state
      setTrialSelfCheckinSettings(prev => new Map(prev).set(trialId, enabled));

      return { success: true };
    } catch (err) {
      logger.error('Error setting trial self check-in:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update trial self check-in'
      };
    }
  }, []);

  /**
   * Remove trial-level override (fall back to show default)
   */
  const handleRemoveTrialSelfCheckin = useCallback(async (
    trialId: number,
    _trialLabel: string
  ): Promise<Result> => {
    try {
      await removeTrialSelfCheckinOverride(trialId);

      // Update local state
      setTrialSelfCheckinSettings(prev => {
        const newMap = new Map(prev);
        newMap.delete(trialId);
        return newMap;
      });

      return { success: true };
    } catch (err) {
      logger.error('Error removing trial self check-in override:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to remove trial self check-in override'
      };
    }
  }, []);

  return {
    // State
    showSelfCheckinEnabled,
    trialSelfCheckinSettings,
    checkinSectionExpanded,

    // Setters
    setShowSelfCheckinEnabled,
    setTrialSelfCheckinSettings,
    setCheckinSectionExpanded,

    // Actions
    handleSetShowSelfCheckin,
    handleSetTrialSelfCheckin,
    handleRemoveTrialSelfCheckin,
  };
}
