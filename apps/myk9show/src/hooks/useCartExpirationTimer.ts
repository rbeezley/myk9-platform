/**
 * Hook for cart expiration timer management
 *
 * Provides countdown display, expiration warnings, and auto-expiration handling.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useCartStore } from '@/stores/cartStore';

export interface CartExpirationState {
  // Time remaining in milliseconds
  timeRemainingMs: number | null;
  // Formatted time string (e.g., "5:30")
  timeRemainingFormatted: string;
  // Whether the cart is expired
  isExpired: boolean;
  // Whether to show warning (< 5 minutes)
  showWarning: boolean;
  // Whether to show urgent warning (< 1 minute)
  showUrgentWarning: boolean;
  // Extend expiration by 30 minutes
  extendExpiration: () => Promise<boolean>;
  // Percentage of time remaining (0-100)
  percentRemaining: number;
}

// Warning thresholds
const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const URGENT_WARNING_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute
const TOTAL_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

// Update interval
const UPDATE_INTERVAL_MS = 1000; // 1 second

/**
 * Hook to manage cart expiration timer
 */
export function useCartExpirationTimer(options?: {
  onExpired?: () => void;
  onWarning?: () => void;
  onUrgentWarning?: () => void;
}): CartExpirationState {
  const expiresAt = useCartStore((state) => state.expiresAt);
  const cart = useCartStore((state) => state.cart);
  const extendExpirationAction = useCartStore((state) => state.extendExpiration);

  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null);
  const [hasTriggeredWarning, setHasTriggeredWarning] = useState(false);
  const [hasTriggeredUrgent, setHasTriggeredUrgent] = useState(false);
  const [hasTriggeredExpired, setHasTriggeredExpired] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate time remaining
  const calculateTimeRemaining = useCallback(() => {
    if (!expiresAt) return null;
    const expiration = new Date(expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, expiration - now);
  }, [expiresAt]);

  // Update timer
  useEffect(() => {
    if (!expiresAt || !cart) {
      setTimeRemainingMs(null);
      return;
    }

    // Initial calculation
    setTimeRemainingMs(calculateTimeRemaining());

    // Set up interval for updates
    intervalRef.current = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeRemainingMs(remaining);

      // Trigger callbacks
      if (remaining !== null) {
        // Warning callback (5 minutes)
        if (remaining <= WARNING_THRESHOLD_MS && remaining > URGENT_WARNING_THRESHOLD_MS && !hasTriggeredWarning) {
          setHasTriggeredWarning(true);
          options?.onWarning?.();
        }

        // Urgent warning callback (1 minute)
        if (remaining <= URGENT_WARNING_THRESHOLD_MS && remaining > 0 && !hasTriggeredUrgent) {
          setHasTriggeredUrgent(true);
          options?.onUrgentWarning?.();
        }

        // Expired callback
        if (remaining <= 0 && !hasTriggeredExpired) {
          setHasTriggeredExpired(true);
          options?.onExpired?.();
        }
      }
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [expiresAt, cart, calculateTimeRemaining, hasTriggeredWarning, hasTriggeredUrgent, hasTriggeredExpired, options]);

  // Reset triggers when expiration changes (e.g., after extension)
  useEffect(() => {
    const remaining = calculateTimeRemaining();
    if (remaining !== null && remaining > WARNING_THRESHOLD_MS) {
      setHasTriggeredWarning(false);
      setHasTriggeredUrgent(false);
      setHasTriggeredExpired(false);
    }
  }, [expiresAt, calculateTimeRemaining]);

  // Format time remaining
  const formatTimeRemaining = (ms: number | null): string => {
    if (ms === null) return '--:--';
    if (ms <= 0) return '0:00';

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Extend expiration
  const extendExpiration = useCallback(async () => {
    const success = await extendExpirationAction();
    if (success) {
      // Reset triggers
      setHasTriggeredWarning(false);
      setHasTriggeredUrgent(false);
      setHasTriggeredExpired(false);
    }
    return success;
  }, [extendExpirationAction]);

  // Calculate percentage remaining
  const percentRemaining =
    timeRemainingMs !== null
      ? Math.min(100, Math.max(0, (timeRemainingMs / TOTAL_EXPIRATION_MS) * 100))
      : 100;

  return {
    timeRemainingMs,
    timeRemainingFormatted: formatTimeRemaining(timeRemainingMs),
    isExpired: timeRemainingMs !== null && timeRemainingMs <= 0,
    showWarning: timeRemainingMs !== null && timeRemainingMs <= WARNING_THRESHOLD_MS && timeRemainingMs > 0,
    showUrgentWarning: timeRemainingMs !== null && timeRemainingMs <= URGENT_WARNING_THRESHOLD_MS && timeRemainingMs > 0,
    extendExpiration,
    percentRemaining,
  };
}
