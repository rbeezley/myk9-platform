/**
 * Haptic Feedback Hook
 *
 * Provides vibration feedback for mobile devices to enhance touch interactions.
 * Falls back gracefully on devices/browsers that don't support vibration API.
 * Respects user settings for haptic feedback (settings.hapticFeedback).
 *
 * Usage:
 * ```tsx
 * const haptic = useHapticFeedback();
 *
 * <button onClick={() => {
 *   haptic.light();
 *   // ... handle click
 * }}>Click Me</button>
 * ```
 */

import { useSettingsStore } from '@/stores/settingsStore';

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

interface HapticFeedbackAPI {
  light: () => void;
  medium: () => void;
  heavy: () => void;
  success: () => void;
  error: () => void;
  warning: () => void;
  custom: (pattern: number | number[]) => void;
  isSupported: boolean;
}

/**
 * Haptic feedback patterns (in milliseconds)
 * Designed for dog show environment - quick, distinct, not annoying
 *
 * Note: Android devices often have a minimum vibration threshold (~50ms).
 * Durations below 50ms may not be perceivable on many devices.
 */
const HAPTIC_PATTERNS = {
  light: 50,        // Quick tap - status changes, menu items
  medium: 75,       // Button press - save, submit
  heavy: 100,       // Important action - delete, reset
  success: [50, 80, 50] as number[],  // Double pulse - score saved, check-in complete
  error: [75, 80, 75, 80, 75] as number[],  // Triple pulse - validation error, failed sync
  warning: [50, 150, 50] as number[],  // Pause pulse - time warning, conflict
};

/**
 * Check if vibration API is supported
 */
function isVibrationSupported(): boolean {
  return 'vibrate' in navigator && typeof navigator.vibrate === 'function';
}

/**
 * Trigger vibration with fallback
 * @param pattern - Vibration pattern in milliseconds
 * @param respectSettings - Whether to check user settings (default: true)
 */
function vibrate(pattern: number | number[], respectSettings = true): boolean {
  if (!isVibrationSupported()) {
    return false;
  }

  // Check user settings if requested
  if (respectSettings) {
    const { settings } = useSettingsStore.getState();
    if (!settings.hapticFeedback) {
      return false; // User has disabled haptic feedback
    }
  }

  try {
    return navigator.vibrate(pattern);
  } catch (_error) {
    // Silent fail - haptic is enhancement, not requirement
    return false;
  }
}

/**
 * Hook for haptic feedback
 *
 * Provides methods for different vibration patterns.
 * Safe to call on all devices - gracefully degrades.
 * Automatically respects user's haptic feedback setting.
 */
export function useHapticFeedback(): HapticFeedbackAPI {
  const { settings } = useSettingsStore();
  const isSupported = isVibrationSupported() && settings.hapticFeedback;

  return {
    /**
     * Light haptic - 10ms
     * Use for: menu items, status badge taps, filter chips
     */
    light: () => vibrate(HAPTIC_PATTERNS.light),

    /**
     * Medium haptic - 20ms
     * Use for: button presses, card taps, navigation
     */
    medium: () => vibrate(HAPTIC_PATTERNS.medium),

    /**
     * Heavy haptic - 30ms
     * Use for: important actions, confirmations, drag start
     */
    heavy: () => vibrate(HAPTIC_PATTERNS.heavy),

    /**
     * Success haptic - double pulse
     * Use for: score saved, check-in complete, sync success
     */
    success: () => vibrate(HAPTIC_PATTERNS.success),

    /**
     * Error haptic - triple pulse
     * Use for: validation errors, failed sync, conflicts
     */
    error: () => vibrate(HAPTIC_PATTERNS.error),

    /**
     * Warning haptic - pause pulse
     * Use for: time warnings, max time approaching, conflicts
     */
    warning: () => vibrate(HAPTIC_PATTERNS.warning),

    /**
     * Custom haptic pattern
     * @param pattern - Single duration or array of [vibrate, pause, vibrate, ...]
     */
    custom: (pattern: number | number[]) => vibrate(pattern),

    /**
     * Whether haptic feedback is supported on this device
     */
    isSupported,
  };
}

/**
 * Standalone haptic feedback functions (for use outside React components)
 */
export const haptic = {
  light: () => vibrate(HAPTIC_PATTERNS.light),
  medium: () => vibrate(HAPTIC_PATTERNS.medium),
  heavy: () => vibrate(HAPTIC_PATTERNS.heavy),
  success: () => vibrate(HAPTIC_PATTERNS.success),
  error: () => vibrate(HAPTIC_PATTERNS.error),
  warning: () => vibrate(HAPTIC_PATTERNS.warning),
  custom: (pattern: number | number[]) => vibrate(pattern),
  isSupported: isVibrationSupported(),
};
