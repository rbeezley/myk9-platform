const SPLASH_STORAGE_KEY = 'myK9Q-splash-dismissed';

/**
 * Utility to reset splash screen (for testing or settings)
 * Call this to show the splash again on next visit
 */
export function resetSplashScreen(): void {
  localStorage.removeItem(SPLASH_STORAGE_KEY);
}

/**
 * Check if splash has been dismissed
 */
export function isSplashDismissed(): boolean {
  return localStorage.getItem(SPLASH_STORAGE_KEY) === 'true';
}

export { SPLASH_STORAGE_KEY };
