/**
 * useLongPress Hook
 *
 * Detects long press gestures on touch and mouse devices.
 * Returns event handlers to attach to the target element.
 *
 * Usage:
 * ```tsx
 * const longPressHandlers = useLongPress(() => {
 *   console.log('Long press detected!');
 * }, { delay: 800 });
 *
 * <button {...longPressHandlers} onClick={handleClick}>
 *   Press me
 * </button>
 * ```
 */

import { useRef, useCallback } from 'react';
import { useHapticFeedback } from './useHapticFeedback';

interface UseLongPressOptions {
  /** Delay in ms before long press triggers (default: 800) */
  delay?: number;
  /** Whether long press is enabled (default: true) */
  enabled?: boolean;
  /** Callback when long press starts (visual feedback) */
  onLongPressStart?: () => void;
}

interface LongPressHandlers {
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
  const { delay = 800, enabled = true, onLongPressStart } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const hapticFeedback = useHapticFeedback();

  const start = useCallback(() => {
    if (!enabled) return;

    isLongPressRef.current = false;

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Strong haptic feedback to indicate long press triggered
      hapticFeedback.heavy();
      onLongPressStart?.();
      onLongPress();
    }, delay);
  }, [enabled, delay, onLongPress, onLongPressStart, hapticFeedback]);

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
