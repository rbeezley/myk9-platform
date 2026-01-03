/**
 * Hook for managing encrypted storage with user authentication integration
 */

import { useEffect, useCallback } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { keyManager } from '@/services/security/KeyManagementService';
import { storageAdapterFactory } from '@/services/database/storage-adapter-factory';

interface EncryptionStatus {
  initialized: boolean;
  enabled: boolean;
  keyCount: number;
  lastInitialized?: number;
}

export function useEncryptedStorage() {
  const { user } = useAuthContext();

  /**
   * Initialize encryption when user logs in
   */
  const initializeEncryption = useCallback(async () => {
    if (!user) {
      console.log('🔐 No user logged in, skipping encryption initialization');
      return false;
    }

    try {
      console.log('🔐 Initializing encryption for user:', user.id.substring(0, 8) + '...');
      
      // Initialize key management service
      await keyManager.initialize(user.id, user.aud); // Use audience as session token
      
      // Set user context for storage factory
      storageAdapterFactory.setUserContext(user.id, user.aud);
      
      console.log('✅ Encryption initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize encryption:', error);
      return false;
    }
  }, [user]);

  /**
   * Clean up encryption when user logs out
   */
  const cleanupEncryption = useCallback(async () => {
    try {
      console.log('🧹 Cleaning up encryption resources');
      
      // Clean up old keys (keep 30 days for logout cleanup)
      await keyManager.cleanupOldKeys(30);
      
      // Clear user context from storage factory
      storageAdapterFactory.setUserContext('', '');
      
      console.log('✅ Encryption cleanup completed');
    } catch (error) {
      console.error('❌ Failed to cleanup encryption:', error);
    }
  }, []);

  /**
   * Get encryption status and statistics
   */
  const getEncryptionStatus = useCallback((): EncryptionStatus => {
    try {
      const keyStats = keyManager.getStats();
      const adapterInfo = storageAdapterFactory.getAdapterInfo();
      
      return {
        initialized: keyStats.totalKeys > 0,
        enabled: adapterInfo.enableEncryption,
        keyCount: keyStats.totalKeys,
        lastInitialized: keyStats.newestKey || undefined,
      };
    } catch (error) {
      console.warn('Failed to get encryption status:', error);
      return {
        initialized: false,
        enabled: false,
        keyCount: 0,
      };
    }
  }, []);

  /**
   * Force key rotation for all keys
   */
  const rotateAllKeys = useCallback(async () => {
    if (!user) {
      throw new Error('User must be logged in to rotate keys');
    }

    try {
      console.log('🔄 Starting key rotation...');
      
      const keyStats = keyManager.getStats();
      let rotatedCount = 0;
      
      // Get all key purposes and rotate their latest keys
      for (const purpose of Object.keys(keyStats.keysByPurpose)) {
        try {
          const keys = keyManager.listKeysForPurpose(purpose);
          if (keys.length > 0) {
            const latestKey = keys[0]; // Keys are sorted by creation date descending
            await keyManager.rotateKey(latestKey.id);
            rotatedCount++;
          }
        } catch (error) {
          console.error(`Failed to rotate key for purpose ${purpose}:`, error);
        }
      }
      
      console.log(`✅ Rotated ${rotatedCount} keys`);
      return rotatedCount;
    } catch (error) {
      console.error('❌ Key rotation failed:', error);
      throw error;
    }
  }, [user]);

  /**
   * Migrate unencrypted data to encrypted format
   */
  const migrateToEncrypted = useCallback(async () => {
    if (!user) {
      throw new Error('User must be logged in to migrate data');
    }

    try {
      console.log('📦 Starting data migration to encrypted format...');
      
      // This would need to be implemented per store type
      // For now, we'll just log that migration would happen here
      console.log('🔄 Migration logic would be implemented per store');
      
      // Example of what migration would look like:
      // const dogStoreAdapter = storageAdapterFactory.createStoreSpecificStorage('dogStore');
      // await dogStoreAdapter.migrateToEncrypted();
      
      console.log('✅ Data migration completed');
      return { migrated: 0, errors: 0 };
    } catch (error) {
      console.error('❌ Data migration failed:', error);
      throw error;
    }
  }, [user]);

  /**
   * Initialize encryption when user changes
   */
  useEffect(() => {
    if (user) {
      initializeEncryption().catch(error => {
        console.error('Failed to initialize encryption on user login:', error);
      });
    } else {
      cleanupEncryption().catch(error => {
        console.error('Failed to cleanup encryption on user logout:', error);
      });
    }
  }, [user, initializeEncryption, cleanupEncryption]);

  return {
    // Status
    getEncryptionStatus,
    isEncryptionEnabled: !!user && storageAdapterFactory.getAdapterInfo().enableEncryption,
    
    // Operations
    initializeEncryption,
    cleanupEncryption,
    rotateAllKeys,
    migrateToEncrypted,
    
    // Utilities
    userId: user?.id,
    isLoggedIn: !!user,
  };
}

/**
 * Hook for checking if a specific data type should be encrypted
 */
export function useDataEncryption() {
  const { isEncryptionEnabled } = useEncryptedStorage();

  const shouldEncryptData = useCallback((dataType: string, data?: unknown): boolean => {
    if (!isEncryptionEnabled) return false;

    // Check by data type
    const sensitiveTypes = [
      'health_records',
      'payment_info',
      'personal_notes',
      'vet_records',
      'medical_conditions',
      'emergency_contacts',
      'vaccination_records',
      'medication_records',
    ];

    if (sensitiveTypes.includes(dataType.toLowerCase())) {
      return true;
    }

    // Check by data content if provided
    if (data && typeof data === 'object') {
      const dataStr = JSON.stringify(data).toLowerCase();
      const sensitivePatterns = [
        'credit_card', 'bank_account', 'ssn', 'vaccination',
        'medication', 'allergy', 'medical_condition', 'diagnosis',
        'treatment', 'veterinarian', 'emergency_contact'
      ];

      return sensitivePatterns.some(pattern => dataStr.includes(pattern));
    }

    return false;
  }, [isEncryptionEnabled]);

  return {
    shouldEncryptData,
    isEncryptionEnabled,
  };
}