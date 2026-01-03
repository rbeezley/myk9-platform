/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Migration utility to replace TODO auth placeholders with proper implementations
 * Run this during app initialization to clean up auth-related technical debt
 */

import { LoggingService } from '@/services/LoggingService';
import { getCurrentUserInfo } from '@/utils/authHelpers';

const logger = LoggingService.getInstance();

interface TodoMigrationResult {
  totalFound: number;
  totalMigrated: number;
  errors: string[];
}

/**
 * Migration patterns for common TODO items
 */
const MIGRATION_PATTERNS = {
  // Auth context placeholders
  'current-user': () => getCurrentUserInfo().id,
  'Current Judge': () => getCurrentUserInfo().name,
  'admin@example.com': () => getCurrentUserInfo().email,
  
  // Common placeholder values
  'TODO: Get from auth context': () => getCurrentUserInfo().email,
  'TODO: Get actual user': () => getCurrentUserInfo().email,
  'TODO: Replace with actual user': () => getCurrentUserInfo().email,
} as const;

/**
 * Migrate auth-related TODO items in localStorage data
 */
export async function migrateStoredAuthTodos(): Promise<TodoMigrationResult> {
  const result: TodoMigrationResult = {
    totalFound: 0,
    totalMigrated: 0,
    errors: []
  };

  try {
    logger.info('Starting auth TODO migration for stored data', 'authMigration');
    
    // Get all localStorage keys that might contain our app data
    const appKeys = Object.keys(localStorage).filter(key => 
      key.includes('myk9show') || 
      key.includes('store') || 
      key.includes('template')
    );

    for (const key of appKeys) {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        let data;
        try {
          data = JSON.parse(stored);
        } catch {
          // Not JSON, skip
          continue;
        }

        const { modified, count } = migrateObjectAuthTodos(data);
        
        if (modified) {
          localStorage.setItem(key, JSON.stringify(data));
          result.totalMigrated += count;
          logger.debug(`Migrated ${count} auth TODOs in ${key}`, 'authMigration');
        }
        
        result.totalFound += count;

      } catch (error) {
        const errorMsg = `Failed to migrate ${key}: ${error}`;
        result.errors.push(errorMsg);
        logger.error(errorMsg, 'authMigration', { key, error });
      }
    }

    logger.info('Auth TODO migration completed', 'authMigration', {
      totalFound: result.totalFound,
      totalMigrated: result.totalMigrated,
      errors: result.errors.length
    });

  } catch (error) {
    const errorMsg = `Auth migration failed: ${error}`;
    result.errors.push(errorMsg);
    logger.error(errorMsg, 'authMigration', { error });
  }

  return result;
}

/**
 * Recursively migrate auth TODOs in an object
 */
function migrateObjectAuthTodos(obj: any): { modified: boolean; count: number } {
  let modified = false;
  let count = 0;

  if (!obj || typeof obj !== 'object') {
    return { modified, count };
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = migrateObjectAuthTodos(obj[i]);
      if (result.modified) modified = true;
      count += result.count;
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      // Check if this property needs migration
      if (typeof value === 'string' && value in MIGRATION_PATTERNS) {
        const migrationFn = MIGRATION_PATTERNS[value as keyof typeof MIGRATION_PATTERNS];
        obj[key] = migrationFn();
        modified = true;
        count++;
      } else if (typeof value === 'object' && value !== null) {
        const result = migrateObjectAuthTodos(value);
        if (result.modified) modified = true;
        count += result.count;
      }
    }
  }

  return { modified, count };
}

/**
 * Update auth fields in runtime objects
 */
export function updateAuthFields(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const userInfo = getCurrentUserInfo();
  
  // Common auth field mappings
  const authFieldMappings = {
    '_lastModifiedBy': userInfo.email,
    'lastModifiedBy': userInfo.email,
    'createdBy': userInfo.email,
    'userId': userInfo.id,
    'recordedBy': userInfo.email,
    'deletedBy': userInfo.email
  };

  if (Array.isArray(obj)) {
    return obj.map(updateAuthFields);
  }

  const updated = { ...obj };
  
  for (const [field, value] of Object.entries(authFieldMappings)) {
    if (field in updated && (
      updated[field] === 'current-user' ||
      updated[field] === 'admin@example.com' ||
      updated[field] === 'Current Judge' ||
      typeof updated[field] === 'string' && updated[field].includes('TODO')
    )) {
      updated[field] = value;
    }
  }

  // Recursively update nested objects
  for (const [key, value] of Object.entries(updated)) {
    if (typeof value === 'object' && value !== null) {
      updated[key] = updateAuthFields(value);
    }
  }

  return updated;
}

/**
 * Validate that auth migration was successful
 */
export function validateAuthMigration(): boolean {
  try {
    const appKeys = Object.keys(localStorage).filter(key => 
      key.includes('myk9show') || 
      key.includes('store') || 
      key.includes('template')
    );

    let foundTodos = 0;
    
    for (const key of appKeys) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;

      try {
        const data = JSON.parse(stored);
        const dataString = JSON.stringify(data);
        
        // Check for remaining TODO patterns
        const todoPatterns = [
          'TODO: Get from auth context',
          'TODO: Get actual user',
          'TODO: Replace with actual user',
          '"current-user"',
          '"Current Judge"'
        ];

        for (const pattern of todoPatterns) {
          if (dataString.includes(pattern)) {
            foundTodos++;
            logger.warn(`Found remaining TODO in ${key}`, 'authMigration', { pattern });
          }
        }
      } catch {
        // Not JSON, skip
      }
    }

    const success = foundTodos === 0;
    logger.info('Auth migration validation completed', 'authMigration', { 
      success, 
      remainingTodos: foundTodos 
    });
    
    return success;
    
  } catch (error) {
    logger.error('Auth migration validation failed', 'authMigration', { error });
    return false;
  }
}

/**
 * Run complete auth migration process
 */
export async function runAuthMigration(): Promise<boolean> {
  try {
    logger.info('Starting complete auth migration process', 'authMigration');
    
    // Step 1: Migrate stored data
    const migrationResult = await migrateStoredAuthTodos();
    
    if (migrationResult.errors.length > 0) {
      logger.warn('Auth migration completed with errors', 'authMigration', {
        errors: migrationResult.errors
      });
    }
    
    // Step 2: Validate migration
    const validationSuccess = validateAuthMigration();
    
    // Step 3: Log summary
    logger.info('Auth migration process completed', 'authMigration', {
      found: migrationResult.totalFound,
      migrated: migrationResult.totalMigrated,
      errors: migrationResult.errors.length,
      validationPassed: validationSuccess
    });
    
    return validationSuccess && migrationResult.errors.length === 0;
    
  } catch (error) {
    logger.error('Auth migration process failed', 'authMigration', { error });
    return false;
  }
}