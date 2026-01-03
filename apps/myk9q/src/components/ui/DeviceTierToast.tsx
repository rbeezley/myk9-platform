/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Device Tier Toast Notification
 *
 * Shows a brief toast on app load indicating device tier detection.
 */

import { useState, useEffect } from 'react';
import { useDeviceCapabilities } from '@/hooks/usePerformance';
import './shared-ui.css';

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
    <div className={`device-tier-toast ${position} ${isVisible ? 'show' : ''}`}>
      <div className="toast-icon">{getTierIcon(capabilities.tier)}</div>
      <div className="toast-content">
        <div className="toast-title">Optimized for Your Device</div>
        <div className="toast-message">{getTierMessage(capabilities.tier)}</div>
      </div>
      <button
        className="toast-close"
        onClick={() => setIsVisible(false)}
        aria-label="Close"
      >
        ✕
      </button>
    </div>
  );
}
