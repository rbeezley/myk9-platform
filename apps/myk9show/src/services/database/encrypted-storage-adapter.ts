/**
 * Encrypted Storage Adapter
 * Extends the existing storage system with encryption for sensitive data
 */

import { StateStorage } from 'zustand/middleware';
import { SecureStorage, SENSITIVE_DATA_TYPES } from '@/utils/encryption';
import { keyManager, KEY_PURPOSES } from '@/services/security/KeyManagementService';
import { logger } from '@/services/LoggingService';

// Enhanced storage adapter interface with additional methods
export interface StorageAdapter extends StateStorage {
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  size(): Promise<number>;
}

export class EncryptedStorageAdapter implements StorageAdapter {
  private baseAdapter: StorageAdapter;
  private secureStorage: SecureStorage | null = null;
  private initialized = false;

  constructor(baseAdapter: StorageAdapter) {
    this.baseAdapter = baseAdapter;
  }

  /**
   * Initialize encrypted storage with user context
   */
  async initialize(userId: string, sessionToken?: string): Promise<void> {
    try {
      // Initialize key management service
      await keyManager.initialize(userId, sessionToken);
      
      // Get or create master password for this session
      const masterKey = await keyManager.getLatestKeyForPurpose(KEY_PURPOSES.SESSION_DATA) || 
                        await keyManager.generateKey(KEY_PURPOSES.SESSION_DATA, 1); // 1 day rotation for session keys
      
      const actualKey = await keyManager.getKey(masterKey);
      if (!actualKey) {
        throw new Error('Failed to get session encryption key');
      }
      
      this.secureStorage = new SecureStorage(actualKey);
      this.initialized = true;

      logger.info('Encrypted Storage Adapter initialized', 'storage');
    } catch (error) {
      logger.error('Failed to initialize encrypted storage', 'storage', {}, error as Error);
      throw new Error('Encrypted storage initialization failed');
    }
  }

  /**
   * Enhanced setItem with encryption for sensitive data
   */
  async setItem(key: string, value: string): Promise<void> {
    // Determine if this data should be encrypted
    const shouldEncrypt = this.shouldEncryptKey(key) || this.shouldEncryptValue(value);
    
    if (shouldEncrypt && this.secureStorage && this.initialized) {
      try {
        // Store encrypted data with secure storage
        await this.secureStorage.setItem(key, value);
        logger.debug('Stored encrypted data', 'storage', { key });
        return;
      } catch (error) {
        logger.warn('Failed to encrypt data, falling back to base storage', 'storage', { key }, error as Error);
      }
    }
    
    // Fall back to base adapter for non-sensitive data or if encryption fails
    await this.baseAdapter.setItem(key, value);
  }

  /**
   * Enhanced getItem with decryption support
   */
  async getItem(key: string): Promise<string | null> {
    // Try to get from secure storage first if initialized
    if (this.secureStorage && this.initialized && this.shouldEncryptKey(key)) {
      try {
        const secureValue = await this.secureStorage.getItem(key);
        if (secureValue !== null) {
          logger.debug('Retrieved encrypted data', 'storage', { key });
          return secureValue;
        }
      } catch (error) {
        logger.warn('Failed to decrypt data, trying base storage', 'storage', { key }, error as Error);
      }
    }
    
    // Fall back to base adapter
    return this.baseAdapter.getItem(key);
  }

  /**
   * Enhanced removeItem that clears from both storages
   */
  async removeItem(key: string): Promise<void> {
    // Remove from secure storage if available
    if (this.secureStorage && this.initialized) {
      try {
        this.secureStorage.removeItem(key);
      } catch (error) {
        logger.warn('Failed to remove from secure storage', 'storage', { key }, error as Error);
      }
    }

    // Remove from base storage
    await this.baseAdapter.removeItem(key);
  }

  /**
   * Enhanced clear that clears both storages
   */
  async clear(): Promise<void> {
    // Clear secure storage if available
    if (this.secureStorage && this.initialized) {
      try {
        this.secureStorage.clear();
      } catch (error) {
        logger.warn('Failed to clear secure storage', 'storage', {}, error as Error);
      }
    }

    // Clear base storage
    await this.baseAdapter.clear();
  }

  /**
   * Enhanced key listing that combines both storages
   */
  async keys(): Promise<string[]> {
    const baseKeys = await this.baseAdapter.keys();
    let secureKeys: string[] = [];
    
    if (this.secureStorage && this.initialized) {
      try {
        secureKeys = this.secureStorage.keys();
      } catch (error) {
        logger.warn('Failed to get secure storage keys', 'storage', {}, error as Error);
      }
    }

    // Combine and deduplicate keys
    return [...new Set([...baseKeys, ...secureKeys])];
  }

  /**
   * Get size information from both storages
   */
  async size(): Promise<number> {
    let baseSize = 0;
    try {
      baseSize = await this.baseAdapter.size();
    } catch (error) {
      logger.warn('Failed to get base storage size', 'storage', {}, error as Error);
    }

    let secureSize = 0;
    if (this.secureStorage && this.initialized) {
      try {
        const secureKeys = this.secureStorage.keys();
        secureSize = secureKeys.length;
      } catch (error) {
        logger.warn('Failed to get secure storage size', 'storage', {}, error as Error);
      }
    }

    return baseSize + secureSize;
  }

  /**
   * Determine if a key should be encrypted based on naming patterns
   */
  private shouldEncryptKey(key: string): boolean {
    const sensitiveKeyPatterns = [
      /health.*record/i,
      /medical/i,
      /vet.*record/i,
      /payment/i,
      /credit.*card/i,
      /bank/i,
      /ssn/i,
      /personal.*note/i,
      /emergency.*contact/i,
      /allergy/i,
      /medication/i,
      /condition/i,
      /diagnosis/i,
      /treatment/i,
      /private/i,
      /sensitive/i,
      /confidential/i,
    ];
    
    return sensitiveKeyPatterns.some(pattern => pattern.test(key));
  }

  /**
   * Determine if a value contains sensitive data
   */
  private shouldEncryptValue(value: string): boolean {
    try {
      // Try to parse as JSON to check for sensitive fields
      const parsed = JSON.parse(value);
      
      if (typeof parsed === 'object' && parsed !== null) {
        return this.containsSensitiveFields(parsed);
      }
    } catch {
      // Not JSON, check string patterns
      return this.containsSensitivePatterns(value);
    }
    
    return false;
  }

  /**
   * Check if an object contains sensitive fields
   */
  private containsSensitiveFields(obj: Record<string, unknown>): boolean {
    const sensitiveFields = [
      'creditCard', 'bankAccount', 'ssn', 'medicalCondition',
      'allergies', 'medications', 'veterinarian', 'emergencyContact',
      'healthRecords', 'vaccination', 'treatment', 'diagnosis',
      'personalNotes', 'privateNotes', 'confidential'
    ];
    
    const keys = Object.keys(obj);
    return sensitiveFields.some(field => 
      keys.some(key => key.toLowerCase().includes(field.toLowerCase()))
    );
  }

  /**
   * Check if a string contains sensitive patterns
   */
  private containsSensitivePatterns(value: string): boolean {
    const sensitivePatterns = [
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card pattern
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b\d{9}\b/, // 9-digit ID pattern
      /vaccination|vaccine|shot/i,
      /allergy|allergic/i,
      /medication|medicine|drug/i,
      /diagnosis|condition|disease/i,
      /treatment|therapy/i,
      /veterinarian|vet\s/i,
      /emergency.{0,20}contact/i,
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(value));
  }

  /**
   * Migrate existing data to encrypted format
   */
  async migrateToEncrypted(): Promise<{ migrated: number; errors: number }> {
    if (!this.secureStorage || !this.initialized) {
      throw new Error('Encrypted storage not initialized');
    }
    
    let migrated = 0;
    let errors = 0;
    
    try {
      const allKeys = await this.baseAdapter.keys();
      
      for (const key of allKeys) {
        try {
          if (this.shouldEncryptKey(key)) {
            const value = await this.baseAdapter.getItem(key);
            if (value !== null && this.shouldEncryptValue(value)) {
              // Migrate to encrypted storage
              await this.secureStorage.setItem(key, value);
              await this.baseAdapter.removeItem(key);
              migrated++;
              logger.debug('Migrated key to encrypted storage', 'storage', { key });
            }
          }
        } catch (error) {
          logger.error('Failed to migrate key', 'storage', { key }, error as Error);
          errors++;
        }
      }

      logger.info('Migration complete', 'storage', { migrated, errors });
    } catch (error) {
      logger.error('Migration failed', 'storage', {}, error as Error);
      throw new Error('Data migration to encrypted format failed');
    }
    
    return { migrated, errors };
  }

  /**
   * Get encryption statistics
   */
  getEncryptionStats(): {
    initialized: boolean;
    encryptedKeys: number;
    unencryptedKeys: number;
    keyManagerStats: ReturnType<typeof keyManager.getStats>;
  } {
    let encryptedKeys = 0;
    let unencryptedKeys = 0;
    
    if (this.secureStorage && this.initialized) {
      try {
        encryptedKeys = this.secureStorage.keys().length;
      } catch (error) {
        logger.warn('Failed to get encrypted keys count', 'storage', {}, error as Error);
      }
    }

    try {
      this.baseAdapter.keys().then(keys => {
        unencryptedKeys = keys.length;
      }).catch(error => {
        logger.warn('Failed to get unencrypted keys count', 'storage', {}, error as Error);
      });
    } catch (error) {
      logger.warn('Failed to get unencrypted keys count', 'storage', {}, error as Error);
    }
    
    return {
      initialized: this.initialized,
      encryptedKeys,
      unencryptedKeys,
      keyManagerStats: this.initialized ? keyManager.getStats() : {
        totalKeys: 0,
        keysByPurpose: {},
        oldestKey: null,
        newestKey: null
      }
    };
  }

  /**
   * Clean up old encrypted data and keys
   */
  async cleanup(retentionDays: number = 90): Promise<void> {
    if (this.initialized) {
      await keyManager.cleanupOldKeys(retentionDays);
    }
  }
}

/**
 * Factory function to create encrypted storage adapter
 */
export function createEncryptedStorageAdapter(baseAdapter: StorageAdapter): EncryptedStorageAdapter {
  return new EncryptedStorageAdapter(baseAdapter);
}

/**
 * Data type classification for encryption
 */
export const ENCRYPTION_RULES = {
  ALWAYS_ENCRYPT: [
    SENSITIVE_DATA_TYPES.HEALTH_RECORDS,
    SENSITIVE_DATA_TYPES.PAYMENT_INFO,
    SENSITIVE_DATA_TYPES.VET_RECORDS,
    SENSITIVE_DATA_TYPES.MEDICAL_CONDITIONS,
    SENSITIVE_DATA_TYPES.EMERGENCY_CONTACTS,
  ],
  CONDITIONALLY_ENCRYPT: [
    SENSITIVE_DATA_TYPES.PERSONAL_NOTES,
  ],
  NEVER_ENCRYPT: [
    'ui_preferences',
    'theme_settings',
    'display_options',
    'cache_data',
    'public_data',
  ],
} as const;