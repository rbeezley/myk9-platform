/**
 * myK9Q Database Recovery Script
 *
 * If you're experiencing issues with data not loading, run this script in your browser console:
 *
 * 1. Open Chrome DevTools (F12 or Right-click → Inspect)
 * 2. Go to the Console tab
 * 3. Copy and paste this entire script
 * 4. Press Enter to run it
 *
 * The script will automatically detect and fix database corruption issues.
 */

(async function() {
  console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
  console.log('%c🔧 myK9Q DATABASE RECOVERY TOOL', 'color: #3b82f6; font-weight: bold; font-size: 16px');
  console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
  console.log('');

  const DB_NAMES = [
    'myK9Q_Replication',
    'myK9Q_OfflineCache',
    'myK9Q_Mutations',
    'myK9Q_entries',
    'myK9Q_classes',
    'myK9Q_trials',
    'myK9Q_shows',
    'myK9Q_announcements'
  ];

  let fixed = 0;
  let failed = 0;

  console.log('🔍 Scanning for corrupted databases...');
  console.log('');

  for (const dbName of DB_NAMES) {
    try {
      // Check if database exists
      const databaseList = await indexedDB.databases ? await indexedDB.databases() : [];
      const exists = databaseList.some(db => db.name === dbName);

      if (!exists) {
        console.log(`⏭️  ${dbName} - Not found (skipping)`);
        continue;
      }

      // Try to open the database with a timeout
      const openPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        const timeout = setTimeout(() => {
          reject(new Error('Database open timed out'));
        }, 3000);

        request.onsuccess = () => {
          clearTimeout(timeout);
          request.result.close();
          resolve(true);
        };

        request.onerror = () => {
          clearTimeout(timeout);
          reject(request.error);
        };

        request.onblocked = () => {
          clearTimeout(timeout);
          reject(new Error('Database blocked'));
        };
      });

      await openPromise;
      console.log(`✅ ${dbName} - Healthy`);
    } catch (error) {
      console.log(`❌ ${dbName} - Corrupted/Locked`);

      // Try to delete the corrupted database
      try {
        await new Promise((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(dbName);
          deleteReq.onsuccess = resolve;
          deleteReq.onerror = () => reject(deleteReq.error);
          deleteReq.onblocked = () => reject(new Error('Delete blocked'));
        });

        console.log(`   🗑️ Successfully deleted ${dbName}`);
        fixed++;
      } catch (deleteError) {
        console.log(`   ⚠️ Could not delete ${dbName} - manual cleanup required`);
        failed++;
      }
    }
  }

  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
  console.log('');

  if (fixed > 0 && failed === 0) {
    console.log('%c✅ SUCCESS!', 'color: #10b981; font-weight: bold; font-size: 14px');
    console.log(`   Fixed ${fixed} corrupted database(s)`);
    console.log('');
    console.log('👉 Please refresh the page now (Ctrl+R or Cmd+R)');
  } else if (failed > 0) {
    console.log('%c⚠️ PARTIAL SUCCESS', 'color: #f59e0b; font-weight: bold; font-size: 14px');
    console.log(`   Fixed ${fixed} database(s), but ${failed} require manual cleanup`);
    console.log('');
    console.log('To manually cleanup:');
    console.log('1. Go to: Application → Storage → IndexedDB');
    console.log('2. Right-click each myK9Q database → Delete');
    console.log('3. Refresh the page');
  } else {
    console.log('%c✅ ALL DATABASES HEALTHY', 'color: #10b981; font-weight: bold; font-size: 14px');
    console.log('   No corruption detected');
    console.log('');
    console.log('If you\'re still having issues:');
    console.log('1. Clear browser cache: Application → Storage → Clear site data');
    console.log('2. Try in Incognito/Private mode');
    console.log('3. Check your internet connection');
  }

  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');

  // Also clear service worker cache if any issues were found
  if (fixed > 0 || failed > 0) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      console.log('');
      console.log('🔧 Service Worker cache cleared');
    } catch (error) {
      console.log('⚠️ Could not clear Service Worker cache');
    }
  }
})();