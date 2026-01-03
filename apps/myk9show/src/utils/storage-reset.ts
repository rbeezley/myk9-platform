/**
 * Emergency storage reset utility
 * Use this to clear all localStorage and IndexedDB when migrations fail
 */

export const clearAllStorage = async (): Promise<void> => {
  try {
    // Clear all localStorage
    localStorage.clear();
    console.log('✅ Cleared localStorage');
    
    // Clear all IndexedDB databases
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(db => {
        if (db.name) {
          return new Promise<void>((resolve) => {
            const deleteReq = indexedDB.deleteDatabase(db.name!);
            deleteReq.onsuccess = () => {
              console.log(`✅ Deleted IndexedDB: ${db.name}`);
              resolve();
            };
            deleteReq.onerror = () => {
              console.log(`❌ Failed to delete IndexedDB: ${db.name}`);
              resolve(); // Continue anyway
            };
          });
        }
        return Promise.resolve();
      })
    );
    
    console.log('🔄 Storage reset complete - please refresh the page');
  } catch (error) {
    console.error('❌ Storage reset failed:', error);
  }
};

// Make available in browser console for emergency use
if (typeof window !== 'undefined') {
  (window as unknown as Window & { clearAllStorage: typeof clearAllStorage }).clearAllStorage = clearAllStorage;
}