import { StateStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { createEnhancedStorage } from '@/services/database/enhanced-storage-adapter';
import { createOptimizedStorage } from '@/services/database/optimized-storage-adapter';
import { createDevelopmentStorage, createQuickDevStorage } from '@/services/database/development-storage-adapter';
import { createEncryptedStorageAdapter } from '@/services/database/encrypted-storage-adapter';
import { logger } from '@/services/LoggingService';

export type StorageAdapterType = 'basic' | 'enhanced' | 'optimized' | 'development' | 'quick-dev' | 'encrypted';

interface StorageAdapterConfig {
  type: StorageAdapterType;
  enableInProduction?: boolean | undefined;
  enableMetrics?: boolean | undefined;
  forceBasicInProduction?: boolean | undefined;
  enableEncryption?: boolean | undefined;
  userId?: string | undefined;
  sessionToken?: string | undefined;
}

class StorageAdapterFactory {
  private static instance: StorageAdapterFactory;
  private config: StorageAdapterConfig;
  
  private constructor() {
    this.config = {
      type: import.meta.env.DEV ? 'development' : 'basic', // Use development adapter in dev mode
      enableInProduction: false,
      enableMetrics: import.meta.env.DEV,
      forceBasicInProduction: true,
      enableEncryption: true, // Enable encryption by default for sensitive data
    };
  }
  
  static getInstance(): StorageAdapterFactory {
    if (!StorageAdapterFactory.instance) {
      StorageAdapterFactory.instance = new StorageAdapterFactory();
    }
    return StorageAdapterFactory.instance;
  }
  
  setConfig(config: Partial<StorageAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): StorageAdapterConfig {
    return { ...this.config };
  }
  
  createStorage(storeName?: string): StateStorage {
    const baseStorage = this.createBaseStorage(storeName);
    
    // Wrap with encryption if enabled and sensitive store
    if (this.config.enableEncryption && this.isSensitiveStore(storeName)) {
      return this.wrapWithEncryption(baseStorage);
    }
    
    return baseStorage;
  }

  private createBaseStorage(storeName?: string): StateStorage {
    // Force basic adapter in production if configured
    if (import.meta.env.PROD && this.config.forceBasicInProduction) {
      logger.debug('Using basic storage adapter (production mode)', 'storage', { storeName: storeName || 'store' });
      return getOptimalStorage(storeName || 'factory-basic');
    }

    switch (this.config.type) {
      case 'basic':
        return getOptimalStorage(storeName || 'factory-basic');

      case 'enhanced':
        return createEnhancedStorage({
          enableMetrics: this.config.enableMetrics ?? false,
        });

      case 'optimized':
        return createOptimizedStorage({
          enableMetrics: this.config.enableMetrics ?? false,
          lazyInitialization: true,
        });

      case 'development':
        logger.debug('Using development storage adapter (fast startup)', 'storage', { storeName: storeName || 'store' });
        return createDevelopmentStorage({
          useLocalStoragePersistence: true,
          enableLogging: false,
          maxMemoryMB: 10,
        });

      case 'quick-dev':
        logger.debug('Using quick development storage adapter (memory only)', 'storage', { storeName: storeName || 'store' });
        return createQuickDevStorage();

      case 'encrypted': {
        logger.debug('Using encrypted storage adapter', 'storage', { storeName: storeName || 'store' });
        const baseAdapter = getOptimalStorage(storeName || 'factory-encrypted');
        return this.wrapWithEncryption(baseAdapter);
      }

      default:
        logger.warn('Unknown storage adapter type, falling back to basic', 'storage', { type: this.config.type });
        return getOptimalStorage(storeName || 'factory-basic');
    }
  }
  
  createStoreSpecificStorage(storeName: string): StateStorage {
    const baseStorage = this.createStoreSpecificBaseStorage(storeName);

    // Wrap with encryption if enabled and sensitive store
    if (this.config.enableEncryption && this.isSensitiveStore(storeName)) {
      logger.debug('Encrypting sensitive store', 'storage', { storeName });
      return this.wrapWithEncryption(baseStorage);
    }

    return baseStorage;
  }

  private createStoreSpecificBaseStorage(storeName: string): StateStorage {
    // Force basic adapter in production if configured
    if (import.meta.env.PROD && this.config.forceBasicInProduction) {
      logger.debug('Using basic storage adapter (production mode)', 'storage', { storeName });
      return getOptimalStorage(storeName);
    }

    switch (this.config.type) {
      case 'basic':
        return getOptimalStorage(storeName);

      case 'enhanced': {
        // Get store-specific enhanced config
        const enhancedConfig = this.getEnhancedConfigForStore(storeName);
        return createEnhancedStorage(enhancedConfig);
      }

      case 'optimized': {
        // Get store-specific optimized config
        const optimizedConfig = this.getOptimizedConfigForStore(storeName);
        return createOptimizedStorage(optimizedConfig);
      }

      case 'development':
        logger.debug('Using development storage adapter (fast startup)', 'storage', { storeName });
        return createDevelopmentStorage({
          useLocalStoragePersistence: true,
          enableLogging: storeName === 'templateStore', // Only log template store for debugging
          maxMemoryMB: 10,
        });

      case 'quick-dev':
        logger.debug('Using quick development storage adapter (memory only)', 'storage', { storeName });
        return createQuickDevStorage();

      case 'encrypted': {
        logger.debug('Using encrypted storage adapter', 'storage', { storeName });
        const baseAdapter = getOptimalStorage(storeName);
        return this.wrapWithEncryption(baseAdapter);
      }

      default:
        return getOptimalStorage(storeName);
    }
  }
  
  private getEnhancedConfigForStore(storeName: string) {
    const configs = {
      userStore: { maxSize: 200, ttl: 10 * 60 * 1000, enableCompression: true },
      dogStore: { maxSize: 150, ttl: 15 * 60 * 1000, enableCompression: true },
      showStore: { maxSize: 100, ttl: 20 * 60 * 1000, enableCompression: true },
      clubStore: { maxSize: 100, ttl: 20 * 60 * 1000, enableCompression: true },
      templateStore: { maxSize: 50, ttl: 60 * 60 * 1000, enableCompression: true },
      searchHistoryStore: { maxSize: 300, ttl: 5 * 60 * 1000, enableCompression: false },
    };
    
    return {
      ...configs[storeName as keyof typeof configs] || { maxSize: 100, ttl: 30 * 60 * 1000, enableCompression: true },
      enableMetrics: this.config.enableMetrics ?? false,
    };
  }

  private getOptimizedConfigForStore(storeName: string) {
    const configs = {
      // Critical stores - minimal caching for fastest startup
      userStore: { maxSize: 50, ttl: 15 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      dogStore: { maxSize: 50, ttl: 15 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      showStore: { maxSize: 30, ttl: 20 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      clubStore: { maxSize: 30, ttl: 20 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      
      // Important stores - balanced performance
      entryStore: { maxSize: 100, ttl: 10 * 60 * 1000, enableCompression: true, lazyInitialization: true },
      navigationStore: { maxSize: 20, ttl: 30 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      syncStore: { maxSize: 20, ttl: 30 * 60 * 1000, enableCompression: false, lazyInitialization: true },
      
      // Feature stores - more aggressive caching
      templateStore: { maxSize: 50, ttl: 60 * 60 * 1000, enableCompression: true, lazyInitialization: true },
      searchHistoryStore: { maxSize: 200, ttl: 5 * 60 * 1000, enableCompression: false, lazyInitialization: true },
    };
    
    return {
      ...configs[storeName as keyof typeof configs] || { maxSize: 50, ttl: 30 * 60 * 1000, enableCompression: true, lazyInitialization: true },
      enableMetrics: this.config.enableMetrics ?? false,
    };
  }

  // Performance testing utilities
  async switchAdapterAndTest(newType: StorageAdapterType): Promise<void> {
    if (import.meta.env.DEV) {
      logger.info('Switching storage adapter', 'storage', { newType });
      this.config.type = newType;

      // Reload page to test new adapter
      window.location.reload();
    }
  }
  
  getAdapterInfo(): { type: StorageAdapterType; isProduction: boolean; enableMetrics: boolean; enableEncryption: boolean } {
    return {
      type: this.config.type,
      isProduction: import.meta.env.PROD,
      enableMetrics: this.config.enableMetrics ?? false,
      enableEncryption: this.config.enableEncryption ?? false,
    };
  }

  /**
   * Set user context for encryption
   */
  setUserContext(userId: string, sessionToken?: string): void {
    this.config.userId = userId;
    this.config.sessionToken = sessionToken;
  }

  /**
   * Check if a store contains sensitive data that should be encrypted
   */
  private isSensitiveStore(storeName?: string): boolean {
    const sensitiveStores = [
      'dogStore',        // May contain health records
      'userStore',       // Contains personal information
      'healthRecordsStore',
      'vetRecordsStore',
      'medicalStore',
      'paymentStore',
      'personalNotesStore',
      'emergencyContactStore',
    ];

    return storeName ? sensitiveStores.includes(storeName) : false;
  }

  /**
   * Wrap storage with encryption layer
   */
  private wrapWithEncryption(baseStorage: StateStorage): StateStorage {
    try {
      // Convert StateStorage to StorageAdapter interface
      const storageAdapter = {
        getItem: (key: string) => baseStorage.getItem(key),
        setItem: (key: string, value: string) => baseStorage.setItem(key, value),
        removeItem: (key: string) => baseStorage.removeItem(key),
        // Add missing methods with reasonable defaults
        clear: () => {
          if ('clear' in baseStorage && typeof baseStorage.clear === 'function') {
            return baseStorage.clear();
          }
          return Promise.resolve();
        },
        keys: () => {
          if ('keys' in baseStorage && typeof baseStorage.keys === 'function') {
            return baseStorage.keys();
          }
          return Promise.resolve([]);
        },
        size: () => {
          if ('size' in baseStorage && typeof baseStorage.size === 'function') {
            return baseStorage.size();
          }
          return Promise.resolve(0);
        },
      };

      const encryptedAdapter = createEncryptedStorageAdapter(storageAdapter);
      
      // Initialize with user context if available
      if (this.config.userId) {
        encryptedAdapter.initialize(this.config.userId, this.config.sessionToken)
          .catch(error => {
            logger.warn('Failed to initialize encryption, using base storage', 'storage', {}, error as Error);
          });
      }

      return {
        getItem: (key: string) => encryptedAdapter.getItem(key),
        setItem: (key: string, value: string) => encryptedAdapter.setItem(key, value),
        removeItem: (key: string) => encryptedAdapter.removeItem(key),
      };
    } catch (error) {
      logger.error('Failed to create encrypted storage, using base storage', 'storage', {}, error as Error);
      return baseStorage;
    }
  }
}

// Global instance
export const storageAdapterFactory = StorageAdapterFactory.getInstance();

// Convenience functions
export function createStorageForStore(storeName: string): StateStorage {
  return storageAdapterFactory.createStoreSpecificStorage(storeName);
}

export function createDefaultStorage(): StateStorage {
  return storageAdapterFactory.createStorage();
}

// Development utilities
export function switchStorageAdapter(type: StorageAdapterType): void {
  if (import.meta.env.DEV) {
    storageAdapterFactory.switchAdapterAndTest(type);
  }
}

export function getStorageAdapterInfo() {
  return storageAdapterFactory.getAdapterInfo();
}

// Initialize with environment-specific defaults
if (import.meta.env.DEV) {
  storageAdapterFactory.setConfig({
    type: 'development', // Use development storage for fast startup
    enableMetrics: true,
    forceBasicInProduction: false,
  });
} else {
  storageAdapterFactory.setConfig({
    type: 'basic',
    enableMetrics: false,
    forceBasicInProduction: true,
  });
}

// Global debugging utilities
if (import.meta.env.DEV) {
  (window as Window & { storageDebug?: Record<string, unknown> }).storageDebug = {
    switchAdapter: switchStorageAdapter,
    getInfo: getStorageAdapterInfo,
    factory: storageAdapterFactory,
  };
}