// Database connection service using Dexie
import Dexie, { Table } from 'dexie';
import { logger } from '@/services/LoggingService';
import { DATABASE_NAME, DATABASE_VERSION, generateDexieSchema, STORES } from './schema';
import { compressionService, type CompressedData } from './compression';
import { migrationManager } from './migrations';
import type { DatabaseAPI, QueryFilter, PaginationOptions, PaginatedResult, TransactionCallback } from './types';

// Import types from your existing type definitions
import type { 
  Dog, 
  User
} from '@/types/dog-types';
import type { Show } from '@/types/show-types';
import type { 
  SyncMetadataRecord, 
  SyncQueueRecord, 
  ConflictRecord, 
  SyncSessionRecord 
} from '../sync/types';

export class DatabaseService extends Dexie implements DatabaseAPI {
  // Typed table declarations for existing types
  dogs!: Table<Dog>;
  people!: Table<User>;
  shows!: Table<Show>;
  
  // Generic tables for types not yet defined
  clubs!: Table<Record<string, unknown>>;
  entries!: Table<Record<string, unknown>>;
  registrations!: Table<Record<string, unknown>>;
  trials!: Table<Record<string, unknown>>;
  classes!: Table<Record<string, unknown>>;
  competitions!: Table<Record<string, unknown>>;
  achievements!: Table<Record<string, unknown>>;
  results!: Table<Record<string, unknown>>;
  templates!: Table<Record<string, unknown>>;
  classTemplates!: Table<Record<string, unknown>>;
  showTemplates!: Table<Record<string, unknown>>;
  armbands!: Table<Record<string, unknown>>;
  drafts!: Table<Record<string, unknown>>;
  _zustand_state!: Table<{ id: string; state: string; lastModified: Date }>;
  
  // Sync metadata tables (Phase 6)
  syncMetadata!: Table<SyncMetadataRecord>;
  syncQueue!: Table<SyncQueueRecord>;
  conflicts!: Table<ConflictRecord>;
  syncSessions!: Table<SyncSessionRecord>;
  
  constructor() {
    super(DATABASE_NAME);
    
    // Set up version migrations
    this.setupVersionMigrations();
    
    // Initialize performance monitoring
    this.initializePerformanceMonitoring();
  }
  
  private setupVersionMigrations(): void {
    // Version 1: Initial schema
    this.version(1).stores(this.generateLegacySchema());
    
    // Version 2: Sync tables
    this.version(2).stores(generateDexieSchema());
    
    // Version 3: Enhanced indexes and compression
    this.version(3).stores(generateDexieSchema()).upgrade(async () => {
      // console.log('Upgrading to version 3 with enhanced indexes');
      // Migration handled by MigrationManager
    });
    
    // Version 4: Optimized _zustand_state indexes
    this.version(4).stores(generateDexieSchema()).upgrade(async () => {
      // console.log('Upgrading to version 4 with optimized _zustand_state indexes');
      // Indexes will be automatically created by Dexie
    });
  }
  
  private generateLegacySchema(): Record<string, string> {
    // Simplified schema for version 1 compatibility
    return {
      dogs: 'id, ownerId, breed',
      people: 'id, email, lastName',
      shows: 'id, clubId, eventDate',
      _zustand_state: 'id, lastModified'
    };
  }
  
  private performanceMetrics = {
    queryCount: 0,
    slowQueryCount: 0,
    averageQueryTime: 0,
    lastSlowQuery: null as string | null
  };
  
  private initializePerformanceMonitoring(): void {
    // Track query performance
    this.on('ready', () => {
      logger.info('Database ready', 'database', { name: DATABASE_NAME, version: DATABASE_VERSION });
    });
  }
  
  private async onOpen() {
    logger.info('Database opened successfully', 'database', { name: DATABASE_NAME });
    await this.checkIntegrity();
  }

  private onError(error: unknown) {
    logger.error('Database error', 'database', {}, error as Error);
  }
  
  async checkIntegrity(): Promise<boolean> {
    try {
      // Verify all stores exist
      for (const storeName of Object.keys(STORES)) {
        const table = this.table(storeName);
        await table.count(); // Simple check to ensure table is accessible
      }
      
      // console.log('Database integrity check passed');
      return true;
    } catch (error) {
      logger.error('Database integrity check failed', 'database', {}, error as Error);
      return false;
    }
  }
  
  // Enhanced CRUD operations with compression support
  async create<T>(store: string, data: T & { id: string }): Promise<string> {
    const startTime = performance.now();
    
    try {
      const table = this.table(store);
      
      // Apply compression for large records
      const processedData = await this.maybeCompressData(data);
      
      await table.add(processedData);
      
      this.trackQueryPerformance('create', store, performance.now() - startTime);
      return data.id;
    } catch (error) {
      this.trackQueryError('create', store, error);
      throw error;
    }
  }
  
  async read<T>(store: string, id: string): Promise<T | null> {
    const startTime = performance.now();
    
    try {
      const table = this.table(store);
      const result = await table.get(id);
      
      if (!result) {
        this.trackQueryPerformance('read', store, performance.now() - startTime);
        return null;
      }
      
      // Fast path for _zustand_state and other system tables (no compression needed)
      if (store === '_zustand_state' || store === 'syncMetadata' || store === 'db_version') {
        this.trackQueryPerformance('read', store, performance.now() - startTime);
        return result as T;
      }
      
      // Decompress if needed for user data
      const decompressedResult = await this.maybeDecompressData(result);
      
      this.trackQueryPerformance('read', store, performance.now() - startTime);
      return decompressedResult;
    } catch (error) {
      this.trackQueryError('read', store, error);
      throw error;
    }
  }
  
  async update<T>(store: string, id: string, data: Partial<T>): Promise<void> {
    const table = this.table(store);
    await table.update(id, data);
  }
  
  async deleteRecord(store: string, id: string): Promise<void> {
    const table = this.table(store);
    await table.delete(id);
  }
  
  // Implement DatabaseAPI delete method differently to avoid conflict
  async deleteData(store: string, id: string): Promise<void> {
    return this.deleteRecord(store, id);
  }
  
  // Bulk operations
  async bulkCreate<T>(store: string, data: T[]): Promise<string[]> {
    const table = this.table(store);
    await table.bulkAdd(data);
    return data.map((item: unknown) => String((item as Record<string, unknown>).id));
  }
  
  async bulkUpdate<T>(store: string, updates: Array<{id: string, data: Partial<T>}>): Promise<void> {
    const table = this.table(store);
    await Promise.all(
      updates.map(update => table.update(update.id, update.data))
    );
  }
  
  async bulkDelete(store: string, ids: string[]): Promise<void> {
    const table = this.table(store);
    await table.bulkDelete(ids);
  }
  
  // Enhanced query operations with index optimization
  async query<T>(store: string, filter: QueryFilter = {}): Promise<T[]> {
    const startTime = performance.now();
    
    try {
      const table = this.table(store);
      let collection;
      
      // Optimize queries using indexes
      if (filter.where) {
        collection = this.optimizeWhereClause(table, filter.where);
      } else {
        collection = table.toCollection();
      }
      
      // Apply pagination
      if (filter.offset) {
        collection = collection.offset(filter.offset);
      }
      
      if (filter.limit) {
        collection = collection.limit(filter.limit);
      }
      
      // Apply ordering with index optimization
      let results: T[];
      if (filter.orderBy && this.hasIndex(store, filter.orderBy)) {
        // Use index for sorting when possible
        results = await table.orderBy(filter.orderBy).toArray();
        if (filter.where) {
          results = results.filter(item => this.matchesFilter(item as Record<string, unknown>, filter.where!));
        }
      } else if (filter.orderBy) {
        // Fallback to in-memory sorting
        results = await collection.toArray();
        results = results.sort((a, b) => {
          const aVal = (a as Record<string, unknown>)[filter.orderBy!];
          const bVal = (b as Record<string, unknown>)[filter.orderBy!];
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return aVal.localeCompare(bVal);
          }
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return aVal - bVal;
          }
          return String(aVal).localeCompare(String(bVal));
        });
      } else {
        results = await collection.toArray();
      }
      
      // Decompress results if needed
      const decompressedResults = await Promise.all(
        results.map(result => this.maybeDecompressData(result))
      );
      
      const queryTime = performance.now() - startTime;
      this.trackQueryPerformance('query', store, queryTime, results.length);
      
      return decompressedResults;
    } catch (error) {
      this.trackQueryError('query', store, error);
      throw error;
    }
  }
  
  async count(store: string, filter?: QueryFilter): Promise<number> {
    if (!filter?.where) {
      return await this.table(store).count();
    }
    
    let collection = this.table(store).toCollection();
    
    Object.entries(filter.where).forEach(([key, value]) => {
      collection = collection.filter(item => (item as Record<string, unknown>)[key] === value);
    });
    
    return await collection.count();
  }
  
  async paginate<T>(store: string, options: PaginationOptions): Promise<PaginatedResult<T>> {
    const { page, limit, orderBy, filter } = options;
    const offset = (page - 1) * limit;
    
    const total = await this.count(store, filter);
    const data = await this.query<T>(store, {
      ...filter,
      orderBy,
      limit,
      offset
    });
    
    return {
      data,
      total,
      page,
      limit,
      hasNextPage: offset + limit < total,
      hasPreviousPage: page > 1
    };
  }
  
  // Transaction support - renamed to avoid conflict with Dexie.transaction
  async executeTransaction<T>(
    stores: string[], 
    mode: 'readonly' | 'readwrite', 
    callback: TransactionCallback<T>
  ): Promise<T> {
    return await super.transaction(mode, stores, (tx) => callback(tx as unknown as IDBTransaction));
  }
  
  // Don't override the transaction method to avoid conflicts
  
  // Enhanced utility methods
  async clearStore(storeName: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      await this.table(storeName).clear();
      this.trackQueryPerformance('clear', storeName, performance.now() - startTime);
    } catch (error) {
      this.trackQueryError('clear', storeName, error);
      throw error;
    }
  }
  
  // Performance monitoring methods
  private trackQueryPerformance(
    operation: string, 
    store: string, 
    duration: number, 
    recordCount?: number
  ): void {
    this.performanceMetrics.queryCount++;
    this.performanceMetrics.averageQueryTime = 
      (this.performanceMetrics.averageQueryTime * (this.performanceMetrics.queryCount - 1) + duration) / 
      this.performanceMetrics.queryCount;
    
    if (duration > 100) { // Slow query threshold: 100ms
      this.performanceMetrics.slowQueryCount++;
      this.performanceMetrics.lastSlowQuery = `${operation} on ${store} (${duration.toFixed(2)}ms${recordCount ? `, ${recordCount} records` : ''})`;
      logger.warn('Slow query detected', 'database', { query: this.performanceMetrics.lastSlowQuery });
    }
  }
  
  private trackQueryError(operation: string, store: string, error: unknown): void {
    logger.error('Database operation error', 'database', { operation, store }, error as Error);
  }
  
  // Compression helpers
  private async maybeCompressData<T>(data: T): Promise<T | CompressedData> {
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 5120) { // 5KB threshold
      const compressed = await compressionService.compress(data);
      if (compressed.compressed) {
        return {
          ...compressed,
          _isCompressed: true
        } as T | CompressedData;
      }
    }
    return data;
  }
  
  private async maybeDecompressData<T>(data: T): Promise<T> {
    if (data && typeof data === 'object' && '_isCompressed' in data) {
      return await compressionService.decompress(data as unknown as CompressedData) as T;
    }
    return data;
  }
  
  // Query optimization helpers (simplified for compatibility)
  private optimizeWhereClause(table: Table, where: Record<string, unknown>) {
    const keys = Object.keys(where);
    
    // For now, use simple single-field index optimization
    // Try to find a single field that has an index
    for (const key of keys) {
      try {
        // Try to use the index if it exists
        const collection = table.where(key).equals(where[key] as string | number);
        
        // Apply remaining filters in memory
        const remainingKeys = keys.filter(k => k !== key);
        if (remainingKeys.length > 0) {
          const remainingFilter = Object.fromEntries(
            remainingKeys.map(k => [k, where[k]])
          );
          return collection.filter(item => this.matchesFilter(item as Record<string, unknown>, remainingFilter));
        }
        
        return collection;
      } catch {
        // Continue to next field if this one doesn't have an index
        continue;
      }
    }
    
    // Fallback to table scan
    return table.toCollection().filter(item => this.matchesFilter(item as Record<string, unknown>, where));
  }
  
  private hasIndex(store: string, field: string): boolean {
    const storeConfig = STORES[store as keyof typeof STORES];
    return storeConfig?.indexes.some(index => {
      if (Array.isArray(index.keyPath)) {
        return index.keyPath.includes(field);
      }
      return index.keyPath === field;
    }) ?? false;
  }
  
  private matchesFilter(item: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => item[key] === value);
  }
  
  // Performance reporting
  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }
  
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      queryCount: 0,
      slowQueryCount: 0,
      averageQueryTime: 0,
      lastSlowQuery: null
    };
  }
  
  // Migration support
  async runMigrations(): Promise<void> {
    try {
      const result = await migrationManager.migrate(this);
      if (!result.success) {
        logger.error('Database migration failed', 'database', { errors: result.errors });
        throw new Error(`Migration failed: ${result.errors.join(', ')}`);
      }
      logger.info('Database migrated successfully', 'database', { fromVersion: result.fromVersion, toVersion: result.toVersion });
    } catch (error) {
      logger.error('Migration error', 'database', {}, error as Error);
      throw error;
    }
  }
  
  async clearAllStores(): Promise<void> {
    await Promise.all(
      Object.keys(STORES).map(storeName => this.clearStore(storeName))
    );
  }
  
  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    
    return { used: 0, quota: 0 };
  }
}

// Factory function for creating database instances
export const createDatabase = () => new DatabaseService();

// Default instance for production use (lazy initialized)
let _defaultDb: DatabaseService | null = null;
let _migrationPromise: Promise<void> | null = null;

// Check if migrations are needed by comparing versions
function shouldRunMigrations(): boolean {
  try {
    // Check localStorage for last migration check
    const lastCheck = localStorage.getItem('myK9Show_lastMigrationCheck');
    const lastVersion = localStorage.getItem('myK9Show_lastMigrationVersion');
    
    if (lastCheck && lastVersion) {
      const timeSinceCheck = Date.now() - parseInt(lastCheck);
      // Only check migrations once per day or if version changed
      if (timeSinceCheck < 24 * 60 * 60 * 1000 && lastVersion === DATABASE_VERSION.toString()) {
        // console.log('Skipping migration check - already verified today');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.warn('Migration check failed, running migrations', 'database', { error });
    return true;
  }
}

function markMigrationsComplete(): void {
  try {
    localStorage.setItem('myK9Show_lastMigrationCheck', Date.now().toString());
    localStorage.setItem('myK9Show_lastMigrationVersion', DATABASE_VERSION.toString());
  } catch (error) {
    logger.warn('Could not save migration state', 'database', { error });
  }
}

export const db = {
  get instance(): DatabaseService {
    if (!_defaultDb) {
      _defaultDb = createDatabase();
      
      // Smart migration system: Skip in development for speed, cache in production
      if (process.env.NODE_ENV === 'development') {
        // console.log('🚀 Development mode: Skipping all migrations for performance');
      } else {
        // Production: Use intelligent migration caching
        if (shouldRunMigrations() && !_migrationPromise) {
          // console.log('🔄 Running database migrations (first time or version change)');
          _migrationPromise = _defaultDb.runMigrations()
            .then(() => {
              markMigrationsComplete();
              // console.log('✅ Database migrations completed and cached');
            })
            .catch(error => {
              logger.error('Migration failed', 'database', {}, error as Error);
              _migrationPromise = null; // Allow retry on error
            });
        } else if (!shouldRunMigrations()) {
          // console.log('⚡ Database migrations skipped - already verified (cached)');
        }
      }
    }
    return _defaultDb;
  },
  
  // Force recreation (useful for testing)
  reset(): void {
    _defaultDb?.close();
    _defaultDb = null;
  }
};