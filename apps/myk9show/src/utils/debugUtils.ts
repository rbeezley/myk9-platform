// Development utilities for resetting data
// Used by ResetDataButton component (dev-only)

import { useDogStore } from '../store/dogStore';
import { useEntryStore } from '../store/entryStore';
import { logger } from './logger';

const DATA_KEYS = [
  'myk9show-dogs-storage',
  'myk9show-user-storage',
  'myk9show-shows-storage',
  'myk9show-registrations-storage',
  'myk9show-trials-storage',
  'myk9show-classes-storage',
  'entry-store',
  'show-registration-storage',
  'myk9show-competitions-storage',
  'myk9show-past-results-storage',
  'myk9show-achievements-storage',
  'armband-storage',
];

const ALL_KEYS = [
  ...DATA_KEYS,
  'template-storage',
  'class-template-storage',
  'show-template-storage',
  'club-store-v2',
  'navigation-store',
  'myk9show-people-sidebar-storage',
  'myk9show-dog-sidebar-storage',
];

/**
 * Clear app data and reload (preserves templates & UI preferences)
 */
export function clearAppStorage(): void {
  DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  logger.log('Cleared app data, reloading...');
  window.location.reload();
}

/**
 * Reset all mock data (preserves templates & UI)
 */
export function resetAllMockData(): void {
  clearAppStorage();
}

/**
 * Nuclear option - reset everything including templates and UI
 */
export async function resetEverything(): Promise<void> {
  ALL_KEYS.forEach((key) => localStorage.removeItem(key));

  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        await indexedDB.deleteDatabase(db.name);
      }
    }
  } catch {
    // Fallback for browsers without indexedDB.databases()
    try {
      await indexedDB.deleteDatabase('myK9ShowDB');
    } catch {
      // Ignore if database doesn't exist
    }
  }

  logger.log('Reset everything, reloading...');
  window.location.reload();
}

const STORE_KEYS: Record<string, string[]> = {
  dogs: ['myk9show-dogs-storage'],
  people: ['myk9show-user-storage'],
  shows: ['myk9show-shows-storage'],
  registrations: ['myk9show-registrations-storage'],
  trials: ['myk9show-trials-storage'],
  classes: ['myk9show-classes-storage'],
  entries: ['entry-store'],
  competitions: ['myk9show-competitions-storage'],
  pastResults: ['myk9show-past-results-storage'],
  achievements: ['myk9show-achievements-storage'],
  armbands: ['armband-storage'],
  showRegistration: ['show-registration-storage'],
  clubs: ['club-store-v2'],
  health: ['myk9show-dogs-storage'],
  templates: ['template-storage'],
  classTemplates: ['class-template-storage'],
  showTemplates: ['show-template-storage'],
  clubSelection: ['club-store-v2'],
  navigation: ['navigation-store'],
  peopleSidebar: ['myk9show-people-sidebar-storage'],
  dogSidebar: ['myk9show-dog-sidebar-storage'],
};

/**
 * Reset a specific store's data
 */
export function resetSpecificStore(storeName: string): void {
  const keys = STORE_KEYS[storeName];
  if (!keys) {
    logger.error(`Unknown store: ${storeName}`);
    return;
  }

  keys.forEach((key) => localStorage.removeItem(key));

  // Call store reset functions if available
  try {
    if (storeName === 'dogs') {
      useDogStore.getState().resetStore();
    } else if (storeName === 'entries') {
      useEntryStore.getState().clearAllEntries();
    }
  } catch {
    // Store reset not available
  }

  logger.log(`Reset ${storeName} store`);
}
