/**
 * Pull to Refresh Component
 *
 * Native iOS/Android style pull-to-refresh interaction.
 * Works on both touch and desktop (drag).
 */

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { logger } from '@/utils/logger';
import './shared-ui.css';

export interface PullToRefreshProps {
  /** Content to wrap */
  children: ReactNode;

  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;

  /** Distance to pull before triggering (px) */
  threshold?: number;

  /** Maximum pull distance (px) */
  maxPullDistance?: number;

  /** Enable pull-to-refresh */
  enabled?: boolean;

  /** Custom refresh indicator */
  renderIndicator?: (state: PullState) => ReactNode;

  /** Container className */
  className?: string;
}

export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'complete';

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  maxPullDistance = 120,
  enabled = true,
  renderIndicator,
  className = '',
}: PullToRefreshProps) {
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isPullingRef = useRef(false);

  // Store references to attached listeners for proper cleanup
  // This fixes the bug where removeEventListener fails because callback references change
  const listenersRef = useRef<{
    touchStart: ((e: TouchEvent) => void) | null;
    touchMove: ((e: TouchEvent) => void) | null;
    touchEnd: (() => void) | null;
  }>({ touchStart: null, touchMove: null, touchEnd: null });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // CRITICAL: Only start if EXACTLY at top of scroll (scrollTop === 0)
    // Using strict equality to avoid any edge cases
    if (container.scrollTop !== 0) return;

    startYRef.current = e.touches[0].pageY;
    currentYRef.current = startYRef.current;
    // Don't set isPullingRef yet - wait for touchmove to confirm downward pull
    // This prevents interference when user touches at top but then scrolls normally
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container) return;

    // If not pulling yet, check if we should start
    if (!isPullingRef.current) {
      // Only consider starting PTR if still at top AND startY was recorded
      if (container.scrollTop !== 0 || startYRef.current === 0) return;

      currentYRef.current = e.touches[0].pageY;
      const deltaY = currentYRef.current - startYRef.current;

      // Require minimum downward pull before activating PTR
      // Increased to 40px to prevent accidental activation during normal scrolling
      const activationThreshold = 40;
      if (deltaY < activationThreshold) {
        // Not pulled down enough yet - allow normal behavior
        return;
      }

      // User is pulling down from top - activate PTR
      isPullingRef.current = true;
      setPullState('pulling');
    }

    // CRITICAL: Only allow PTR if we're still at the very top
    // If user has scrolled at all, immediately cancel PTR
    if (container.scrollTop !== 0) {
      isPullingRef.current = false;
      setPullState('idle');
      setPullDistance(0);
      startYRef.current = 0; // Reset start position
      return;
    }

    currentYRef.current = e.touches[0].pageY;
    const deltaY = currentYRef.current - startYRef.current;

    // Only pull down (positive deltaY)
    if (deltaY <= 0) {
      isPullingRef.current = false;
      setPullState('idle');
      setPullDistance(0);
      startYRef.current = 0;
      return;
    }

    // Require minimum pull distance before activating PTR
    // This prevents accidental activation during normal scrolling
    const activationThreshold = 20; // User must pull 20px before PTR engages
    if (deltaY < activationThreshold) {
      // Allow normal scroll - don't interfere
      return;
    }

    // Prevent default scroll when pulling (only after activation threshold)
    e.preventDefault();

    // Apply resistance (harder to pull as you go further)
    // Subtract activation threshold so progress starts from 0 after threshold
    const resistance = 0.5;
    const distance = Math.min((deltaY - activationThreshold) * resistance, maxPullDistance);

    setPullDistance(distance);

    // Update state based on distance
    if (distance >= threshold) {
      setPullState('ready');
    } else {
      setPullState('pulling');
    }
  }, [enabled, threshold, maxPullDistance, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || isRefreshing) return;

    const wasPulling = isPullingRef.current;
    isPullingRef.current = false;
    startYRef.current = 0; // Reset start position

    if (!wasPulling) return;

    if (pullState === 'ready') {
      // Trigger refresh
      setPullState('refreshing');
      setPullDistance(threshold); // Lock at threshold
      setIsRefreshing(true);

      try {
        await onRefresh();
        setPullState('complete');

        // Show complete state briefly
        setTimeout(() => {
          setPullState('idle');
          setPullDistance(0);
          setIsRefreshing(false);
        }, 500);
      } catch (error) {
        logger.error('[PullToRefresh] Refresh failed:', error);
        setPullState('idle');
        setPullDistance(0);
        setIsRefreshing(false);
      }
    } else {
      // Snap back
      setPullState('idle');
      setPullDistance(0);
    }
  }, [enabled, pullState, threshold, onRefresh, isRefreshing]);

  // Mouse events for desktop testing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;

    startYRef.current = e.pageY;
    currentYRef.current = startYRef.current;
    isPullingRef.current = true;
    setPullState('pulling');
  }, [enabled, isRefreshing]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled || !isPullingRef.current || isRefreshing) return;

    currentYRef.current = e.pageY;
    const deltaY = currentYRef.current - startYRef.current;

    if (deltaY <= 0) {
      setPullState('idle');
      setPullDistance(0);
      return;
    }

    // Same activation threshold for desktop consistency
    const activationThreshold = 20;
    if (deltaY < activationThreshold) {
      return;
    }

    const resistance = 0.5;
    const distance = Math.min((deltaY - activationThreshold) * resistance, maxPullDistance);

    setPullDistance(distance);

    if (distance >= threshold) {
      setPullState('ready');
    } else {
      setPullState('pulling');
    }
  }, [enabled, threshold, maxPullDistance, isRefreshing]);

  const handleMouseUp = useCallback(async () => {
    if (!enabled || !isPullingRef.current || isRefreshing) return;

    isPullingRef.current = false;

    if (pullState === 'ready') {
      setPullState('refreshing');
      setPullDistance(threshold);
      setIsRefreshing(true);

      try {
        await onRefresh();
        setPullState('complete');

        setTimeout(() => {
          setPullState('idle');
          setPullDistance(0);
          setIsRefreshing(false);
        }, 500);
      } catch (error) {
        logger.error('[PullToRefresh] Refresh failed:', error);
        setPullState('idle');
        setPullDistance(0);
        setIsRefreshing(false);
      }
    } else {
      setPullState('idle');
      setPullDistance(0);
    }
  }, [enabled, pullState, threshold, onRefresh, isRefreshing]);

  // Set up touch event listeners
  // Uses refs to track actual attached listeners for reliable cleanup
  // IMPORTANT: removeEventListener must use the same options as addEventListener on mobile browsers
  useEffect(() => {
    const container = containerRef.current;

    // Always clean up any existing listeners first (using stored refs)
    // This ensures old listeners are removed even when callback refs change
    // CRITICAL: Must pass same options to removeEventListener as addEventListener
    if (listenersRef.current.touchStart) {
      container?.removeEventListener('touchstart', listenersRef.current.touchStart, { passive: false } as EventListenerOptions);
      container?.removeEventListener('touchmove', listenersRef.current.touchMove!, { passive: false } as EventListenerOptions);
      container?.removeEventListener('touchend', listenersRef.current.touchEnd!, { passive: true } as EventListenerOptions);
      listenersRef.current = { touchStart: null, touchMove: null, touchEnd: null };
    }

    // If disabled or no container, don't add new listeners
    if (!container || !enabled) return;

    // Store references to the exact functions we're attaching
    listenersRef.current = {
      touchStart: handleTouchStart,
      touchMove: handleTouchMove,
      touchEnd: handleTouchEnd,
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      // Cleanup uses the stored refs to ensure we remove the correct functions
      // CRITICAL: Must pass same options to removeEventListener as addEventListener
      if (listenersRef.current.touchStart) {
        container.removeEventListener('touchstart', listenersRef.current.touchStart, { passive: false } as EventListenerOptions);
        container.removeEventListener('touchmove', listenersRef.current.touchMove!, { passive: false } as EventListenerOptions);
        container.removeEventListener('touchend', listenersRef.current.touchEnd!, { passive: true } as EventListenerOptions);
        listenersRef.current = { touchStart: null, touchMove: null, touchEnd: null };
      }
    };
  }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={containerRef}
      className={`pull-to-refresh ${className} ${!enabled ? 'ptr-disabled' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className={`pull-to-refresh-indicator ${pullState}`}
        style={{
          transform: `translateY(${pullDistance}px)`,
          opacity: pullDistance > 0 ? 1 : 0,
        }}
      >
        {renderIndicator ? (
          renderIndicator(pullState)
        ) : (
          <DefaultRefreshIndicator state={pullState} distance={pullDistance} threshold={threshold} />
        )}
      </div>

      <div
        className="pull-to-refresh-content"
        style={{
          transform: `translateY(${pullDistance}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Default refresh indicator
 */
function DefaultRefreshIndicator({
  state,
  distance,
  threshold,
}: {
  state: PullState;
  distance: number;
  threshold: number;
}) {
  const progress = Math.min(distance / threshold, 1);
  const rotation = progress * 360;

  return (
    <div className="default-refresh-indicator">
      {state === 'refreshing' ? (
        <div className="spinner" />
      ) : state === 'complete' ? (
        <svg className="checkmark" viewBox="0 0 24 24">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="arrow"
          viewBox="0 0 24 24"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5v14M5 12l7 7 7-7"
          />
        </svg>
      )}

      <div className="refresh-text">
        {state === 'pulling' && 'Pull to refresh'}
        {state === 'ready' && 'Release to refresh'}
        {state === 'refreshing' && 'Refreshing...'}
        {state === 'complete' && 'Complete!'}
      </div>
    </div>
  );
}
