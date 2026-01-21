/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Device Tier Toast Notification
 *
 * Shows a brief toast on app load indicating device tier detection.
 */

import { useState, useEffect } from 'react';
import { useDeviceCapabilities } from '@/hooks/usePerformance';
import { cn } from '../../lib/utils';

export interface DeviceTierToastProps {
  /** Duration to show toast (ms) */
  duration?: number;

  /** Position of toast */
  position?: 'top' | 'bottom';

  /** Delay before showing (ms) */
  delay?: number;
}

export function DeviceTierToast({
  duration = 3000,
  position = 'bottom',
  delay = 1000,
}: DeviceTierToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasShown, setHasShown] = useState(false);
  const capabilities = useDeviceCapabilities();

  useEffect(() => {
    if (!capabilities || hasShown) return;

    // Check if we've already shown this session
    const shownKey = 'myK9Q_tier_toast_shown';
    const hasShownThisSession = sessionStorage.getItem(shownKey);

       
    if (hasShownThisSession) {
      setHasShown(true);
      return;
    }

    // Show toast after delay
    const showTimer = setTimeout(() => {
      setIsVisible(true);
      setHasShown(true);
      sessionStorage.setItem(shownKey, 'true');

      // Hide toast after duration
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, duration);

      return () => clearTimeout(hideTimer);
    }, delay);

    return () => clearTimeout(showTimer);
  }, [capabilities, duration, delay, hasShown]);

  if (!capabilities || !isVisible) {
    return null;
  }

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'high':
        return '🚀';
      case 'medium':
        return '⚡';
      case 'low':
        return '🔋';
      default:
        return '📱';
    }
  };

  const getTierMessage = (tier: string) => {
    switch (tier) {
      case 'high':
        return 'High-performance mode enabled';
      case 'medium':
        return 'Balanced mode for your device';
      case 'low':
        return 'Power-saving mode for best battery life';
      default:
        return 'Optimized for your device';
    }
  };

  return (
    <div
      className={cn(
        'fixed left-4 right-4 z-[1000]',
        'flex items-center gap-3',
        'px-4 py-3 rounded-lg',
        'bg-[var(--card)] border border-[var(--border)]',
        'shadow-lg',
        'transition-all duration-300',
        position === 'top' ? 'top-4' : 'bottom-4',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      )}
    >
      <div className="text-2xl flex-shrink-0">{getTierIcon(capabilities.tier)}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[var(--foreground)]">
          Optimized for Your Device
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {getTierMessage(capabilities.tier)}
        </div>
      </div>
      <button
        className={cn(
          'p-1.5 rounded-full',
          'text-[var(--muted-foreground)]',
          'hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
          'transition-colors duration-200',
          'flex-shrink-0'
        )}
        onClick={() => setIsVisible(false)}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
