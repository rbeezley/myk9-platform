/**
 * Data encryption utilities for sensitive local storage
 * Uses Web Crypto API for secure encryption/decryption
 */

import { logger } from '@/services/LoggingService';

interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
}

interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
}

const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  ivLength: 12,
  saltLength: 16,
  iterations: 100000,
};

/**
 * Generate a cryptographic key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: DEFAULT_CONFIG.iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: DEFAULT_CONFIG.algorithm,
      length: DEFAULT_CONFIG.keyLength,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data using AES-GCM
 */
export async function encryptData(
  data: string, 
  password: string
): Promise<EncryptedData> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(DEFAULT_CONFIG.saltLength));
    const iv = crypto.getRandomValues(new Uint8Array(DEFAULT_CONFIG.ivLength));
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: DEFAULT_CONFIG.algorithm,
        iv: iv,
      },
      key,
      dataBuffer
    );
    
    // Convert to base64 for storage
    return {
      data: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      iv: btoa(String.fromCharCode(...iv)),
      salt: btoa(String.fromCharCode(...salt)),
    };
  } catch (error) {
    logger.error('Encryption failed', 'encryption', {}, error as Error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data using AES-GCM
 */
export async function decryptData(
  encryptedData: EncryptedData, 
  password: string
): Promise<string> {
  try {
    // Convert from base64
    const data = new Uint8Array(atob(encryptedData.data).split('').map(c => c.charCodeAt(0)));
    const iv = new Uint8Array(atob(encryptedData.iv).split('').map(c => c.charCodeAt(0)));
    const salt = new Uint8Array(atob(encryptedData.salt).split('').map(c => c.charCodeAt(0)));
    
    // Derive key from password and salt
    const key = await deriveKey(password, salt);
    
    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: DEFAULT_CONFIG.algorithm,
        iv: iv,
      },
      key,
      data
    );
    
    // Convert back to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    logger.error('Decryption failed', 'encryption', {}, error as Error);
    throw new Error('Failed to decrypt data - incorrect password or corrupted data');
  }
}

/**
 * Generate a secure random password for encryption
 */
export function generateSecurePassword(length: number = 32): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

/**
 * Hash data using SHA-256 (for integrity checking)
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

/**
 * Verify data integrity using SHA-256 hash
 */
export async function verifyDataIntegrity(data: string, expectedHash: string): Promise<boolean> {
  try {
    const actualHash = await hashData(data);
    return actualHash === expectedHash;
  } catch (error) {
    logger.error('Hash verification failed', 'encryption', {}, error as Error);
    return false;
  }
}

/**
 * Secure storage interface for encrypted data
 */
export class SecureStorage {
  private masterPassword: string;

  constructor(masterPassword: string) {
    this.masterPassword = masterPassword;
  }

  /**
   * Store encrypted data
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      const encrypted = await encryptData(value, this.masterPassword);
      const storageData = {
        ...encrypted,
        timestamp: Date.now(),
        hash: await hashData(value)
      };
      
      localStorage.setItem(`secure_${key}`, JSON.stringify(storageData));
    } catch (error) {
      logger.error('Secure storage setItem failed', 'encryption', {}, error as Error);
      throw new Error('Failed to securely store data');
    }
  }

  /**
   * Retrieve and decrypt data
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const storedData = localStorage.getItem(`secure_${key}`);
      if (!storedData) return null;

      const parsed = JSON.parse(storedData);
      const decrypted = await decryptData(parsed, this.masterPassword);
      
      // Verify data integrity
      if (parsed.hash && !(await verifyDataIntegrity(decrypted, parsed.hash))) {
        logger.warn('Data integrity check failed for key', 'encryption', { key });
        this.removeItem(key); // Remove corrupted data
        return null;
      }

      return decrypted;
    } catch (error) {
      logger.error('Secure storage getItem failed', 'encryption', {}, error as Error);
      return null;
    }
  }

  /**
   * Remove encrypted data
   */
  removeItem(key: string): void {
    localStorage.removeItem(`secure_${key}`);
  }

  /**
   * Clear all secure storage
   */
  clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('secure_')) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * List all secure storage keys
   */
  keys(): string[] {
    const keys = Object.keys(localStorage);
    return keys
      .filter(key => key.startsWith('secure_'))
      .map(key => key.replace('secure_', ''));
  }
}

/**
 * Sensitive data types that should be encrypted
 */
export const SENSITIVE_DATA_TYPES = {
  HEALTH_RECORDS: 'health_records',
  PAYMENT_INFO: 'payment_info',
  PERSONAL_NOTES: 'personal_notes',
  VET_RECORDS: 'vet_records',
  MEDICAL_CONDITIONS: 'medical_conditions',
  EMERGENCY_CONTACTS: 'emergency_contacts',
} as const;

export type SensitiveDataType = typeof SENSITIVE_DATA_TYPES[keyof typeof SENSITIVE_DATA_TYPES];

/**
 * Check if data type should be encrypted
 */
export function isSensitiveData(dataType: string): dataType is SensitiveDataType {
  return Object.values(SENSITIVE_DATA_TYPES).includes(dataType as SensitiveDataType);
}

/**
 * Generate master password for user session
 */
export async function generateMasterPassword(userId: string, sessionId: string): Promise<string> {
  // Combine user ID and session ID for unique master password
  const combined = `${userId}_${sessionId}_${Date.now()}`;
  return await hashData(combined);
}

/**
 * Key derivation for user-specific encryption
 */
export async function deriveUserKey(userId: string, userPassword?: string): Promise<string> {
  const baseKey = userPassword || 'default_key';
  return await hashData(`${userId}_${baseKey}_myk9show`);
}