import { logger } from '@/services/LoggingService';
import {
  ShowRegistration, 
  EntryStatus, 
  PaymentStatus,
  migratePaymentStatus,
  isLegacyPaymentStatus
} from '../types/show-registration-types';

/**
 * Utility functions for migrating existing registration data to the new schema
 */

/**
 * Migrates a single registration to the new schema
 */
export function migrateRegistration(registration: unknown): ShowRegistration {
  const reg = registration as Record<string, unknown>;
  
  // Handle payment status migration
  let paymentStatus: PaymentStatus;
  
  if (typeof reg.paymentStatus === 'string') {
    if (isLegacyPaymentStatus(reg.paymentStatus)) {
      paymentStatus = migratePaymentStatus(reg.paymentStatus);
    } else if (Object.values(PaymentStatus).includes(reg.paymentStatus as PaymentStatus)) {
      paymentStatus = reg.paymentStatus as PaymentStatus;
    } else {
      paymentStatus = PaymentStatus.PENDING;
    }
  } else {
    paymentStatus = PaymentStatus.PENDING;
  }

  // Migrate entries to include new fields
  const migratedEntries = (reg.entries as unknown[] || []).map((entry: unknown) => ({
    ...(entry as Record<string, unknown>),
    handler: (entry as Record<string, unknown>).handler || undefined,
    isHandlerValidated: (entry as Record<string, unknown>).isHandlerValidated ?? false,
    handlerOverrideReason: (entry as Record<string, unknown>).handlerOverrideReason || undefined,
    armbandAssignment: (entry as Record<string, unknown>).armbandAssignment || undefined
  }));

  // Build the migrated registration
  const migrated: ShowRegistration = {
    ...reg,
    paymentStatus,
    entryStatus: reg.entryStatus || EntryStatus.PENDING,
    entries: migratedEntries,
    statusHistory: reg.statusHistory || [],
    createdByUserId: reg.createdByUserId || reg.userId,
    lastModifiedByUserId: reg.lastModifiedByUserId || reg.userId
  } as ShowRegistration;

  return migrated;
}

/**
 * Batch migrates an array of registrations
 */
export function migrateRegistrations(registrations: unknown[]): ShowRegistration[] {
  return registrations.map(migrateRegistration);
}

/**
 * Checks if a registration needs migration
 */
export function needsMigration(registration: unknown): boolean {
  const registrationRecord = registration as Record<string, unknown>;
  // Check if payment status needs migration
  if (typeof registrationRecord.paymentStatus === 'string' && 
      isLegacyPaymentStatus(registrationRecord.paymentStatus)) {
    return true;
  }

  // Check if missing new required fields
  if (!registrationRecord.entryStatus || 
      !registrationRecord.statusHistory ||
      !registrationRecord.createdByUserId) {
    return true;
  }

  // Check if any entry is missing new fields
  const entriesNeedMigration = (registrationRecord.entries as unknown[] || []).some((entry: unknown) => 
    (entry as Record<string, unknown>).isHandlerValidated === undefined
  );

  return entriesNeedMigration;
}

/**
 * Creates a backup of registrations before migration
 */
export function createBackup(registrations: unknown[]): string {
  const backup = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: registrations
  };
  
  return JSON.stringify(backup, null, 2);
}

/**
 * Validates migrated data integrity
 */
export function validateMigration(original: unknown[], migrated: ShowRegistration[]): boolean {
  // Check that we have the same number of registrations
  if (original.length !== migrated.length) {
    logger.error('Migration error: Registration count mismatch', 'lib', {});
    return false;
  }

  // Check that all IDs are preserved
  const originalIds = new Set(original.map(r => (r as Record<string, unknown>).id));
  const migratedIds = new Set(migrated.map(r => r.id));
  
  if (originalIds.size !== migratedIds.size) {
    logger.error('Migration error: ID mismatch', 'lib', {});
    return false;
  }

  // Check that critical data is preserved
  for (let i = 0; i < original.length; i++) {
    const orig = original[i] as Record<string, unknown>;
    const mig = migrated[i];
    
    if (orig.id !== mig.id || 
        orig.showId !== mig.showId || 
        orig.userId !== mig.userId ||
        (orig.entries as unknown[]).length !== mig.entries.length) {
      logger.error(`Migration error: Data mismatch for registration ${orig.id}`, 'lib', {});
      return false;
    }
  }

  return true;
}

/**
 * Run the migration with safety checks
 */
export async function runMigrationSafely(
  registrations: unknown[], 
  onBackup?: (backup: string) => void
): Promise<{ success: boolean; data?: ShowRegistration[]; error?: string }> {
  try {
    // Create backup
    const backup = createBackup(registrations);
    if (onBackup) {
      onBackup(backup);
    }

    // Perform migration
    const migrated = migrateRegistrations(registrations);

    // Validate
    if (!validateMigration(registrations, migrated)) {
      return { 
        success: false, 
        error: 'Migration validation failed' 
      };
    }

    return { 
      success: true, 
      data: migrated 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown migration error' 
    };
  }
}