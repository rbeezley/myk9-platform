// Debug utilities for troubleshooting data issues
import { useDogStore } from '../store/dogStore';
import { useEntryStore } from '../store/entryStore';

/**
 * Clear all app localStorage and reload mock data
 * This can be called from browser console: window.clearAppStorage()
 */
export function clearAppStorage() {
  // Reset Data Only - preserve templates and UI preferences
  const dataKeys = [
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
    'armband-storage'
  ];
  
  dataKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`🗑️ Cleared ${key}`);
  });
  
  console.log('🔄 Reloading page to reinitialize stores with mock data...');
  window.location.reload();
}

/**
 * Reset all mock data and localStorage - data only (preserves templates & UI)
 */
export function resetAllMockData() {
  console.log('🧹 Starting data reset (preserving templates & UI preferences)...');
  clearAppStorage();
}

/**
 * Nuclear option - reset absolutely everything including templates and UI state
 */
export async function resetEverything() {
  console.log('💥 Nuclear reset - clearing ALL localStorage AND IndexedDB...');
  
  const allKeys = [
    // Data stores
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
    // Templates & configuration
    'template-storage',
    'class-template-storage',
    'show-template-storage',
    // UI state
    'club-store-v2',
    'navigation-store',
    'myk9show-people-sidebar-storage',
    'myk9show-dog-sidebar-storage'
  ];
  
  // Clear localStorage
  allKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`💥 Cleared localStorage: ${key}`);
  });
  
  // Clear IndexedDB
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        await indexedDB.deleteDatabase(db.name);
        console.log(`💥 Deleted IndexedDB: ${db.name}`);
      }
    }
  } catch (error) {
    console.warn('Could not clear IndexedDB (may not be supported in this browser):', error);
    // Fallback: try to delete known database names
    try {
      await indexedDB.deleteDatabase('myK9ShowDB');
      console.log('💥 Deleted IndexedDB: myK9ShowDB');
    } catch (e) {
      console.warn('Could not delete myK9ShowDB:', e);
    }
  }
  
  console.log('🔄 Reloading page to reinitialize everything...');
  window.location.reload();
}

/**
 * Reset specific store data
 */
export function resetSpecificStore(storeName: string) {
  const storeKeys: Record<string, string[]> = {
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
    health: ['myk9show-dogs-storage'], // Health records are stored within dog data
    // Templates & UI (separate category)
    templates: ['template-storage'],
    classTemplates: ['class-template-storage'],
    showTemplates: ['show-template-storage'],
    clubSelection: ['club-store-v2'],
    navigation: ['navigation-store'],
    peopleSidebar: ['myk9show-people-sidebar-storage'],
    dogSidebar: ['myk9show-dog-sidebar-storage']
  };

  const keys = storeKeys[storeName];
  if (keys) {
    keys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ Reset ${storeName} store (${key})`);
    });
    
    // Call store reset functions if available
    try {
      switch (storeName) {
        case 'dogs':
          // Call dog store reset directly
          useDogStore.getState().resetStore();
          break;
        case 'entries':
          // Call entry store clear directly
          useEntryStore.getState().clearAllEntries();
          break;
        case 'people':
          // Users store doesn't have resetStore, localStorage clear is sufficient
          console.log('✅ Users store reset via localStorage clear');
          break;
        case 'clubs':
          // Club store doesn't have resetStore, localStorage clear is sufficient
          console.log('✅ Club store reset via localStorage clear');
          break;
        // Add other stores as we implement their reset functions
      }
    } catch (error) {
      console.warn(`⚠️ Could not call ${storeName} store reset function:`, error);
    }
    
    console.log(`✅ ${storeName} store reset complete`);
  } else {
    console.error(`❌ Unknown store: ${storeName}. Available stores:`, Object.keys(storeKeys));
  }
}

/**
 * List all localStorage keys that match our patterns
 */
export function listAllAppKeys() {
  const appKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('myk9show') || 
      key.includes('store') || 
      key.includes('storage') ||
      key.includes('template') ||
      key.includes('entry') ||
      key.includes('armband') ||
      key.includes('navigation') ||
      key.includes('club')
    )) {
      appKeys.push(key);
    }
  }
  console.log('📋 Found app-related localStorage keys:', appKeys);
  return appKeys;
}

/**
 * Debug localStorage contents
 */
export function debugLocalStorage() {
  const keys = [
    // Data stores
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
    // Templates & configuration
    'template-storage',
    'class-template-storage',
    'show-template-storage',
    // UI state
    'club-store-v2',
    'navigation-store',
    'myk9show-people-sidebar-storage',
    'myk9show-dog-sidebar-storage'
  ];
  
  console.log('🔍 Debugging localStorage contents:');
  keys.forEach(key => {
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        console.log(`📋 ${key}:`, parsed);
      } catch {
        console.log(`❌ ${key}: Invalid JSON`, data);
      }
    } else {
      console.log(`❌ ${key}: Not found`);
    }
  });
}

// Make functions available globally for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).clearAppStorage = clearAppStorage;
  (window as unknown as Record<string, unknown>).resetAllMockData = resetAllMockData;
  (window as unknown as Record<string, unknown>).resetEverything = resetEverything;
  (window as unknown as Record<string, unknown>).resetSpecificStore = resetSpecificStore;
  (window as unknown as Record<string, unknown>).debugLocalStorage = debugLocalStorage;
  (window as unknown as Record<string, unknown>).listAllAppKeys = listAllAppKeys;
}