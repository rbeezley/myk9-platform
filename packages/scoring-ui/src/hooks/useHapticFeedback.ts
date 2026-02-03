/**
 * Haptic Feedback Hook
 *
 * Provides vibration feedback for mobile devices to enhance touch interactions.
 * Falls back gracefully on devices/browsers that don't support vibration API.
 *
 * Usage:
 * ```tsx
 * // With settings check
 * const haptic = useHapticFeedback(() => settings.hapticFeedback);
 *
 * // Without settings check (always enabled if supported)
 * const haptic = useHapticFeedback();
 *
 * <button onClick={() => {
 *   haptic.light();
 *   // ... handle click
 * }}>Click Me</button>
 * ```
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning';

export interface HapticFeedbackAPI {
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
 * @param isEnabled - Function to check if haptic is enabled (default: always true)
 */
function vibrate(pattern: number | number[], isEnabled: () => boolean = () => true): boolean {
  if (!isVibrationSupported()) {
    return false;
  }

  // Check if enabled
  if (!isEnabled()) {
    return false;
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
 *
 * @param isEnabled - Optional function to check if haptic is enabled (e.g., from user settings)
 *                    If not provided, haptic will be enabled whenever supported.
 *
 * @example
 * ```tsx
 * // With settings check
 * const { settings } = useSettingsStore();
 * const haptic = useHapticFeedback(() => settings.hapticFeedback);
 *
 * // Without settings check (always enabled if supported)
 * const haptic = useHapticFeedback();
 * ```
 */
export function useHapticFeedback(isEnabled?: () => boolean): HapticFeedbackAPI {
  const enabledCheck = isEnabled || (() => true);
  const isSupported = isVibrationSupported() && enabledCheck();

  return {
    /**
     * Light haptic - 50ms
     * Use for: menu items, status badge taps, filter chips
     */
    light: () => vibrate(HAPTIC_PATTERNS.light, enabledCheck),

    /**
     * Medium haptic - 75ms
     * Use for: button presses, card taps, navigation
     */
    medium: () => vibrate(HAPTIC_PATTERNS.medium, enabledCheck),

    /**
     * Heavy haptic - 100ms
     * Use for: important actions, confirmations, drag start
     */
    heavy: () => vibrate(HAPTIC_PATTERNS.heavy, enabledCheck),

    /**
     * Success haptic - double pulse [50, 80, 50]
     * Use for: score saved, check-in complete, sync success
     */
    success: () => vibrate(HAPTIC_PATTERNS.success, enabledCheck),

    /**
     * Error haptic - triple pulse [75, 80, 75, 80, 75]
     * Use for: validation errors, failed sync, conflicts
     */
    error: () => vibrate(HAPTIC_PATTERNS.error, enabledCheck),

    /**
     * Warning haptic - pause pulse [50, 150, 50]
     * Use for: time warnings, max time approaching, conflicts
     */
    warning: () => vibrate(HAPTIC_PATTERNS.warning, enabledCheck),

    /**
     * Custom haptic pattern
     * @param pattern - Single duration or array of [vibrate, pause, vibrate, ...]
     */
    custom: (pattern: number | number[]) => vibrate(pattern, enabledCheck),

    /**
     * Whether haptic feedback is supported and enabled
     */
    isSupported,
  };
}

/**
 * Standalone haptic feedback functions (for use outside React components)
 * Note: These always respect haptic support but not user settings
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
