// Development cache bypass utility
export function setupDevCacheBypass() {
  if (import.meta.env.DEV) {
    // Add timestamp to all fetch requests in development
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const [url, options] = args;
      
      // Add cache-busting query parameter
      if (typeof url === 'string' && (url.includes('.js') || url.includes('.tsx'))) {
        const separator = url.includes('?') ? '&' : '?';
        args[0] = `${url}${separator}_t=${Date.now()}`;
      }
      
      // Force cache reload
      const modifiedOptions: RequestInit = {
        ...options,
        cache: 'no-store' as RequestCache
      };
      
      return originalFetch(args[0], modifiedOptions);
    };
    
    // Log when running in dev mode
    console.log('🔧 Dev mode: Cache bypassing enabled');
    
    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.innerHTML = '🔧 DEV MODE - NO CACHE';
    indicator.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: orange;
      color: black;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 99999;
      pointer-events: none;
    `;
    document.body.appendChild(indicator);
  }
}

// Enhanced cache clearing function
export async function clearAllCaches() {
  console.log('🔄 ENHANCED: Force clearing all caches and service workers...');
  
  try {
    // 1. Unregister service workers FIRST
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log(`Found ${registrations.length} service workers to unregister`);
      
      for (const registration of registrations) {
        await registration.unregister();
        console.log('✅ Service worker unregistered');
      }
    }

    // 2. Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log(`Found ${cacheNames.length} caches to clear:`, cacheNames);
      
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('✅ All caches cleared');
    }

    // 3. Clear localStorage
    localStorage.clear();
    console.log('✅ LocalStorage cleared');

    // 4. Clear sessionStorage  
    sessionStorage.clear();
    console.log('✅ SessionStorage cleared');

    // 5. Clear IndexedDB
    if (window.indexedDB) {
      try {
        const dbs = await indexedDB.databases();
        console.log(`Found ${dbs.length} IndexedDB databases to clear`);
        
        await Promise.all(
          dbs.map(db => {
            if (db.name) {
              return new Promise((resolve, reject) => {
                console.log(`Deleting IndexedDB: ${db.name}`);
                const deleteReq = indexedDB.deleteDatabase(db.name);
                deleteReq.onsuccess = () => {
                  console.log(`✅ IndexedDB ${db.name} cleared`);
                  resolve(void 0);
                };
                deleteReq.onerror = () => reject(deleteReq.error);
              });
            }
          })
        );
      } catch (error) {
        console.warn('⚠️ Could not clear IndexedDB:', error);
      }
    }

    console.log('🎉 ALL CACHES CLEARED SUCCESSFULLY!');
    return true;
  } catch (error) {
    console.error('❌ Error clearing caches:', error);
    return false;
  }
}

// Keyboard shortcut to force reload
export function setupDevKeyboardShortcuts() {
  if (import.meta.env.DEV) {
    document.addEventListener('keydown', async (e) => {
      // Ctrl/Cmd + Shift + K = Kill cache and reload
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        
        await clearAllCaches();
        
        // Force reload
        window.location.reload();
      }
    });
  }
}