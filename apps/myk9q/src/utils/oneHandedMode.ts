/**
 * One-Handed Mode Utility
 *
 * Optimizes the UI for one-handed operation by:
 * - Moving important controls to bottom of screen (thumb zone)
 * - Adding floating action button (FAB) for quick access
 * - Reachability mode (pull down to access top items)
 * - Hand preference (left/right handed)
 *
 * This is especially useful for judges juggling a dog at a show!
 */

import { logger } from '@/utils/logger';

export type HandPreference = 'left' | 'right' | 'auto';

export interface OneHandedModeSettings {
  /**
   * Whether one-handed mode is enabled
   */
  enabled: boolean;

  /**
   * Hand preference for layout optimization
   */
  handPreference: HandPreference;

  /**
   * Whether to show floating action button
   */
  showFAB: boolean;

  /**
   * Whether to enable reachability (pull down to access top)
   */
  enableReachability: boolean;
}

const STORAGE_KEY = 'myK9Q_oneHandedMode';
const DEFAULT_SETTINGS: OneHandedModeSettings = {
  enabled: false,
  handPreference: 'auto',
  showFAB: true,
  enableReachability: true,
};

/**
 * Get one-handed mode settings from localStorage
 */
export function getOneHandedModeSettings(): OneHandedModeSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    logger.error('Failed to load one-handed mode settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save one-handed mode settings to localStorage
 */
export function saveOneHandedModeSettings(settings: OneHandedModeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyOneHandedModeClasses(settings);
  } catch (error) {
    logger.error('Failed to save one-handed mode settings:', error);
  }
}

/**
 * Toggle one-handed mode on/off
 */
export function toggleOneHandedMode(): OneHandedModeSettings {
  const current = getOneHandedModeSettings();
  const updated = { ...current, enabled: !current.enabled };
  saveOneHandedModeSettings(updated);
  return updated;
}

/**
 * Set hand preference
 */
export function setHandPreference(preference: HandPreference): OneHandedModeSettings {
  const current = getOneHandedModeSettings();
  const updated = { ...current, handPreference: preference };
  saveOneHandedModeSettings(updated);
  return updated;
}

/**
 * Apply CSS classes to body based on settings
 */
export function applyOneHandedModeClasses(settings: OneHandedModeSettings): void {
  const body = document.body;

  // One-handed mode class
  if (settings.enabled) {
    body.classList.add('one-handed-mode');
  } else {
    body.classList.remove('one-handed-mode');
  }

  // Hand preference classes
  body.classList.remove('hand-left', 'hand-right', 'hand-auto');
  body.classList.add(`hand-${settings.handPreference}`);

  // Reachability class
  if (settings.enableReachability) {
    body.classList.add('reachability-enabled');
  } else {
    body.classList.remove('reachability-enabled');
  }

  // FAB class
  if (settings.showFAB) {
    body.classList.add('fab-enabled');
  } else {
    body.classList.remove('fab-enabled');
  }
}

/**
 * Initialize one-handed mode on app startup
 */
export function initOneHandedMode(): OneHandedModeSettings {
  const settings = getOneHandedModeSettings();
  applyOneHandedModeClasses(settings);
  return settings;
}

/**
 * Calculate thumb zone boundaries
 * Returns percentage of screen height that is easily reachable
 */
export function getThumbZone(handPreference: HandPreference = 'auto'): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  // Based on research: thumb can comfortably reach bottom 60% of screen
  // and horizontal 75% (depending on hand)

  const screenHeight = window.innerHeight;
  const screenWidth = window.innerWidth;

  const reachableHeight = screenHeight * 0.6; // Bottom 60%
  const reachableWidth = screenWidth * 0.75; // 75% of width

  if (handPreference === 'left') {
    return {
      top: screenHeight - reachableHeight,
      bottom: screenHeight,
      left: 0,
      right: reachableWidth,
    };
  } else if (handPreference === 'right') {
    return {
      top: screenHeight - reachableHeight,
      bottom: screenHeight,
      left: screenWidth - reachableWidth,
      right: screenWidth,
    };
  } else {
    // Auto: center the reachable area
    const leftMargin = (screenWidth - reachableWidth) / 2;
    return {
      top: screenHeight - reachableHeight,
      bottom: screenHeight,
      left: leftMargin,
      right: screenWidth - leftMargin,
    };
  }
}

/**
 * Check if a point is in the thumb zone
 */
export function isInThumbZone(
  x: number,
  y: number,
  handPreference: HandPreference = 'auto'
): boolean {
  const zone = getThumbZone(handPreference);
  return (
    y >= zone.top &&
    y <= zone.bottom &&
    x >= zone.left &&
    x <= zone.right
  );
}

/**
 * Calculate reachability offset
 * When reachability is triggered, entire screen shifts down
 */
export function getReachabilityOffset(): number {
  // Shift screen down by 50% to make top accessible
  const screenHeight = window.innerHeight;
  return screenHeight * 0.5;
}

/**
 * Detect hand preference from usage patterns
 * Returns 'auto' - advanced ML-based detection was considered but deemed
 * too complex for the benefit. Users can manually set their preference.
 */
export function detectHandPreference(): HandPreference {
  return 'auto';
}
