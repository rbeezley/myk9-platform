/**
 * useVisibilitySettings Hook
 *
 * Manages result visibility settings with cascade logic (Show → Trial → Class).
 * Handles show-level defaults, trial-level overrides, and class-level overrides.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import { useState, useCallback } from 'react';
import {
  setShowVisibility,
  setTrialVisibility,
  removeTrialVisibilityOverride,
} from '@/services/resultVisibilityService';
import type { VisibilityPreset } from '@/types/visibility';
import { logger } from '@/utils/logger';

/**
 * Hook return type
 */
export interface UseVisibilitySettingsReturn {
  // State
  showVisibilityPreset: VisibilityPreset;
  trialVisibilitySettings: Map<number, VisibilityPreset>;
  visibilitySectionExpanded: boolean;

  // Actions
  setShowVisibilityPreset: (preset: VisibilityPreset) => void;
  setTrialVisibilitySettings: (settings: Map<number, VisibilityPreset>) => void;
  setVisibilitySectionExpanded: (expanded: boolean) => void;
  handleSetShowVisibility: (preset: VisibilityPreset, adminName: string, licenseKey: string) => Promise<{ success: boolean; error?: string }>;
  handleSetTrialVisibility: (trialId: number, preset: VisibilityPreset, adminName: string, trialLabel: string) => Promise<{ success: boolean; error?: string }>;
  handleRemoveTrialVisibility: (trialId: number, trialLabel: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Custom hook for managing result visibility settings
 *
 * Provides state and methods for:
 * - Show-level visibility defaults (all classes inherit unless overridden)
 * - Trial-level visibility overrides (classes in trial inherit unless overridden)
 * - Removing trial overrides (fall back to show default)
 *
 * **Cascade Logic**: Show → Trial → Class
 * - Show default applies to all classes unless overridden at trial or class level
 * - Trial override applies to all classes in that trial unless overridden at class level
 * - Class override is the most specific and always wins
 *
 * @returns Visibility settings state and control methods
 *
 * @example
 * ```tsx
 * function CompetitionAdmin() {
 *   const {
 *     showVisibilityPreset,
 *     trialVisibilitySettings,
 *     handleSetShowVisibility,
 *     handleSetTrialVisibility
 *   } = useVisibilitySettings();
 *
 *   const handleShowChange = async (preset: VisibilityPreset) => {
 *     const result = await handleSetShowVisibility(preset, 'John Doe', 'license-123');
 *     if (!result.success) {
 *       logger.error(result.error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <select value={showVisibilityPreset} onChange={(e) => handleShowChange(e.target.value)}>
 *         <option value="open">Open</option>
 *         <option value="standard">Standard</option>
 *         <option value="locked">Locked</option>
 *       </select>
 *     </div>
 *   );
 * }
 * ```
 */
export function useVisibilitySettings(): UseVisibilitySettingsReturn {
  // State
  const [showVisibilityPreset, setShowVisibilityPreset] = useState<VisibilityPreset>('standard');
  const [trialVisibilitySettings, setTrialVisibilitySettings] = useState<Map<number, VisibilityPreset>>(new Map());
  const [visibilitySectionExpanded, setVisibilitySectionExpanded] = useState(false);

  /**
   * Set show-level visibility default (all classes inherit unless overridden)
   */
  const handleSetShowVisibility = useCallback(async (
    preset: VisibilityPreset,
    adminName: string,
    licenseKey: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await setShowVisibility(licenseKey, preset, adminName);
      setShowVisibilityPreset(preset);

      return { success: true };
    } catch (err) {
      logger.error('Error setting show visibility:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update show visibility'
      };
    }
  }, []);

  /**
   * Set trial-level visibility override
   */
  const handleSetTrialVisibility = useCallback(async (
    trialId: number,
    preset: VisibilityPreset,
    adminName: string,
    _trialLabel: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await setTrialVisibility(trialId, preset, adminName);

      // Update local state
      setTrialVisibilitySettings(prev => new Map(prev).set(trialId, preset));

      return { success: true };
    } catch (err) {
      logger.error('Error setting trial visibility:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update trial visibility'
      };
    }
  }, []);

  /**
   * Remove trial-level override (fall back to show default)
   */
  const handleRemoveTrialVisibility = useCallback(async (
    trialId: number,
    _trialLabel: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await removeTrialVisibilityOverride(trialId);

      // Update local state
      setTrialVisibilitySettings(prev => {
        const newMap = new Map(prev);
        newMap.delete(trialId);
        return newMap;
      });

      return { success: true };
    } catch (err) {
      logger.error('Error removing trial visibility override:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to remove trial visibility override'
      };
    }
  }, []);

  return {
    // State
    showVisibilityPreset,
    trialVisibilitySettings,
    visibilitySectionExpanded,

    // Setters
    setShowVisibilityPreset,
    setTrialVisibilitySettings,
    setVisibilitySectionExpanded,

    // Actions
    handleSetShowVisibility,
    handleSetTrialVisibility,
    handleRemoveTrialVisibility,
  };
}
