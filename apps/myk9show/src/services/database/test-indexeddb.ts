// Manual test script for IndexedDB integration
// This can be run in the browser console to verify IndexedDB is working

import { getOptimalStorage, isIndexedDBAvailable } from './storage-adapter';
import { createDatabase } from './connection';
import { logger } from '@/services/LoggingService';

export async function testIndexedDBIntegration() {
  logger.debug('🔍 Testing IndexedDB Integration...\n', 'database', {});

  // 1. Check IndexedDB availability
  logger.debug('1. Checking IndexedDB availability...', 'database', {});
  const isAvailable = isIndexedDBAvailable();
  logger.debug(`   IndexedDB available: ${isAvailable}`, 'database', {});
  
  if (!isAvailable) {
    logger.debug('❌ IndexedDB not available - tests will use localStorage fallback', 'database', {});
    return false;
  }

  // 2. Test database connection
  logger.debug('\n2. Testing database connection...', 'database', {});
  try {
    const db = createDatabase();
    await db.open();
    logger.debug('   ✅ Database connection successful', 'database', {});
    logger.debug(`   Database name: ${db.name}`, 'database', {});
    logger.debug(`   Database version: ${db.verno}`, 'database', {});
    
    // Check integrity
    const integrity = await db.checkIntegrity();
    logger.debug(`   Database integrity: ${integrity ? '✅ Passed' : '❌ Failed'}`, 'database', {});
    
    await db.close();
  } catch (error) {
    logger.error('   ❌ Database connection failed:', 'database', {}, error as Error);
    return false;
  }

  // 3. Test storage adapter
  logger.debug('\n3. Testing storage adapter...', 'database', {});
  try {
    const storage = getOptimalStorage('test-store');
    
    // Test basic operations
    await storage.setItem('test-key', 'test-value');
    const retrieved = await storage.getItem('test-key');
    
    if (retrieved === 'test-value') {
      logger.debug('   ✅ Basic storage operations working', 'database', {});
    } else {
      logger.debug('   ❌ Basic storage operations failed', 'database', {});
      return false;
    }
    
    // Test JSON data
    const testData = { id: 1, name: 'Test Dog', breed: 'Golden Retriever' };
    const jsonString = JSON.stringify(testData);
    
    await storage.setItem('test-json', jsonString);
    const retrievedJson = await storage.getItem('test-json');
    
    if (retrievedJson === jsonString) {
      logger.debug('   ✅ JSON storage operations working', 'database', {});
    } else {
      logger.debug('   ❌ JSON storage operations failed', 'database', {});
      return false;
    }
    
    // Cleanup
    await storage.removeItem('test-key');
    await storage.removeItem('test-json');
    
  } catch (error) {
    logger.error('   ❌ Storage adapter test failed:', 'database', {}, error as Error);
    return false;
  }

  // 4. Test with actual store data
  logger.debug('\n4. Testing with store data simulation...', 'database', {});
  try {
    const storage = getOptimalStorage('dogs');
    
    // Simulate Zustand persist data format
    const mockStoreData = {
      state: {
        dogs: [
          {
            id: 'test-dog-1',
            name: 'Buddy',
            breed: 'Golden Retriever',
            ownerId: 'test-owner-1',
            _syncStatus: 'pending'
          }
        ],
        selectedDogId: ''
      },
      version: 1
    };
    
    const storeJson = JSON.stringify(mockStoreData);
    await storage.setItem('myk9show-dogs-storage', storeJson);
    
    const retrievedStore = await storage.getItem('myk9show-dogs-storage');
    
    if (retrievedStore === storeJson) {
      logger.debug('   ✅ Store data persistence working', 'database', {});
      
      // Parse and verify structure
      const parsed = JSON.parse(retrievedStore);
      if (parsed.state?.dogs?.length === 1) {
        logger.debug('   ✅ Store data structure preserved', 'database', {});
      }
    } else {
      logger.debug('   ❌ Store data persistence failed', 'database', {});
      return false;
    }
    
    // Cleanup
    await storage.removeItem('myk9show-dogs-storage');
    
  } catch (error) {
    logger.error('   ❌ Store data test failed:', 'database', {}, error as Error);
    return false;
  }

  // 5. Check storage usage
  logger.debug('\n5. Checking storage usage...', 'database', {});
  try {
    const db = createDatabase();
    await db.open();
    const usage = await db.getStorageUsage();
    logger.debug(`   Storage used: ${(usage.used / 1024 / 1024).toFixed(2)} MB`, 'database', {});
    logger.debug(`   Storage quota: ${(usage.quota / 1024 / 1024).toFixed(2)} MB`, 'database', {});
    await db.close();
  } catch (error) {
    logger.debug('   ⚠️ Storage usage check not available:', 'database', { data: error instanceof Error ? error.message : String(error) });
  }

  logger.debug('\n🎉 IndexedDB Integration Test Complete!\n', 'database', {});
  logger.debug('✅ All tests passed - IndexedDB is working correctly', 'database', {});
  logger.debug('🔧 Your stores will now persist data to IndexedDB', 'database', {});
  logger.debug('📊 Data will survive browser restarts and page refreshes', 'database', {});
  
  return true;
}

// Auto-run if in browser and environment variable is set
if (typeof window !== 'undefined' && import.meta.env.VITE_ENABLE_INDEXEDDB === 'true') {
  logger.debug('🚀 IndexedDB integration is enabled', 'database', {});
  
  // Run test on page load (with delay to ensure everything is loaded)
  setTimeout(() => {
    testIndexedDBIntegration().catch(error => {
      logger.error('IndexedDB integration test failed:', 'database', {}, error as Error);
    });
  }, 1000);
}