/**
 * Smart Defaults Hook
 *
 * React hooks for applying and managing smart defaults in components.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  detectDefaultsContext,
  applySmartDefaults,
  validateSettings,
  getOptimizationSuggestions,
  getRecommendedSettings,
  autoOptimizeSettings,
  type SmartDefaultsContext,
} from '@/services/smartDefaults';
import type { AppSettings } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

/**
 * Hook to get smart defaults context
 */
export function useDefaultsContext(userRole?: string) {
  const [context, setContext] = useState<SmartDefaultsContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadContext() {
      try {
        const ctx = await detectDefaultsContext(userRole);
        if (mounted) {
          setContext(ctx);
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('Failed to detect defaults context:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      mounted = false;
    };
  }, [userRole]);

  return { context, isLoading };
}

/**
 * Hook to apply smart defaults to settings
 */
export function useSmartDefaults(userRole?: string) {
  const { settings, updateSettings } = useSettingsStore();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const applyDefaults = useCallback(
    async (forceReset = false) => {
      setIsApplying(true);
      setError(null);

      try {
        const optimizedSettings = await applySmartDefaults(settings, userRole, forceReset);
        updateSettings(optimizedSettings);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to apply smart defaults'));
      } finally {
        setIsApplying(false);
      }
    },
    [settings, userRole, updateSettings]
  );

  return {
    applyDefaults,
    isApplying,
    error,
  };
}

/**
 * Hook to validate current settings and get recommendations
 */
export function useSettingsValidation() {
  const { settings } = useSettingsStore();
  const [validation, setValidation] = useState<{
    valid: boolean;
    warnings: string[];
    recommendations: Partial<AppSettings>;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validate = useCallback(async () => {
    setIsValidating(true);

    try {
      const result = await validateSettings(settings);
      setValidation(result);
    } catch (error) {
      logger.error('Failed to validate settings:', error);
    } finally {
      setIsValidating(false);
    }
  }, [settings]);

  useEffect(() => {
    validate();
  }, [validate]);

  return {
    validation,
    isValidating,
    revalidate: validate,
  };
}

/**
 * Hook to get optimization suggestions
 */
export function useOptimizationSuggestions() {
  const { settings } = useSettingsStore();
  const [suggestions, setSuggestions] = useState<Array<{
    category: string;
    suggestion: string;
    setting: keyof AppSettings;
    currentValue: AppSettings[keyof AppSettings];
    recommendedValue: AppSettings[keyof AppSettings];
    impact: 'low' | 'medium' | 'high';
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setIsLoading(true);

    try {
      const sug = await getOptimizationSuggestions(settings);
      setSuggestions(sug);
    } catch (error) {
      logger.error('Failed to get optimization suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  return {
    suggestions,
    isLoading,
    reload: loadSuggestions,
  };
}

/**
 * Hook to apply preset scenario
 */
export function useScenarioPresets() {
  const { updateSettings } = useSettingsStore();
  const [isApplying, setIsApplying] = useState(false);

  const applyScenario = useCallback(
    async (scenario: 'battery-saver' | 'performance' | 'data-saver' | 'balanced') => {
      setIsApplying(true);

      try {
        const recommended = await getRecommendedSettings(scenario);
        updateSettings(recommended as AppSettings);
      } catch (error) {
        logger.error('Failed to apply scenario:', error);
      } finally {
        setIsApplying(false);
      }
    },
    [updateSettings]
  );

  return {
    applyScenario,
    isApplying,
  };
}

/**
 * Hook for auto-optimization
 */
export function useAutoOptimize() {
  const { settings, updateSettings } = useSettingsStore();
  const [isOptimizing, setIsOptimizing] = useState(false);

  const optimize = useCallback(
    async (scenario?: 'battery-saver' | 'performance' | 'data-saver') => {
      setIsOptimizing(true);

      try {
        const optimized = await autoOptimizeSettings(settings, scenario);
        updateSettings(optimized);
      } catch (error) {
        logger.error('Failed to auto-optimize:', error);
      } finally {
        setIsOptimizing(false);
      }
    },
    [settings, updateSettings]
  );

  return {
    optimize,
    isOptimizing,
  };
}

/**
 * Combined hook with all smart defaults functionality
 */
export function useSmartDefaultsManager(userRole?: string) {
  const { context, isLoading: contextLoading } = useDefaultsContext(userRole);
  const { applyDefaults, isApplying, error } = useSmartDefaults(userRole);
  const { validation, isValidating, revalidate } = useSettingsValidation();
  const { suggestions, isLoading: suggestionsLoading, reload } = useOptimizationSuggestions();
  const { applyScenario, isApplying: scenarioApplying } = useScenarioPresets();
  const { optimize, isOptimizing } = useAutoOptimize();

  return {
    // Context
    context,
    contextLoading,

    // Apply defaults
    applyDefaults,
    isApplying,
    error,

    // Validation
    validation,
    isValidating,
    revalidate,

    // Suggestions
    suggestions,
    suggestionsLoading,
    reloadSuggestions: reload,

    // Scenarios
    applyScenario,
    scenarioApplying,

    // Auto-optimize
    optimize,
    isOptimizing,

    // Convenience
    isAnyLoading:
      contextLoading ||
      isApplying ||
      isValidating ||
      suggestionsLoading ||
      scenarioApplying ||
      isOptimizing,
  };
}

/**
 * Hook to check if it's the first launch
 */
export function useIsFirstLaunch() {
  const [isFirstLaunch] = useState(() => !localStorage.getItem('myK9Q_settings'));
  const [isChecking] = useState(false);

  return { isFirstLaunch, isChecking };
}

/**
 * Hook to automatically apply defaults on first launch
 */
export function useAutoApplyDefaults(userRole?: string, enabled = true) {
  const { isFirstLaunch, isChecking } = useIsFirstLaunch();
  const { applyDefaults } = useSmartDefaults(userRole);
  const [hasApplied, setHasApplied] = useState(false);

  useEffect(() => {
    if (!enabled || isChecking || hasApplied || !isFirstLaunch) {
      return;
    }

    applyDefaults(false).then(() => {
      setHasApplied(true);
    });
  }, [enabled, isChecking, hasApplied, isFirstLaunch, applyDefaults]);

  return { isFirstLaunch, hasApplied };
}
