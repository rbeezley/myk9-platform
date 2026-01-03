import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user is on a touch device.
 *
 * Uses a combination of:
 * 1. Initial check via matchMedia for coarse pointer (touch screens)
 * 2. Event-based detection that updates on first touch/mouse event
 *
 * This allows us to show appropriate UI:
 * - Touch devices: Bottom sheets, larger tap targets
 * - Mouse devices: Hover popovers, smaller click targets
 */
export function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    // Initial detection using media query
    if (typeof window === 'undefined') return false;

    // Check for coarse pointer (touch screens)
    // This is more reliable than checking for touch events
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    // Refine detection based on actual user interaction
    let hasInteracted = false;

    const handleTouchStart = () => {
      if (!hasInteracted) {
        hasInteracted = true;
        setIsTouchDevice(true);
      }
    };

    const handleMouseMove = () => {
      // If we see mouse movement before touch, likely a desktop device
      // Note: Some touch devices also fire mouse events, but we check touch first
      if (!hasInteracted) {
        hasInteracted = true;
        setIsTouchDevice(false);
      }
    };

    // Listen for first interaction to refine detection
    window.addEventListener('touchstart', handleTouchStart, { passive: true, once: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return isTouchDevice;
}

export default useIsTouchDevice;
