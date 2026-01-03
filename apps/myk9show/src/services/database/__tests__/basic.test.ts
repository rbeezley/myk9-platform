// Basic tests to verify Phase 1 implementation
import { describe, it, expect } from 'vitest';

describe('Phase 1 Infrastructure', () => {
  it('should import database types', async () => {
    const types = await import('../types');
    expect(types).toBeDefined();
    // Types are erased at runtime, but the module should import successfully
    expect(typeof types).toBe('object');
  });
  
  it('should import database schema', async () => {
    const schema = await import('../schema');
    expect(schema).toBeDefined();
    expect(schema.DATABASE_NAME).toBe('myK9ShowDB');
    expect(schema.DATABASE_VERSION).toBe(2);
  });
  
  it('should generate Dexie schema', async () => {
    const { generateDexieSchema } = await import('../schema');
    const schema = generateDexieSchema();
    
    expect(schema).toBeDefined();
    expect(schema.dogs).toContain('id');
    expect(schema.people).toContain('id');
    expect(schema.shows).toContain('id');
  });
  
  it('should import database connection factory', async () => {
    const connection = await import('../connection');
    expect(connection.createDatabase).toBeDefined();
    expect(connection.DatabaseService).toBeDefined();
  });
  
  it('should import migration utilities', async () => {
    const migration = await import('../migration');
    expect(migration.StorageMigration).toBeDefined();
  });
  
  it('should import storage adapter', async () => {
    const adapter = await import('../storage-adapter');
    expect(adapter.createIndexedDBStorage).toBeDefined();
    expect(adapter.createHybridStorage).toBeDefined();
    expect(adapter.isIndexedDBAvailable).toBeDefined();
  });
});