/**
 * Animation Settings Hooks - myK9Q-specific wrappers
 *
 * These wrappers integrate the shared hooks from @myk9/scoring-ui
 * with the myK9Q settings store.
 *
 * @deprecated For new code, import from '@myk9/scoring-ui' and use
 * createAnimationSettingsProvider() with your settings store.
 */

import { useMemo } from 'react';
import {
  useAnimationSettings as useBaseAnimationSettings,
  useAnimationProps as useBaseAnimationProps,
  useAnimationDuration as useBaseAnimationDuration,
  useCanAnimate as useBaseCanAnimate,
  useSpringConfig as useBaseSpringConfig,
  useThrottledRaf as useBaseThrottledRaf,
  usePrefersReducedMotion,
  useAnimationClasses as useBaseAnimationClasses,
  createAnimationSettingsProvider,
  type AnimationConfig,
  type AnimationSettingsProvider,
} from '@myk9/scoring-ui';
import { useSettingsStore } from '@/stores/settingsStore';

// Re-export types and non-store-dependent hooks
export { type AnimationConfig, usePrefersReducedMotion };

// Create provider that reads from myK9Q settings store
function useMyK9QProvider(): AnimationSettingsProvider {
  const settings = useSettingsStore((state) => state.settings);

  return useMemo(() => createAnimationSettingsProvider(
    () => ({
      enableAnimations: settings.enableAnimations,
      enableBlur: settings.enableBlur,
      enableShadows: settings.enableShadows,
    }),
    'myK9Q_settings'
  ), [settings.enableAnimations, settings.enableBlur, settings.enableShadows]);
}

/**
 * Get animation configuration based on device and myK9Q settings
 */
export function useAnimationSettings(): AnimationConfig {
  const provider = useMyK9QProvider();
  return useBaseAnimationSettings(provider);
}

/**
 * Get CSS animation properties based on configuration
 */
export function useAnimationProps(config: AnimationConfig) {
  return useBaseAnimationProps(config);
}

/**
 * Get recommended animation duration
 */
export function useAnimationDuration(baseDuration: number = 300): number {
  const provider = useMyK9QProvider();
  return useBaseAnimationDuration(baseDuration, provider);
}

/**
 * Check if a specific animation type should be enabled
 */
export function useCanAnimate(
  animationType: 'transform' | 'opacity' | 'blur' | 'shadow' | 'motionPath'
): boolean {
  const provider = useMyK9QProvider();
  return useBaseCanAnimate(animationType, provider);
}

/**
 * Spring animation config based on device capabilities
 */
export function useSpringConfig() {
  const provider = useMyK9QProvider();
  return useBaseSpringConfig(provider);
}

/**
 * Request animation frame with FPS throttling
 */
export function useThrottledRaf(
  callback: (time: number) => void,
  enabled: boolean = true
): void {
  const provider = useMyK9QProvider();
  return useBaseThrottledRaf(callback, enabled, provider);
}

/**
 * Get CSS class names for animation configuration
 */
export function useAnimationClasses(): string {
  const provider = useMyK9QProvider();
  return useBaseAnimationClasses(provider);
}
