/**
 * useSwipeGesture Hook
 *
 * Detects swipe gestures on touch devices.
 * Useful for actions like:
 * - Swipe left to delete
 * - Swipe right to mark complete
 * - Swipe up to expand
 * - Swipe down to dismiss
 *
 * Usage:
 * ```tsx
 * const swipeHandlers = useSwipeGesture({
 *   onSwipeLeft: () => logger.log('Swiped left'),
 *   onSwipeRight: () => logger.log('Swiped right'),
 *   threshold: 50, // minimum swipe distance
 * });
 *
 * <div {...swipeHandlers}>Swipe me</div>
 * ```
 */

import { useRef, useCallback, TouchEvent, MouseEvent } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeGestureOptions {
  /**
   * Called when swipe left is detected
   */
  onSwipeLeft?: () => void;

  /**
   * Called when swipe right is detected
   */
  onSwipeRight?: () => void;

  /**
   * Called when swipe up is detected
   */
  onSwipeUp?: () => void;

  /**
   * Called when swipe down is detected
   */
  onSwipeDown?: () => void;

  /**
   * Called for any swipe direction
   */
  onSwipe?: (direction: SwipeDirection) => void;

  /**
   * Minimum distance (px) to register as swipe
   * Default: 50
   */
  threshold?: number;

  /**
   * Maximum time (ms) for swipe gesture
   * Default: 300
   */
  maxTime?: number;

  /**
   * Prevent default touch behavior
   * Default: false
   */
  preventDefault?: boolean;
}

export function useSwipeGesture(options: SwipeGestureOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onSwipe,
    threshold = 50,
    maxTime = 300,
    preventDefault = false,
  } = options;

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const isSwiping = useRef(false);

  const handleStart = useCallback(
    (x: number, y: number) => {
      touchStart.current = {
        x,
        y,
        time: Date.now(),
      };
      isSwiping.current = false;
    },
    []
  );

  const handleEnd = useCallback(
    (x: number, y: number) => {
      if (!touchStart.current) return;

      const deltaX = x - touchStart.current.x;
      const deltaY = y - touchStart.current.y;
      const deltaTime = Date.now() - touchStart.current.time;

      // Check if gesture is fast enough
      if (deltaTime > maxTime) {
        touchStart.current = null;
        return;
      }

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine if it's a horizontal or vertical swipe
      if (absX > absY) {
        // Horizontal swipe
        if (absX > threshold) {
          isSwiping.current = true;
          const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left';

          if (direction === 'left' && onSwipeLeft) {
            onSwipeLeft();
          } else if (direction === 'right' && onSwipeRight) {
            onSwipeRight();
          }

          if (onSwipe) {
            onSwipe(direction);
          }
        }
      } else {
        // Vertical swipe
        if (absY > threshold) {
          isSwiping.current = true;
          const direction: SwipeDirection = deltaY > 0 ? 'down' : 'up';

          if (direction === 'up' && onSwipeUp) {
            onSwipeUp();
          } else if (direction === 'down' && onSwipeDown) {
            onSwipeDown();
          }

          if (onSwipe) {
            onSwipe(direction);
          }
        }
      }

      touchStart.current = null;
    },
    [threshold, maxTime, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onSwipe]
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    },
    [handleStart, preventDefault]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (preventDefault) {
        e.preventDefault();
      }
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX, touch.clientY);
    },
    [handleEnd, preventDefault]
  );

  // Mouse event handlers (for desktop testing)
  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      handleStart(e.clientX, e.clientY);
    },
    [handleStart]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      handleEnd(e.clientX, e.clientY);
    },
    [handleEnd]
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
  };
}

/**
 * useSwipeToAction Hook
 *
 * Higher-level hook for swipe-to-reveal actions (like iOS Mail)
 * Shows action buttons when swiping left/right
 */
export interface SwipeToActionOptions {
  /**
   * Action to show on left swipe
   */
  leftAction?: {
    label: string;
    color: string;
    onAction: () => void;
  };

  /**
   * Action to show on right swipe
   */
  rightAction?: {
    label: string;
    color: string;
    onAction: () => void;
  };

  /**
   * Threshold for revealing actions (px)
   * Default: 80
   */
  revealThreshold?: number;

  /**
   * Threshold for auto-executing action (px)
   * Default: 200
   */
  actionThreshold?: number;
}

export function useSwipeToAction(options: SwipeToActionOptions = {}) {
  const {
    leftAction,
    rightAction,
    revealThreshold = 80,
    actionThreshold = 200,
  } = options;

  const offset = useRef(0);
  const startX = useRef(0);
  const isDragging = useRef(false);

  const handleDragStart = useCallback((x: number) => {
    startX.current = x;
    isDragging.current = true;
  }, []);

  const handleDragMove = useCallback((x: number) => {
    if (!isDragging.current) return;

    const delta = x - startX.current;

    // Only allow swipe in direction where action exists
    if (delta < 0 && !leftAction) return;
    if (delta > 0 && !rightAction) return;

    offset.current = delta;
    return delta;
  }, [leftAction, rightAction]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging.current) return;

    isDragging.current = false;
    const delta = offset.current;

    // Check if threshold reached
    if (Math.abs(delta) >= actionThreshold) {
      // Execute action
      if (delta < 0 && leftAction) {
        leftAction.onAction();
      } else if (delta > 0 && rightAction) {
        rightAction.onAction();
      }
    }

    // Reset
    offset.current = 0;
    return 0;
  }, [leftAction, rightAction, actionThreshold]);

  const touchStart = useCallback((e: TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  }, [handleDragStart]);

  const touchMove = useCallback((e: TouchEvent) => {
    return handleDragMove(e.touches[0].clientX);
  }, [handleDragMove]);

  const touchEnd = useCallback(() => {
    return handleDragEnd();
  }, [handleDragEnd]);

  const mouseDown = useCallback((e: MouseEvent) => {
    handleDragStart(e.clientX);
  }, [handleDragStart]);

  const mouseMove = useCallback((e: MouseEvent) => {
    return handleDragMove(e.clientX);
  }, [handleDragMove]);

  const mouseUp = useCallback(() => {
    return handleDragEnd();
  }, [handleDragEnd]);

  return {
    handlers: {
      onTouchStart: touchStart,
      onTouchMove: touchMove,
      onTouchEnd: touchEnd,
      onMouseDown: mouseDown,
      onMouseMove: mouseMove,
      onMouseUp: mouseUp,
      onMouseLeave: mouseUp,
    },
    revealThreshold,
    actionThreshold,
  };
}
