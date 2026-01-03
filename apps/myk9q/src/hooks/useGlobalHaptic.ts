/**
 * Global Haptic Feedback Hook
 *
 * Provides haptic feedback for MEANINGFUL interactions only.
 * Haptic should confirm something important happened, not acknowledge every touch.
 *
 * Triggers on:
 * - Submit/save actions (forms, primary buttons)
 * - Destructive actions (delete, reset)
 * - Toggle state changes
 * - FAB buttons
 *
 * Does NOT trigger on:
 * - Navigation (card taps, links)
 * - Secondary buttons
 * - Tabs, filters
 *
 * Components can opt-in with "haptic" class or opt-out with "no-haptic" class.
 */

import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Trigger vibration
 */
function vibrate(duration: number | number[]): void {
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(duration);
    } catch {
      // Silent fail - haptic is enhancement only
    }
  }
}

/**
 * Hook that sets up selective haptic feedback for meaningful interactions
 */
export function useGlobalHaptic(): void {
  const hapticEnabled = useSettingsStore((state) => state.settings.hapticFeedback);

  useEffect(() => {
    if (!hapticEnabled) {
      return;
    }

    if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Find the closest interactive element
      const element = target.closest('button, [role="button"], input[type="checkbox"], .settings-toggle, .haptic');

      if (!element) {
        return;
      }

      // Opt-out check
      if (element.classList.contains('no-haptic')) {
        return;
      }

      // Skip disabled elements
      if ((element as HTMLButtonElement).disabled) {
        return;
      }

      // Check if this is a meaningful action that deserves haptic feedback
      const isSubmit = element.getAttribute('type') === 'submit';
      const isPrimary = element.classList.contains('btn-primary') || element.classList.contains('btn-gradient');
      const isDestructive = element.classList.contains('btn-destructive') ||
                           element.classList.contains('delete-button') ||
                           element.classList.contains('reset-button');
      const isToggle = element.classList.contains('settings-toggle') ||
                       element.matches('input[type="checkbox"]');
      const isFAB = element.classList.contains('floating-action-button');
      const isExplicitHaptic = element.classList.contains('haptic');

      // Only vibrate for meaningful actions
      if (isSubmit || isPrimary || isDestructive || isToggle || isFAB || isExplicitHaptic) {
        // Destructive actions get stronger feedback
        if (isDestructive) {
          vibrate(100);
        }
        // Primary/submit actions get medium feedback
        else if (isSubmit || isPrimary || isFAB) {
          vibrate(75);
        }
        // Toggles get light feedback
        else {
          vibrate(50);
        }
      }
    };

    document.addEventListener('click', handleClick, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [hapticEnabled]);
}
