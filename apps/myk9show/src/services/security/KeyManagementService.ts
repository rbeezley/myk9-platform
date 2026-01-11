/**
 * Secure Key Management Service
 * Handles encryption keys, secure storage, and key rotation
 */

import { encryptData, decryptData, generateSecurePassword, hashData } from '@/utils/encryption';
import { logger } from '@/services/LoggingService';

interface KeyMetadata {
  id: string;
  createdAt: number;
  lastUsed: number;
  rotationSchedule: number; // in milliseconds
  purpose: string;
  version: number;
}

interface ManagedKey {
  id: string;
  key: string;
  metadata: KeyMetadata;
}

interface KeyStore {
  [keyId: string]: ManagedKey;
}

export class KeyManagementService {
  private static instance: KeyManagementService;
  private keyStore: KeyStore = {};
  private masterKey: string | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): KeyManagementService {
    if (!KeyManagementService.instance) {
      KeyManagementService.instance = new KeyManagementService();
    }
    return KeyManagementService.instance;
  }

  /**
   * Initialize the key management service with user context
   */
  async initialize(userId: string, sessionToken?: string): Promise<void> {
    try {
      // Generate or retrieve master key for this session
      this.masterKey = await this.deriveMasterKey(userId, sessionToken);
      
      // Load existing keys from secure storage
      await this.loadKeysFromStorage();
      
      // Set up automatic key rotation
      this.scheduleKeyRotation();
      
      this.initialized = true;
      logger.info('Key Management Service initialized', 'security');
    } catch (error) {
      logger.error('Failed to initialize Key Management Service', 'security', {}, error as Error);
      throw new Error('Key management initialization failed');
    }
  }

  /**
   * Generate a secure master key from user context
   */
  private async deriveMasterKey(userId: string, sessionToken?: string): Promise<string> {
    const keyMaterial = `${userId}_${sessionToken || 'default'}_${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
    return await hashData(keyMaterial);
  }

  /**
   * Generate a new encryption key for a specific purpose
   */
  async generateKey(purpose: string, rotationDays: number = 30): Promise<string> {
    this.ensureInitialized();

    const keyId = `${purpose}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const key = generateSecurePassword(64); // 64 character secure key
    
    const managedKey: ManagedKey = {
      id: keyId,
      key,
      metadata: {
        id: keyId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        rotationSchedule: rotationDays * 24 * 60 * 60 * 1000, // Convert days to milliseconds
        purpose,
        version: 1
      }
    };

    this.keyStore[keyId] = managedKey;
    await this.saveKeysToStorage();

    logger.debug('Generated new key', 'security', { purpose, keyId });
    return keyId;
  }

  /**
   * Get a key by ID
   */
  async getKey(keyId: string): Promise<string | null> {
    this.ensureInitialized();

    const managedKey = this.keyStore[keyId];
    if (!managedKey) {
      logger.warn('Key not found', 'security', { keyId });
      return null;
    }

    // Update last used timestamp
    managedKey.metadata.lastUsed = Date.now();
    await this.saveKeysToStorage();

    return managedKey.key;
  }

  /**
   * Get the latest key for a specific purpose
   */
  async getLatestKeyForPurpose(purpose: string): Promise<string | null> {
    this.ensureInitialized();

    const purposeKeys = Object.values(this.keyStore)
      .filter(key => key.metadata.purpose === purpose)
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);

    if (purposeKeys.length === 0) {
      // Generate a new key for this purpose
      const newKeyId = await this.generateKey(purpose);
      return await this.getKey(newKeyId);
    }

    return purposeKeys[0].key;
  }

  /**
   * Rotate a key (generate new version)
   */
  async rotateKey(keyId: string): Promise<string> {
    this.ensureInitialized();

    const oldKey = this.keyStore[keyId];
    if (!oldKey) {
      throw new Error(`Cannot rotate - key not found: ${keyId}`);
    }

    // Generate new key with incremented version
    const newKeyId = `${oldKey.metadata.purpose}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const newKey = generateSecurePassword(64);

    const managedKey: ManagedKey = {
      id: newKeyId,
      key: newKey,
      metadata: {
        ...oldKey.metadata,
        id: newKeyId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        version: oldKey.metadata.version + 1
      }
    };

    this.keyStore[newKeyId] = managedKey;
    
    // Mark old key as deprecated (don't delete yet for decryption compatibility)
    oldKey.metadata.rotationSchedule = 0; // Disable auto-rotation

    await this.saveKeysToStorage();

    logger.info('Rotated key', 'security', { oldKeyId: keyId, newKeyId });
    return newKeyId;
  }

  /**
   * Delete a key (use with caution)
   */
  async deleteKey(keyId: string): Promise<void> {
    this.ensureInitialized();

    if (this.keyStore[keyId]) {
      delete this.keyStore[keyId];
      await this.saveKeysToStorage();
      logger.debug('Deleted key', 'security', { keyId });
    }
  }

  /**
   * List all keys for a specific purpose
   */
  listKeysForPurpose(purpose: string): KeyMetadata[] {
    this.ensureInitialized();

    return Object.values(this.keyStore)
      .filter(key => key.metadata.purpose === purpose)
      .map(key => key.metadata)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Check if keys need rotation and perform automatic rotation
   */
  private async checkAndRotateKeys(): Promise<void> {
    const now = Date.now();
    const keysToRotate: string[] = [];

    for (const [keyId, managedKey] of Object.entries(this.keyStore)) {
      if (managedKey.metadata.rotationSchedule > 0) {
        const nextRotation = managedKey.metadata.createdAt + managedKey.metadata.rotationSchedule;
        if (now >= nextRotation) {
          keysToRotate.push(keyId);
        }
      }
    }

    if (keysToRotate.length > 0) {
      logger.info('Auto-rotating keys', 'security', { count: keysToRotate.length });
      for (const keyId of keysToRotate) {
        try {
          await this.rotateKey(keyId);
        } catch (error) {
          logger.error('Failed to rotate key', 'security', { keyId }, error as Error);
        }
      }
    }
  }

  /**
   * Schedule periodic key rotation checks
   */
  private scheduleKeyRotation(): void {
    // Check for key rotation every hour
    setInterval(() => {
      this.checkAndRotateKeys().catch(error => {
        logger.error('Key rotation check failed', 'security', {}, error as Error);
      });
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Save keys to encrypted storage
   */
  private async saveKeysToStorage(): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    try {
      const keyStoreData = JSON.stringify(this.keyStore);
      const encrypted = await encryptData(keyStoreData, this.masterKey);
      localStorage.setItem('myk9show_keystore', JSON.stringify(encrypted));
    } catch (error) {
      logger.error('Failed to save keys to storage', 'security', {}, error as Error);
      throw new Error('Key storage failed');
    }
  }

  /**
   * Load keys from encrypted storage
   */
  private async loadKeysFromStorage(): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Master key not available');
    }

    try {
      const stored = localStorage.getItem('myk9show_keystore');
      if (!stored) {
        logger.debug('No existing key store found', 'security');
        return;
      }

      const encrypted = JSON.parse(stored);
      const decrypted = await decryptData(encrypted, this.masterKey);
      this.keyStore = JSON.parse(decrypted);

      logger.info('Loaded keys from storage', 'security', { count: Object.keys(this.keyStore).length });
    } catch (error) {
      logger.warn('Failed to load keys from storage (may be first run)', 'security', {}, error as Error);
      // Reset key store if loading fails
      this.keyStore = {};
    }
  }

  /**
   * Clear all keys and reset the service
   */
  async clearAllKeys(): Promise<void> {
    this.keyStore = {};
    localStorage.removeItem('myk9show_keystore');
    logger.info('All keys cleared', 'security');
  }

  /**
   * Ensure the service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.masterKey) {
      throw new Error('Key Management Service not initialized. Call initialize() first.');
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalKeys: number;
    keysByPurpose: Record<string, number>;
    oldestKey: number | null;
    newestKey: number | null;
  } {
    const keys = Object.values(this.keyStore);
    const keysByPurpose: Record<string, number> = {};

    keys.forEach(key => {
      keysByPurpose[key.metadata.purpose] = (keysByPurpose[key.metadata.purpose] || 0) + 1;
    });

    const timestamps = keys.map(key => key.metadata.createdAt);

    return {
      totalKeys: keys.length,
      keysByPurpose,
      oldestKey: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestKey: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  /**
   * Cleanup old keys that are no longer needed
   */
  async cleanupOldKeys(retentionDays: number = 90): Promise<number> {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const keysToDelete: string[] = [];

    for (const [keyId, managedKey] of Object.entries(this.keyStore)) {
      // Only cleanup deprecated keys (rotation schedule = 0) that are old
      if (managedKey.metadata.rotationSchedule === 0 && 
          managedKey.metadata.lastUsed < cutoffTime) {
        keysToDelete.push(keyId);
      }
    }

    for (const keyId of keysToDelete) {
      await this.deleteKey(keyId);
    }

    logger.info('Cleaned up old keys', 'security', { count: keysToDelete.length });
    return keysToDelete.length;
  }
}

// Export singleton instance
export const keyManager = KeyManagementService.getInstance();

// Key purpose constants
export const KEY_PURPOSES = {
  HEALTH_RECORDS: 'health_records',
  PAYMENT_DATA: 'payment_data',
  PERSONAL_NOTES: 'personal_notes',
  VET_RECORDS: 'vet_records',
  MEDICAL_CONDITIONS: 'medical_conditions',
  EMERGENCY_CONTACTS: 'emergency_contacts',
  SESSION_DATA: 'session_data',
  USER_PREFERENCES: 'user_preferences',
} as const;

export type KeyPurpose = typeof KEY_PURPOSES[keyof typeof KEY_PURPOSES];