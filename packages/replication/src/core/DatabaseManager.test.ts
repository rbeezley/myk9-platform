import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DatabaseManager,
  REPLICATION_STORES,
  trackTransaction,
  getActiveTransactionCount,
  waitForActiveTransactions,
} from './DatabaseManager';

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Reset module-level singleton state from prior tests
    const { databaseManager: singletonMgr } = await import('./DatabaseManager');
    await singletonMgr.reset();

    dbManager = new DatabaseManager({}, 'test-db-' + Date.now(), 5);
  });

  afterEach(async () => {
    await dbManager.reset();
  });

  describe('REPLICATION_STORES', () => {
    it('should define all required store names', () => {
      expect(REPLICATION_STORES.REPLICATED_TABLES).toBe('replicated_tables');
      expect(REPLICATION_STORES.SYNC_METADATA).toBe('sync_metadata');
      expect(REPLICATION_STORES.PENDING_MUTATIONS).toBe('pending_mutations');
      expect(REPLICATION_STORES.PREFETCH_CACHE).toBe('prefetch_cache');
      expect(REPLICATION_STORES.OFFLINE_QUEUE).toBe('offline_queue');
    });
  });

  describe('getDatabase', () => {
    it('should return a database instance', async () => {
      const db = await dbManager.getDatabase('test-table');

      expect(db).toBeDefined();
      expect(db.objectStoreNames).toBeDefined();
    });

    it('should create all required object stores', async () => {
      const db = await dbManager.getDatabase('test-table');

      expect(db.objectStoreNames.contains(REPLICATION_STORES.REPLICATED_TABLES)).toBe(true);
      expect(db.objectStoreNames.contains(REPLICATION_STORES.SYNC_METADATA)).toBe(true);
      expect(db.objectStoreNames.contains(REPLICATION_STORES.PENDING_MUTATIONS)).toBe(true);
      expect(db.objectStoreNames.contains(REPLICATION_STORES.PREFETCH_CACHE)).toBe(true);
      expect(db.objectStoreNames.contains(REPLICATION_STORES.OFFLINE_QUEUE)).toBe(true);
    });

    it('should return the same instance on subsequent calls (singleton)', async () => {
      const db1 = await dbManager.getDatabase('table-a');
      const db2 = await dbManager.getDatabase('table-b');

      expect(db1).toBe(db2);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(dbManager.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await dbManager.getDatabase('test-table');

      expect(dbManager.isInitialized()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return status before init', () => {
      const status = dbManager.getStatus();

      expect(status.isInitialized).toBe(false);
      expect(status.initInProgress).toBe(false);
      expect(status.activeTransactions).toBe(0);
    });

    it('should return status after init', async () => {
      await dbManager.getDatabase('test-table');
      const status = dbManager.getStatus();

      expect(status.isInitialized).toBe(true);
      expect(status.initInProgress).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear shared state', async () => {
      await dbManager.getDatabase('test-table');
      expect(dbManager.isInitialized()).toBe(true);

      await dbManager.reset();
      expect(dbManager.isInitialized()).toBe(false);
    });

    it('should allow re-initialization after reset', async () => {
      await dbManager.getDatabase('test-table');
      await dbManager.reset();

      const db = await dbManager.getDatabase('test-table-2');
      expect(db).toBeDefined();
      expect(dbManager.isInitialized()).toBe(true);
    });
  });
});

describe('Transaction tracking', () => {
  it('should track active transactions', () => {
    let resolvePromise: () => void;
    const txPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const initialCount = getActiveTransactionCount();
    trackTransaction(txPromise);

    expect(getActiveTransactionCount()).toBe(initialCount + 1);

    resolvePromise!();
  });

  it('should remove completed transactions', async () => {
    let resolvePromise: () => void;
    const txPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const initialCount = getActiveTransactionCount();
    trackTransaction(txPromise);
    resolvePromise!();

    // Wait for finally callback
    await txPromise;
    await new Promise((r) => setTimeout(r, 10));

    expect(getActiveTransactionCount()).toBe(initialCount);
  });

  it('should wait for all active transactions', async () => {
    let resolve1: () => void;
    let resolve2: () => void;
    const tx1 = new Promise<void>((r) => { resolve1 = r; });
    const tx2 = new Promise<void>((r) => { resolve2 = r; });

    trackTransaction(tx1);
    trackTransaction(tx2);

    resolve1!();
    resolve2!();

    await waitForActiveTransactions();
    // Should complete without hanging
  });

  it('should track and complete multiple sequential transactions', async () => {
    const initialCount = getActiveTransactionCount();

    let resolve1: () => void;
    const tx1 = new Promise<void>((r) => { resolve1 = r; });
    trackTransaction(tx1);
    expect(getActiveTransactionCount()).toBe(initialCount + 1);

    resolve1!();
    await tx1;
    await new Promise((r) => setTimeout(r, 10));
    expect(getActiveTransactionCount()).toBe(initialCount);

    let resolve2: () => void;
    const tx2 = new Promise<void>((r) => { resolve2 = r; });
    trackTransaction(tx2);
    expect(getActiveTransactionCount()).toBe(initialCount + 1);

    resolve2!();
    await tx2;
    await new Promise((r) => setTimeout(r, 10));
    expect(getActiveTransactionCount()).toBe(initialCount);
  });
});
