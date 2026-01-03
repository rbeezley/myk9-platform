/**
 * useFeatureFlag Hook
 *
 * React hook for checking feature flags in components.
 * Automatically updates when settings change.
 */

import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { isFeatureEnabled, type FeatureFlag, getFeatureConfig } from '@/utils/featureFlags';

/**
 * Check if a feature flag is enabled
 * Updates when beta features setting changes
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { enableBetaFeatures, developerMode } = useSettingsStore((state) => ({
    enableBetaFeatures: state.settings.enableBetaFeatures,
    developerMode: state.settings.developerMode,
  }));

  // Use useMemo instead of useState + useEffect to avoid cascading renders
  const enabled = useMemo(() => isFeatureEnabled(flag), [flag, enableBetaFeatures, developerMode]);

  return enabled;
}

/**
 * Get multiple feature flags at once
 */
export function useFeatureFlags(flags: FeatureFlag[]): Record<FeatureFlag, boolean> {
  const { enableBetaFeatures, developerMode } = useSettingsStore((state) => ({
    enableBetaFeatures: state.settings.enableBetaFeatures,
    developerMode: state.settings.developerMode,
  }));

  // Use useMemo instead of useState + useEffect to avoid cascading renders
  const flagStates = useMemo(() => {
    const states: Partial<Record<FeatureFlag, boolean>> = {};
    flags.forEach((flag) => {
      states[flag] = isFeatureEnabled(flag);
    });
    return states as Record<FeatureFlag, boolean>;
  }, [flags, enableBetaFeatures, developerMode]);

  return flagStates;
}

/**
 * Get feature configuration with metadata
 */
export function useFeatureFlagConfig(flag: FeatureFlag) {
  return {
    enabled: useFeatureFlag(flag),
    config: getFeatureConfig(flag),
  };
}
