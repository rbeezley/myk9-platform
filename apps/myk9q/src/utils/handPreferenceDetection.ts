/**
 * Hand Preference Detection Utility
 *
 * Detects user's hand preference based on touch patterns.
 * Used for one-handed mode optimization.
 */

interface HandPreferenceData {
  leftTouches: number;
  rightTouches: number;
  centerTouches: number;
  totalTouches: number;
}

const TOUCH_HISTORY_KEY = 'myK9Q_hand_preference_data';
const MIN_TOUCHES_FOR_DETECTION = 20; // Minimum touches before making a determination
const SIDE_THRESHOLD = 0.33; // 33% from edge is considered "side" touch

/**
 * Load touch history from localStorage
 */
function loadTouchHistory(): HandPreferenceData {
  try {
    const stored = localStorage.getItem(TOUCH_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (_error) {
    // Silently fail - hand preference is optional enhancement
  }

  return {
    leftTouches: 0,
    rightTouches: 0,
    centerTouches: 0,
    totalTouches: 0,
  };
}

/**
 * Save touch history to localStorage
 */
function saveTouchHistory(data: HandPreferenceData): void {
  try {
    localStorage.setItem(TOUCH_HISTORY_KEY, JSON.stringify(data));
  } catch (_error) {
    // Silently fail - hand preference is optional enhancement
  }
}

/**
 * Record a touch event for hand preference detection
 */
export function recordTouch(event: TouchEvent | MouseEvent): void {
  const data = loadTouchHistory();

  // Get viewport width
  const viewportWidth = window.innerWidth;

  // Get touch/click position
  let x: number;
  if ('touches' in event && event.touches.length > 0) {
    x = event.touches[0].clientX;
  } else if ('clientX' in event) {
    x = event.clientX;
  } else {
    return; // Can't determine position
  }

  // Calculate which zone the touch is in
  const relativeX = x / viewportWidth;

  if (relativeX < SIDE_THRESHOLD) {
    data.leftTouches++;
  } else if (relativeX > (1 - SIDE_THRESHOLD)) {
    data.rightTouches++;
  } else {
    data.centerTouches++;
  }

  data.totalTouches++;

  saveTouchHistory(data);
}

/**
 * Detect hand preference based on touch patterns
 *
 * @returns 'left' | 'right' | 'auto' (auto means not enough data or inconclusive)
 */
export function detectHandPreference(): 'left' | 'right' | 'auto' {
  const data = loadTouchHistory();

  // Not enough data yet
  if (data.totalTouches < MIN_TOUCHES_FOR_DETECTION) {
    return 'auto';
  }

  // Calculate percentages (excluding center touches for preference)
  const sideTouches = data.leftTouches + data.rightTouches;
  if (sideTouches === 0) {
    return 'auto'; // Only center touches
  }

  const leftPercentage = data.leftTouches / sideTouches;
  const rightPercentage = data.rightTouches / sideTouches;

  // Require at least 60% bias to make a determination
  const CONFIDENCE_THRESHOLD = 0.6;

  if (leftPercentage >= CONFIDENCE_THRESHOLD) {
    return 'left';
  } else if (rightPercentage >= CONFIDENCE_THRESHOLD) {
    return 'right';
  }

  return 'auto'; // Inconclusive
}

/**
 * Get current touch statistics (for debugging/settings UI)
 */
export function getTouchStatistics(): HandPreferenceData {
  return loadTouchHistory();
}

/**
 * Reset touch history (useful for testing or user preference reset)
 */
export function resetTouchHistory(): void {
  localStorage.removeItem(TOUCH_HISTORY_KEY);
}

/**
 * Start recording touch events for hand preference detection
 *
 * @returns Cleanup function to stop recording
 */
export function startHandPreferenceDetection(): () => void {
  const handleTouch = (event: TouchEvent) => {
    // Only record touches on interactive elements
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('a')
    ) {
      recordTouch(event);
    }
  };

  const handleClick = (event: MouseEvent) => {
    // Only record on mobile (touch-enabled) devices
    if ('ontouchstart' in window) {
      return; // Touch events will handle this
    }

    // Only record clicks on interactive elements (for desktop testing)
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.closest('button') ||
      target.closest('a')
    ) {
      recordTouch(event);
    }
  };

  // Add event listeners
  document.addEventListener('touchstart', handleTouch, { passive: true });
  document.addEventListener('click', handleClick);

  // Return cleanup function
  return () => {
    document.removeEventListener('touchstart', handleTouch);
    document.removeEventListener('click', handleClick);
  };
}
