/**
 * Optimized IndexedDB Connection Pool
 * 
 * Manages database connections efficiently to reduce overhead and improve performance.
 * Uses singleton pattern with lazy initialization and connection reuse.
 */

import { DatabaseService, createDatabase } from './connection';
import { logger } from '@/services/LoggingService';

interface ConnectionPoolConfig {
  /**
   * Maximum number of concurrent connections
   * @default 1 (IndexedDB works best with single connection per origin)
   */
  maxConnections?: number;
  
  /**
   * Timeout for acquiring connection in ms
   * @default 5000
   */
  connectionTimeout?: number;
  
  /**
   * Whether to enable connection pooling debug logging
   * @default false
   */
  enableLogging?: boolean;
  
  /**
   * Whether to skip connection pooling in development
   * @default true
   */
  skipPoolingInDev?: boolean;
}

interface PooledConnection {
  db: DatabaseService;
  isActive: boolean;
  lastUsed: number;
  connectionId: string;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalAcquisitions: number;
  averageAcquisitionTime: number;
  failedAcquisitions: number;
}

class OptimizedConnectionPool {
  private static instance: OptimizedConnectionPool;
  
  private config: Required<ConnectionPoolConfig>;
  private connections: Map<string, PooledConnection> = new Map();
  private waitingQueue: Array<{
    resolve: (connection: DatabaseService) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  
  private stats: ConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    totalAcquisitions: 0,
    averageAcquisitionTime: 0,
    failedAcquisitions: 0,
  };

  private constructor(config: ConnectionPoolConfig = {}) {
    this.config = {
      maxConnections: config.maxConnections ?? 1, // IndexedDB optimal: single connection
      connectionTimeout: config.connectionTimeout ?? 5000,
      enableLogging: config.enableLogging ?? false,
      skipPoolingInDev: config.skipPoolingInDev ?? true,
    };

    // In development, use simplified connection management for speed
    if (import.meta.env.DEV && this.config.skipPoolingInDev) {
      this.log('🚀 Development mode: Using simplified connection management');
    }

    // Set up cleanup interval
    this.startCleanupTimer();
  }

  static getInstance(config?: ConnectionPoolConfig): OptimizedConnectionPool {
    if (!OptimizedConnectionPool.instance) {
      OptimizedConnectionPool.instance = new OptimizedConnectionPool(config);
    }
    return OptimizedConnectionPool.instance;
  }

  private log(message: string, ...args: unknown[]) {
    if (this.config.enableLogging) {
      logger.debug(`🏊 ConnectionPool: ${message}`, 'database', { data: ...args });
    }
  }

  /**
   * Acquire a database connection
   */
  async acquire(): Promise<DatabaseService> {
    const acquisitionStart = performance.now();
    
    // Development fast path: skip pooling complexity
    if (import.meta.env.DEV && this.config.skipPoolingInDev) {
      return this.getOrCreateSingleConnection();
    }

    try {
      const connection = await this.getAvailableConnection();
      
      const acquisitionTime = performance.now() - acquisitionStart;
      this.updateAcquisitionStats(acquisitionTime);
      this.log('Connection acquired', { connectionId: connection.toString(), acquisitionTime });
      
      return connection;
    } catch (error) {
      this.stats.failedAcquisitions++;
      this.log('Failed to acquire connection', error);
      throw error;
    }
  }

  /**
   * Release a database connection back to the pool
   */
  release(db: DatabaseService): void {
    // In development mode with simplified management, just mark as available
    if (import.meta.env.DEV && this.config.skipPoolingInDev) {
      this.log('Connection released (development mode)');
      return;
    }

    // Find the connection in our pool
    for (const [connectionId, pooledConnection] of this.connections) {
      if (pooledConnection.db === db) {
        pooledConnection.isActive = false;
        pooledConnection.lastUsed = Date.now();
        this.stats.activeConnections--;
        
        this.log('Connection released', { connectionId });
        
        // Check if anyone is waiting
        this.processWaitingQueue();
        return;
      }
    }
    
    this.log('Warning: Attempted to release unknown connection');
  }

  /**
   * Execute a function with an automatically managed connection
   */
  async withConnection<T>(fn: (db: DatabaseService) => Promise<T>): Promise<T> {
    const db = await this.acquire();
    try {
      return await fn(db);
    } finally {
      this.release(db);
    }
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Clear all connections and reset pool
   */
  async clear(): Promise<void> {
    this.log('Clearing connection pool');
    
    // Close all connections
    for (const [connectionId, pooledConnection] of this.connections) {
      try {
        await pooledConnection.db.close();
      } catch (error) {
        this.log('Error closing connection', { connectionId, error });
      }
    }
    
    this.connections.clear();
    this.stats.totalConnections = 0;
    this.stats.activeConnections = 0;
    
    // Reject any waiting requests
    for (const waiter of this.waitingQueue) {
      waiter.reject(new Error('Connection pool cleared'));
    }
    this.waitingQueue = [];
  }

  /**
   * Development/testing: Get or create the single shared connection
   */
  private async getOrCreateSingleConnection(): Promise<DatabaseService> {
    const singleConnectionId = 'dev-single';
    
    let pooledConnection = this.connections.get(singleConnectionId);
    
    if (!pooledConnection) {
      const db = createDatabase();
      pooledConnection = {
        db,
        isActive: true,
        lastUsed: Date.now(),
        connectionId: singleConnectionId,
      };
      
      this.connections.set(singleConnectionId, pooledConnection);
      this.stats.totalConnections = 1;
      this.log('Created single development connection');
    }
    
    return pooledConnection.db;
  }

  /**
   * Get an available connection or wait for one
   */
  private async getAvailableConnection(): Promise<DatabaseService> {
    // Try to find an available connection
    for (const pooledConnection of this.connections.values()) {
      if (!pooledConnection.isActive) {
        pooledConnection.isActive = true;
        pooledConnection.lastUsed = Date.now();
        this.stats.activeConnections++;
        return pooledConnection.db;
      }
    }

    // If we haven't reached max connections, create a new one
    if (this.connections.size < this.config.maxConnections) {
      return await this.createNewConnection();
    }

    // Otherwise, wait for a connection to become available
    return await this.waitForConnection();
  }

  /**
   * Create a new connection
   */
  private async createNewConnection(): Promise<DatabaseService> {
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const db = createDatabase();
    
    const pooledConnection: PooledConnection = {
      db,
      isActive: true,
      lastUsed: Date.now(),
      connectionId,
    };
    
    this.connections.set(connectionId, pooledConnection);
    this.stats.totalConnections++;
    this.stats.activeConnections++;
    
    this.log('Created new connection', { connectionId, totalConnections: this.connections.size });
    
    return db;
  }

  /**
   * Wait for a connection to become available
   */
  private async waitForConnection(): Promise<DatabaseService> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error(`Connection acquisition timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      this.waitingQueue.push({
        resolve: (connection) => {
          clearTimeout(timeout);
          resolve(connection);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Process any queued connection requests
   */
  private processWaitingQueue(): void {
    if (this.waitingQueue.length === 0) return;

    for (const pooledConnection of this.connections.values()) {
      if (!pooledConnection.isActive && this.waitingQueue.length > 0) {
        const waiter = this.waitingQueue.shift()!;
        
        pooledConnection.isActive = true;
        pooledConnection.lastUsed = Date.now();
        this.stats.activeConnections++;
        
        waiter.resolve(pooledConnection.db);
        break;
      }
    }
  }

  /**
   * Update acquisition time statistics
   */
  private updateAcquisitionStats(acquisitionTime: number): void {
    this.stats.totalAcquisitions++;
    this.stats.averageAcquisitionTime = 
      (this.stats.averageAcquisitionTime * (this.stats.totalAcquisitions - 1) + acquisitionTime) / 
      this.stats.totalAcquisitions;
  }

  /**
   * Start cleanup timer for unused connections
   */
  private startCleanupTimer(): void {
    // In production, clean up unused connections every 5 minutes
    if (!import.meta.env.DEV) {
      setInterval(() => {
        this.cleanupUnusedConnections();
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Clean up connections that haven't been used recently
   */
  private cleanupUnusedConnections(): void {
    if (import.meta.env.DEV && this.config.skipPoolingInDev) {
      return; // Skip cleanup in development
    }

    const now = Date.now();
    const maxIdleTime = 10 * 60 * 1000; // 10 minutes

    for (const [connectionId, pooledConnection] of this.connections) {
      if (!pooledConnection.isActive && (now - pooledConnection.lastUsed) > maxIdleTime) {
        this.log('Cleaning up unused connection', { connectionId });
        
        try {
          pooledConnection.db.close();
        } catch (error) {
          this.log('Error closing connection during cleanup', { connectionId, error });
        }
        
        this.connections.delete(connectionId);
        this.stats.totalConnections--;
      }
    }
  }
}

// Global instance
let globalConnectionPool: OptimizedConnectionPool | null = null;

/**
 * Get the global optimized connection pool
 */
export function getConnectionPool(config?: ConnectionPoolConfig): OptimizedConnectionPool {
  if (!globalConnectionPool) {
    globalConnectionPool = OptimizedConnectionPool.getInstance(config);
  }
  return globalConnectionPool;
}

/**
 * Acquire a database connection from the optimized pool
 */
export async function acquireConnection(): Promise<DatabaseService> {
  return await getConnectionPool().acquire();
}

/**
 * Release a database connection back to the pool
 */
export function releaseConnection(db: DatabaseService): void {
  getConnectionPool().release(db);
}

/**
 * Execute a function with an automatically managed database connection
 */
export async function withConnection<T>(fn: (db: DatabaseService) => Promise<T>): Promise<T> {
  return await getConnectionPool().withConnection(fn);
}

/**
 * Get connection pool statistics
 */
export function getConnectionStats(): ConnectionStats {
  return getConnectionPool().getStats();
}

/**
 * Initialize connection pool with environment-specific configuration
 */
export function initializeConnectionPool(): void {
  const config: ConnectionPoolConfig = {
    maxConnections: 1, // IndexedDB optimal: single connection per origin
    connectionTimeout: import.meta.env.DEV ? 2000 : 5000,
    enableLogging: import.meta.env.DEV,
    skipPoolingInDev: true, // Simplify for development speed
  };

  getConnectionPool(config);
  
  if (import.meta.env.DEV) {
    // Add debugging utilities to window
    (window as unknown as Record<string, unknown>).__connectionPool = {
      stats: getConnectionStats,
      pool: getConnectionPool(),
    };
  }
}

// Auto-initialize on import
initializeConnectionPool();