/**
 * useLongPress Hook
 *
 * Detects long press gestures on touch and mouse devices.
 * Returns event handlers to attach to the target element.
 *
 * Integrates with haptic feedback (if provided) to give tactile confirmation
 * when long press is triggered. Haptic feedback is optional and provided via callback.
 *
 * Usage:
 * ```tsx
 * // Without haptic feedback
 * const longPressHandlers = useLongPress(() => {
 *   console.log('Long press detected!');
 * }, { delay: 800 });
 *
 * // With haptic feedback
 * import { useHapticFeedback } from '@myk9/scoring-ui';
 *
 * const haptic = useHapticFeedback(() => settings.hapticFeedback);
 * const longPressHandlers = useLongPress(() => {
 *   console.log('Long press detected!');
 * }, {
 *   delay: 800,
 *   onHaptic: () => haptic.heavy()
 * });
 *
 * <button {...longPressHandlers} onClick={handleClick}>
 *   Press me
 * </button>
 * ```
 */

import { useRef, useCallback } from 'react';

export interface UseLongPressOptions {
  /** Delay in ms before long press triggers (default: 800) */
  delay?: number;
  /** Whether long press is enabled (default: true) */
  enabled?: boolean;
  /** Callback when long press starts (visual feedback) */
  onLongPressStart?: () => void;
  /** Callback for haptic feedback when long press triggers */
  onHaptic?: () => void;
}

export interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

export function useLongPress(
  onLongPress: () => void,
  options: UseLongPressOptions = {}
): LongPressHandlers {
  const { delay = 800, enabled = true, onLongPressStart, onHaptic } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    if (!enabled) return;

    isLongPressRef.current = false;

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;

      // Trigger haptic feedback if provided
      onHaptic?.();

      // Trigger visual feedback callback
      onLongPressStart?.();

      // Trigger main callback
      onLongPress();
    }, delay);
  }, [enabled, delay, onLongPress, onLongPressStart, onHaptic]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to primary button (left click)
    if (e.button !== 0) return;
    start();
  }, [start]);

  const onMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  const onMouseLeave = useCallback(() => {
    cancel();
  }, [cancel]);

  const onTouchStart = useCallback(() => {
    start();
  }, [start]);

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchEnd,
  };
}

/**
 * Check if a long press was triggered (use in onClick to prevent normal action)
 * Note: This is handled internally - the onClick will still fire after long press,
 * but you can check isLongPressRef if needed in more complex scenarios.
 */
