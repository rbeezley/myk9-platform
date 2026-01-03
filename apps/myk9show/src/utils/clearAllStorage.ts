/**
 * Completely clear all storage (localStorage, sessionStorage, IndexedDB)
 * Use this to start completely fresh without any mock data
 */
export async function clearAllStorage() {
  console.log('🧹 Clearing all storage...');
  
  // Clear localStorage
  try {
    localStorage.clear();
    console.log('✅ localStorage cleared');
  } catch (e: unknown) {
    console.error('❌ Error clearing localStorage:', e);
  }
  
  // Clear sessionStorage
  try {
    sessionStorage.clear();
    console.log('✅ sessionStorage cleared');
  } catch (e: unknown) {
    console.error('❌ Error clearing sessionStorage:', e);
  }
  
  // Clear IndexedDB
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        await indexedDB.deleteDatabase(db.name);
        console.log(`✅ Deleted IndexedDB: ${db.name}`);
      }
    }
  } catch (e: unknown) {
    void e; // Suppress unused variable warning
    // Fallback for browsers that don't support databases()
    try {
      await indexedDB.deleteDatabase('myK9ShowDB');
      console.log('✅ Deleted myK9ShowDB');
    } catch (err: unknown) {
      console.error('❌ Error clearing IndexedDB:', err);
    }
  }
  
  console.log('🎉 All storage cleared! Refreshing page...');
  
  // Force a hard refresh
  window.location.reload();
}

// Make it available globally for easy access from console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).clearAllStorage = clearAllStorage;
}