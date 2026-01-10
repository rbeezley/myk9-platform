/**
 * Secure Storage Utility
 * Provides encrypted storage for sensitive data with fallback mechanisms
 */

import { generateSecureToken, isSecureContext } from '@/config/security';

interface EncryptedData {
  data: string;
  iv: string;
  timestamp: number;
  version: number;
}

interface StorageOptions {
  ttl?: number; // Time to live in milliseconds
  compress?: boolean;
  useSessionStorage?: boolean;
}

/**
 * Secure storage wrapper with encryption
 */
export class SecureStorage {
  private static instance: SecureStorage;
  private encryptionKey: CryptoKey | null = null;
  private keyPromise: Promise<CryptoKey> | null = null;

  private constructor() {}

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  /**
   * Initialize encryption key
   */
  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    if (this.keyPromise) {
      return this.keyPromise;
    }

    this.keyPromise = this.generateEncryptionKey();
    this.encryptionKey = await this.keyPromise;
    return this.encryptionKey;
  }

  private async generateEncryptionKey(): Promise<CryptoKey> {
    if (!isSecureContext()) {
      throw new Error('Encryption requires a secure context (HTTPS)');
    }

    // Get or create a persistent key identifier
    let keyId = localStorage.getItem('_sec_key_id');
    if (!keyId) {
      keyId = generateSecureToken(32);
      localStorage.setItem('_sec_key_id', keyId);
    }

    // Derive key from identifier + user agent (basic fingerprinting)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(keyId + navigator.userAgent),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('myK9Show-salt-v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data
   */
  private async encrypt(plaintext: string): Promise<EncryptedData> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedText
    );

    return {
      data: Array.from(new Uint8Array(ciphertext))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      iv: Array.from(iv)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
      timestamp: Date.now(),
      version: 1
    };
  }

  /**
   * Decrypt data
   */
  private async decrypt(encryptedData: EncryptedData): Promise<string> {
    const key = await this.getEncryptionKey();
    
    const iv = new Uint8Array(
      encryptedData.iv.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
    );
    
    const ciphertext = new Uint8Array(
      encryptedData.data.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Store encrypted data
   */
  async setItem(key: string, value: string, options: StorageOptions = {}): Promise<void> {
    try {
      if (!isSecureContext()) {
        // Fallback to regular storage in non-secure contexts
        const storage = options.useSessionStorage ? sessionStorage : localStorage;
        storage.setItem(key, value);
        return;
      }

      const encrypted = await this.encrypt(value);
      
      // Add TTL if specified
      if (options.ttl) {
        encrypted.timestamp = Date.now() + options.ttl;
      }

      const storage = options.useSessionStorage ? sessionStorage : localStorage;
      storage.setItem(key, JSON.stringify(encrypted));
      
    } catch (error) {
      console.error(`SecureStorage: Failed to encrypt ${key}:`, error);
      // Fallback to regular storage
      const storage = options.useSessionStorage ? sessionStorage : localStorage;
      storage.setItem(key, value);
    }
  }

  /**
   * Retrieve and decrypt data
   */
  async getItem(key: string, options: StorageOptions = {}): Promise<string | null> {
    try {
      const storage = options.useSessionStorage ? sessionStorage : localStorage;
      const stored = storage.getItem(key);
      
      if (!stored) {
        return null;
      }

      // Check if it's encrypted data
      let encryptedData: EncryptedData;
      try {
        encryptedData = JSON.parse(stored);
        if (!encryptedData.data || !encryptedData.iv) {
          // Not encrypted, return as-is
          return stored;
        }
      } catch {
        // Not JSON, return as-is
        return stored;
      }

      // Check TTL
      if (encryptedData.timestamp && encryptedData.timestamp < Date.now()) {
        storage.removeItem(key);
        return null;
      }

      if (!isSecureContext()) {
        return null;
      }

      return await this.decrypt(encryptedData);
      
    } catch (error) {
      console.error(`SecureStorage: Failed to decrypt ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove item
   */
  removeItem(key: string, options: StorageOptions = {}): void {
    const storage = options.useSessionStorage ? sessionStorage : localStorage;
    storage.removeItem(key);
  }

  /**
   * Clear all secure storage items
   */
  clear(): void {
    // Only clear items that look like they might be ours
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('myk9show-') || key.startsWith('_sec_'))) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}

/**
 * Convenience instance
 */
export const secureStorage = SecureStorage.getInstance();

/**
 * Migrate existing localStorage to secure storage
 */
export async function migrateToSecureStorage(keys: string[]): Promise<void> {
  if (!isSecureContext()) {
    return;
  }

  const storage = secureStorage;

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        // Check if already encrypted
        const parsed = JSON.parse(value);
        if (parsed.data && parsed.iv) {
          continue; // Already encrypted
        }
      } catch {
        // Not JSON, proceed with migration
      }

      await storage.setItem(key, value);
    }
  }
}

/**
 * Enhanced storage adapter for Zustand with encryption
 */
export function createSecureStorageAdapter(options: StorageOptions = {}) {
  const storage = secureStorage;
  
  return {
    getItem: async (name: string): Promise<string | null> => {
      return storage.getItem(name, options);
    },
    
    setItem: async (name: string, value: string): Promise<void> => {
      return storage.setItem(name, value, options);
    },
    
    removeItem: (name: string): void => {
      storage.removeItem(name, options);
    }
  };
}