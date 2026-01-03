// Database connection tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB for testing
global.indexedDB = new FDBFactory();
global.IDBKeyRange = FDBKeyRange;

// Import after setting up fake IndexedDB
import { DatabaseService } from '../connection';

describe('DatabaseService', () => {
  let db: DatabaseService;
  
  beforeEach(async () => {
    db = new DatabaseService();
    await db.open();
  });
  
  afterEach(async () => {
    await db.delete();
    await db.close();
  });
  
  describe('Connection', () => {
    it('should open database successfully', async () => {
      expect(db.isOpen()).toBe(true);
    });
    
    it('should have correct database name', () => {
      expect(db.name).toBe('myK9ShowDB');
    });
    
    it('should pass integrity check', async () => {
      const isHealthy = await db.checkIntegrity();
      expect(isHealthy).toBe(true);
    });
  });
  
  describe('CRUD Operations', () => {
    const testData = {
      id: 'test-1',
      name: 'Test Dog',
      breed: 'Golden Retriever'
    };
    
    it('should create record', async () => {
      const id = await db.create('dogs', testData);
      expect(id).toBe(testData.id);
    });
    
    it('should read record', async () => {
      await db.create('dogs', testData);
      const result = await db.read('dogs', testData.id);
      expect(result).toEqual(testData);
    });
    
    it('should update record', async () => {
      await db.create('dogs', testData);
      await db.update('dogs', testData.id, { name: 'Updated Dog' });
      
      const result = await db.read('dogs', testData.id);
      expect(result?.name).toBe('Updated Dog');
      expect(result?.breed).toBe(testData.breed);
    });
    
    it('should delete record', async () => {
      await db.create('dogs', testData);
      await db.delete('dogs', testData.id);
      
      const result = await db.read('dogs', testData.id);
      expect(result).toBeNull();
    });
  });
  
  describe('Bulk Operations', () => {
    const testData = [
      { id: 'dog-1', name: 'Dog 1', breed: 'Labrador' },
      { id: 'dog-2', name: 'Dog 2', breed: 'Poodle' },
      { id: 'dog-3', name: 'Dog 3', breed: 'Beagle' }
    ];
    
    it('should bulk create records', async () => {
      const ids = await db.bulkCreate('dogs', testData);
      expect(ids).toHaveLength(3);
      expect(ids).toContain('dog-1');
    });
    
    it('should bulk update records', async () => {
      await db.bulkCreate('dogs', testData);
      
      const updates = [
        { id: 'dog-1', data: { name: 'Updated Dog 1' } },
        { id: 'dog-2', data: { name: 'Updated Dog 2' } }
      ];
      
      await db.bulkUpdate('dogs', updates);
      
      const dog1 = await db.read('dogs', 'dog-1');
      const dog2 = await db.read('dogs', 'dog-2');
      
      expect(dog1?.name).toBe('Updated Dog 1');
      expect(dog2?.name).toBe('Updated Dog 2');
    });
    
    it('should bulk delete records', async () => {
      await db.bulkCreate('dogs', testData);
      await db.bulkDelete('dogs', ['dog-1', 'dog-2']);
      
      const dog1 = await db.read('dogs', 'dog-1');
      const dog2 = await db.read('dogs', 'dog-2');
      const dog3 = await db.read('dogs', 'dog-3');
      
      expect(dog1).toBeNull();
      expect(dog2).toBeNull();
      expect(dog3).not.toBeNull();
    });
  });
  
  describe('Query Operations', () => {
    const testData = [
      { id: 'dog-1', name: 'Buddy', breed: 'Labrador', age: 3 },
      { id: 'dog-2', name: 'Max', breed: 'Poodle', age: 5 },
      { id: 'dog-3', name: 'Charlie', breed: 'Labrador', age: 2 }
    ];
    
    beforeEach(async () => {
      await db.bulkCreate('dogs', testData);
    });
    
    it('should query all records', async () => {
      const results = await db.query('dogs');
      expect(results).toHaveLength(3);
    });
    
    it('should query with filter', async () => {
      const results = await db.query('dogs', {
        where: { breed: 'Labrador' }
      });
      expect(results).toHaveLength(2);
    });
    
    it('should query with limit', async () => {
      const results = await db.query('dogs', {
        limit: 2
      });
      expect(results).toHaveLength(2);
    });
    
    it('should count records', async () => {
      const count = await db.count('dogs');
      expect(count).toBe(3);
    });
    
    it('should count with filter', async () => {
      const count = await db.count('dogs', {
        where: { breed: 'Labrador' }
      });
      expect(count).toBe(2);
    });
  });
  
  describe('Pagination', () => {
    const testData = Array.from({ length: 10 }, (_, i) => ({
      id: `dog-${i + 1}`,
      name: `Dog ${i + 1}`,
      breed: 'Mixed'
    }));
    
    beforeEach(async () => {
      await db.bulkCreate('dogs', testData);
    });
    
    it('should paginate results', async () => {
      const result = await db.paginate('dogs', {
        page: 1,
        limit: 3
      });
      
      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(10);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });
    
    it('should handle second page', async () => {
      const result = await db.paginate('dogs', {
        page: 2,
        limit: 3
      });
      
      expect(result.data).toHaveLength(3);
      expect(result.page).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
    });
  });
  
  describe('Storage Usage', () => {
    it('should get storage usage', async () => {
      const usage = await db.getStorageUsage();
      expect(usage).toHaveProperty('used');
      expect(usage).toHaveProperty('quota');
      expect(typeof usage.used).toBe('number');
      expect(typeof usage.quota).toBe('number');
    });
  });
});