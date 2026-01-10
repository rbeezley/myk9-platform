/**
 * Emergency storage reset utility
 * Use this to clear all localStorage and IndexedDB when migrations fail
 */

export const clearAllStorage = async (): Promise<void> => {
  try {
    // Clear all localStorage
    localStorage.clear();

    // Clear all IndexedDB databases
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(db => {
        if (db.name) {
          return new Promise<void>((resolve) => {
            const deleteReq = indexedDB.deleteDatabase(db.name!);
            deleteReq.onsuccess = () => resolve();
            deleteReq.onerror = () => resolve(); // Continue anyway
          });
        }
        return Promise.resolve();
      })
    );
  } catch {
    // Storage reset failed silently
  }
};

// Make available in browser console for emergency use
if (typeof window !== 'undefined') {
  (window as unknown as Window & { clearAllStorage: typeof clearAllStorage }).clearAllStorage = clearAllStorage;
}
