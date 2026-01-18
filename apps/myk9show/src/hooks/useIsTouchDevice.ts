import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current device is a touch device.
 *
 * Uses a combination of media query and event-based detection:
 * 1. Initial check via matchMedia('(pointer: coarse)')
 * 2. Refines based on first touchstart or mousemove event
 *
 * @returns boolean - true if touch device, false otherwise
 */
export function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let resolved = false;

    const handleTouchStart = () => {
      if (!resolved) {
        resolved = true;
        setIsTouchDevice(true);
        cleanup();
      }
    };

    const handleMouseMove = () => {
      if (!resolved) {
        resolved = true;
        setIsTouchDevice(false);
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('mousemove', handleMouseMove);
    };

    // Listen for first interaction to refine detection
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return cleanup;
  }, []);

  return isTouchDevice;
}
