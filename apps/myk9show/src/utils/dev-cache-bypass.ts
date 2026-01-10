// Development cache bypass utility
export function setupDevCacheBypass(): void {
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

    // Add visual indicator
    const indicator = document.createElement('div');
    indicator.innerHTML = 'DEV MODE - NO CACHE';
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
export async function clearAllCaches(): Promise<boolean> {
  try {
    // 1. Unregister service workers FIRST
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();

      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    // 2. Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // 3. Clear localStorage
    localStorage.clear();

    // 4. Clear sessionStorage
    sessionStorage.clear();

    // 5. Clear IndexedDB
    if (window.indexedDB) {
      try {
        const dbs = await indexedDB.databases();

        await Promise.all(
          dbs.map(db => {
            if (db.name) {
              return new Promise((resolve, reject) => {
                const deleteReq = indexedDB.deleteDatabase(db.name);
                deleteReq.onsuccess = () => resolve(void 0);
                deleteReq.onerror = () => reject(deleteReq.error);
              });
            }
          })
        );
      } catch {
        // IndexedDB clearing failed silently
      }
    }

    return true;
  } catch {
    return false;
  }
}

// Keyboard shortcut to force reload
export function setupDevKeyboardShortcuts(): void {
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
