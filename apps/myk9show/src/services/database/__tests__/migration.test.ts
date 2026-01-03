// Migration tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB for testing
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// Import after setting up fake IndexedDB  
import { StorageMigration } from '../migration';
import { DatabaseService } from '../connection';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('StorageMigration', () => {
  let migration: StorageMigration;
  let db: DatabaseService;
  
  beforeEach(async () => {
    migration = StorageMigration.getInstance();
    db = new DatabaseService();
    await db.open();
    localStorageMock.clear();
  });
  
  afterEach(async () => {
    await db.delete();
    await db.close();
    localStorageMock.clear();
  });
  
  describe('Migration Process', () => {
    const mockDogData = {
      state: {
        dogs: [
          { id: 'dog-1', name: 'Buddy', breed: 'Labrador' },
          { id: 'dog-2', name: 'Max', breed: 'Poodle' }
        ]
      }
    };
    
    beforeEach(() => {
      localStorageMock.setItem('myk9show-dogs-storage', JSON.stringify(mockDogData));
    });
    
    it('should migrate dogs from localStorage to IndexedDB', async () => {
      const result = await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null // Skip validation for test
      });
      
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(2);
      
      // Verify data in IndexedDB
      const dogsCount = await db.count('dogs');
      expect(dogsCount).toBe(2);
      
      const dog1 = await db.read('dogs', 'dog-1');
      expect(dog1?.name).toBe('Buddy');
    });
    
    it('should create backup before migration', async () => {
      await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      // Check that backup was created
      const backups = await migration.listBackups('myk9show-dogs-storage');
      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0]).toMatch(/myk9show-dogs-storage-backup-\d+/);
    });
    
    it('should handle empty localStorage gracefully', async () => {
      localStorageMock.removeItem('myk9show-dogs-storage');
      
      const result = await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(0);
    });
    
    it('should track migration progress', async () => {
      const progressUpdates: Array<Record<string, unknown>> = [];
      
      await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null,
        onProgress: (progress) => {
          progressUpdates.push(progress);
        }
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates.some(p => p.phase === 'validating')).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'importing')).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'verifying')).toBe(true);
    });
    
    it('should handle data transformation', async () => {
      const transformer = (data: Record<string, unknown>) => ({
        ...data,
        transformed: true
      });
      
      await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null,
        transformer
      });
      
      const dog1 = await db.read('dogs', 'dog-1');
      expect(dog1?.transformed).toBe(true);
    });
  });
  
  describe('Migration Status', () => {
    it('should track migration completion', async () => {
      const initialStatus = await migration.getMigrationStatus('dogs');
      expect(initialStatus.completed).toBe(false);
      
      localStorageMock.setItem('myk9show-dogs-storage', JSON.stringify({
        state: { dogs: [{ id: 'dog-1', name: 'Test' }] }
      }));
      
      await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      const finalStatus = await migration.getMigrationStatus('dogs');
      expect(finalStatus.completed).toBe(true);
      expect(finalStatus.date).toBeDefined();
    });
    
    it('should skip already completed migrations', async () => {
      // Mark as completed
      localStorageMock.setItem('migration-dogs-completed', 'true');
      
      const result = await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(0);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle invalid JSON in localStorage', async () => {
      localStorageMock.setItem('myk9show-dogs-storage', 'invalid-json');
      
      const result = await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(0);
    });
  });
  
  describe('Backup Management', () => {
    beforeEach(() => {
      // Create some test backups
      localStorageMock.setItem('test-backup-1000', 'data1');
      localStorageMock.setItem('test-backup-2000', 'data2');
      localStorageMock.setItem('test-backup-3000', 'data3');
      localStorageMock.setItem('test-backup-4000', 'data4');
    });
    
    it('should list backups in reverse chronological order', async () => {
      const backups = await migration.listBackups('test');
      expect(backups).toEqual([
        'test-backup-4000',
        'test-backup-3000',
        'test-backup-2000',
        'test-backup-1000'
      ]);
    });
    
    it('should cleanup old backups', async () => {
      await migration.cleanupBackups('test', 2);
      
      const remainingBackups = await migration.listBackups('test');
      expect(remainingBackups).toHaveLength(2);
      expect(remainingBackups).toEqual([
        'test-backup-4000',
        'test-backup-3000'
      ]);
    });
  });
  
  describe('Reset Migration', () => {
    it('should reset migration status and clear data', async () => {
      // Complete a migration first
      localStorageMock.setItem('myk9show-dogs-storage', JSON.stringify({
        state: { dogs: [{ id: 'dog-1', name: 'Test' }] }
      }));
      
      await migration.migrateStore({
        localStorageKey: 'myk9show-dogs-storage',
        targetStore: 'dogs',
        schema: null
      });
      
      // Verify it's completed
      let status = await migration.getMigrationStatus('dogs');
      expect(status.completed).toBe(true);
      
      let count = await db.count('dogs');
      expect(count).toBe(1);
      
      // Reset the migration
      await migration.resetMigration('dogs');
      
      // Verify it's reset
      status = await migration.getMigrationStatus('dogs');
      expect(status.completed).toBe(false);
      
      count = await db.count('dogs');
      expect(count).toBe(0);
    });
  });
});