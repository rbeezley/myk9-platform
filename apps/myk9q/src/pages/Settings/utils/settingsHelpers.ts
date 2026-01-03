/**
 * Settings Helper Utilities
 *
 * Pure utility functions extracted from Settings.tsx for better testability
 * and separation of concerns. These functions handle settings import/export,
 * data management, and common settings operations.
 */

import { exportPersonalData, clearAllData, getStorageUsage } from '@/services/dataExportService';
import { logger } from '@/utils/logger';

/**
 * Toast callback type for UI notifications
 */
export type ToastCallback = (message: string, type?: 'success' | 'error' | 'info') => void;

/**
 * Export personal data for the current user
 *
 * @param showToast - Callback to display toast notifications
 * @returns Promise that resolves when export completes
 *
 * @example
 * ```typescript
 * await exportPersonalDataHelper(showToast);
 * ```
 */
export async function exportPersonalDataHelper(showToast: ToastCallback): Promise<void> {
  try {
    const authData = localStorage.getItem('myK9Q_auth');
    const licenseKey = authData ? JSON.parse(authData).licenseKey : undefined;
    await exportPersonalData(licenseKey);
    showToast('Your data has been exported successfully!');
  } catch (error) {
    showToast('Failed to export your data', 'error');
    logger.error('Export data error:', error);
  }
}

/**
 * Clear all user data while optionally preserving auth and settings
 *
 * @param showToast - Callback to display toast notifications
 * @param options - Configuration options for what to keep
 * @param options.keepAuth - Whether to preserve authentication (default: true)
 * @param options.keepSettings - Whether to preserve settings (default: false)
 * @param options.keepFavorites - Whether to preserve favorites (default: false)
 * @returns Promise that resolves with updated storage usage
 *
 * @example
 * ```typescript
 * const usage = await clearAllDataHelper(showToast, { keepAuth: true });
 * ```
 */
export async function clearAllDataHelper(
  showToast: ToastCallback,
  options: {
    keepAuth?: boolean;
    keepSettings?: boolean;
    keepFavorites?: boolean;
  } = {}
): Promise<{ estimated: number; quota: number; percentUsed: number; localStorageSize: number }> {
  const { keepAuth = true, keepSettings = false, keepFavorites = false } = options;

  try {
    await clearAllData({ keepAuth, keepSettings, keepFavorites });
    showToast('All data cleared successfully! You remain logged in.', 'success');

    // Return refreshed storage usage
    const usage = await getStorageUsage();
    return usage;
  } catch (error) {
    showToast('Failed to clear data', 'error');
    logger.error('Clear data error:', error);
    throw error;
  }
}

/**
 * Export settings to a JSON file and trigger browser download
 *
 * @param exportSettings - Function from settings store that serializes settings
 * @param showToast - Callback to display toast notifications
 *
 * @example
 * ```typescript
 * exportSettingsToFile(exportSettings, showToast);
 * ```
 */
export function exportSettingsToFile(
  exportSettings: () => string,
  showToast: ToastCallback
): void {
  try {
    const json = exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myK9Q-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Settings exported successfully!');
  } catch (error) {
    showToast('Failed to export settings', 'error');
    logger.error('Export error:', error);
  }
}

/**
 * Import settings from a file upload event
 *
 * @param file - File object from input element
 * @param importSettings - Function from settings store that deserializes and applies settings
 * @param showToast - Callback to display toast notifications
 * @param fileInputRef - Optional ref to reset file input after import
 * @returns Promise that resolves to true if import succeeded
 *
 * @example
 * ```typescript
 * const success = await importSettingsFromFile(
 *   file,
 *   importSettings,
 *   showToast,
 *   fileInputRef
 * );
 * ```
 */
export async function importSettingsFromFile(
  file: File,
  importSettings: (json: string) => boolean,
  showToast: ToastCallback,
  fileInputRef?: React.RefObject<HTMLInputElement | null>
): Promise<boolean> {
  try {
    const text = await file.text();
    const success = importSettings(text);

    if (success) {
      showToast('Settings imported successfully!');
      // Reset file input
      if (fileInputRef?.current) {
        fileInputRef.current.value = '';
      }
      return true;
    } else {
      showToast('Failed to import settings - invalid file format', 'error');
      return false;
    }
  } catch (error) {
    showToast('Failed to read settings file', 'error');
    logger.error('Import error:', error);
    return false;
  }
}

/**
 * Reset onboarding completion flag and reload the page
 *
 * @param showToast - Callback to display toast notifications
 * @param reloadDelayMs - Delay in milliseconds before auto-reload (default: 1500)
 *
 * @example
 * ```typescript
 * resetOnboarding(showToast); // Reloads after 1500ms
 * resetOnboarding(showToast, 2000); // Reloads after 2000ms
 * ```
 */
export function resetOnboarding(
  showToast: ToastCallback,
  reloadDelayMs: number = 1500
): void {
  localStorage.removeItem('onboarding_completed');
  showToast('Onboarding will show when you refresh or reopen the app', 'info');
  setTimeout(() => {
    window.location.reload();
  }, reloadDelayMs);
}

/**
 * Reload the current page
 *
 * Simple utility wrapper for window.location.reload()
 * Extracted for testability and consistency.
 *
 * @example
 * ```typescript
 * reloadPage();
 * ```
 */
export function reloadPage(): void {
  window.location.reload();
}
