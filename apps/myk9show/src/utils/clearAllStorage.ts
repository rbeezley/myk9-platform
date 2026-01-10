/**
 * Completely clear all storage (localStorage, sessionStorage, IndexedDB)
 * Use this to start completely fresh without any mock data
 */
export async function clearAllStorage(): Promise<void> {
  // Clear localStorage
  try {
    localStorage.clear();
  } catch {
    // Storage clearing failed silently
  }

  // Clear sessionStorage
  try {
    sessionStorage.clear();
  } catch {
    // Storage clearing failed silently
  }

  // Clear IndexedDB
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        await indexedDB.deleteDatabase(db.name);
      }
    }
  } catch {
    // Fallback for browsers that don't support databases()
    try {
      await indexedDB.deleteDatabase('myK9ShowDB');
    } catch {
      // IndexedDB clearing failed silently
    }
  }

  // Force a hard refresh
  window.location.reload();
}

// Make it available globally for easy access from console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).clearAllStorage = clearAllStorage;
}
