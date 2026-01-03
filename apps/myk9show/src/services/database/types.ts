// Database service types and interfaces
export interface DatabaseAPI {
  // Core operations
  create<T>(store: string, data: T): Promise<string>;
  read<T>(store: string, id: string): Promise<T | null>;
  update<T>(store: string, id: string, data: Partial<T>): Promise<void>;
  deleteData(store: string, id: string): Promise<void>;
  
  // Bulk operations
  bulkCreate<T>(store: string, data: T[]): Promise<string[]>;
  bulkUpdate<T>(store: string, updates: Array<{id: string, data: Partial<T>}>): Promise<void>;
  bulkDelete(store: string, ids: string[]): Promise<void>;
  
  // Query operations
  query<T>(store: string, filter: QueryFilter): Promise<T[]>;
  count(store: string, filter?: QueryFilter): Promise<number>;
  paginate<T>(store: string, options: PaginationOptions): Promise<PaginatedResult<T>>;
  
  // Transaction support  
  executeTransaction<T>(stores: string[], mode: 'readonly' | 'readwrite', callback: TransactionCallback<T>): Promise<T>;
  
  // Utility methods
  clearStore(storeName: string): Promise<void>;
}

export interface QueryFilter {
  where?: Record<string, unknown>;
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  orderBy?: string;
  filter?: QueryFilter;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type TransactionCallback<T> = (transaction: IDBTransaction) => Promise<T>;

export type MigrationOptions<T> = {
  localStorageKey: string;
  targetStore: string;
  schema: unknown; // Schema validation
  transformer?: (data: unknown) => T;
  batchSize?: number;
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationProgress {
  total: number;
  processed: number;
  errors: number;
  phase: 'validating' | 'transforming' | 'importing' | 'verifying';
}

export interface MigrationResult {
  success: boolean;
  duration: number;
  recordCount: number;
  errors: MigrationError[];
}

export interface MigrationError {
  message: string;
  record?: Record<string, unknown>;
  index?: number;
}

export interface StorageHealth {
  isHealthy: boolean;
  storageUsed: number;
  storageQuota: number;
  errorRate: number;
  lastChecked: Date;
}

export interface StorageMetrics {
  operationType: 'read' | 'write' | 'delete' | 'query';
  storeName: string;
  duration: number;
  recordCount: number;
  errorRate: number;
  storageUsed: number;
}