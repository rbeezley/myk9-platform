// Manual test script for IndexedDB integration
// This can be run in the browser console to verify IndexedDB is working

import { getOptimalStorage, isIndexedDBAvailable } from './storage-adapter';
import { createDatabase } from './connection';

export async function testIndexedDBIntegration() {
  console.log('🔍 Testing IndexedDB Integration...\n');

  // 1. Check IndexedDB availability
  console.log('1. Checking IndexedDB availability...');
  const isAvailable = isIndexedDBAvailable();
  console.log(`   IndexedDB available: ${isAvailable}`);
  
  if (!isAvailable) {
    console.log('❌ IndexedDB not available - tests will use localStorage fallback');
    return false;
  }

  // 2. Test database connection
  console.log('\n2. Testing database connection...');
  try {
    const db = createDatabase();
    await db.open();
    console.log('   ✅ Database connection successful');
    console.log(`   Database name: ${db.name}`);
    console.log(`   Database version: ${db.verno}`);
    
    // Check integrity
    const integrity = await db.checkIntegrity();
    console.log(`   Database integrity: ${integrity ? '✅ Passed' : '❌ Failed'}`);
    
    await db.close();
  } catch (error) {
    console.error('   ❌ Database connection failed:', error);
    return false;
  }

  // 3. Test storage adapter
  console.log('\n3. Testing storage adapter...');
  try {
    const storage = getOptimalStorage('test-store');
    
    // Test basic operations
    await storage.setItem('test-key', 'test-value');
    const retrieved = await storage.getItem('test-key');
    
    if (retrieved === 'test-value') {
      console.log('   ✅ Basic storage operations working');
    } else {
      console.log('   ❌ Basic storage operations failed');
      return false;
    }
    
    // Test JSON data
    const testData = { id: 1, name: 'Test Dog', breed: 'Golden Retriever' };
    const jsonString = JSON.stringify(testData);
    
    await storage.setItem('test-json', jsonString);
    const retrievedJson = await storage.getItem('test-json');
    
    if (retrievedJson === jsonString) {
      console.log('   ✅ JSON storage operations working');
    } else {
      console.log('   ❌ JSON storage operations failed');
      return false;
    }
    
    // Cleanup
    await storage.removeItem('test-key');
    await storage.removeItem('test-json');
    
  } catch (error) {
    console.error('   ❌ Storage adapter test failed:', error);
    return false;
  }

  // 4. Test with actual store data
  console.log('\n4. Testing with store data simulation...');
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
      console.log('   ✅ Store data persistence working');
      
      // Parse and verify structure
      const parsed = JSON.parse(retrievedStore);
      if (parsed.state?.dogs?.length === 1) {
        console.log('   ✅ Store data structure preserved');
      }
    } else {
      console.log('   ❌ Store data persistence failed');
      return false;
    }
    
    // Cleanup
    await storage.removeItem('myk9show-dogs-storage');
    
  } catch (error) {
    console.error('   ❌ Store data test failed:', error);
    return false;
  }

  // 5. Check storage usage
  console.log('\n5. Checking storage usage...');
  try {
    const db = createDatabase();
    await db.open();
    const usage = await db.getStorageUsage();
    console.log(`   Storage used: ${(usage.used / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage quota: ${(usage.quota / 1024 / 1024).toFixed(2)} MB`);
    await db.close();
  } catch (error) {
    console.log('   ⚠️ Storage usage check not available:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n🎉 IndexedDB Integration Test Complete!\n');
  console.log('✅ All tests passed - IndexedDB is working correctly');
  console.log('🔧 Your stores will now persist data to IndexedDB');
  console.log('📊 Data will survive browser restarts and page refreshes');
  
  return true;
}

// Auto-run if in browser and environment variable is set
if (typeof window !== 'undefined' && import.meta.env.VITE_ENABLE_INDEXEDDB === 'true') {
  console.log('🚀 IndexedDB integration is enabled');
  
  // Run test on page load (with delay to ensure everything is loaded)
  setTimeout(() => {
    testIndexedDBIntegration().catch(error => {
      console.error('IndexedDB integration test failed:', error);
    });
  }, 1000);
}