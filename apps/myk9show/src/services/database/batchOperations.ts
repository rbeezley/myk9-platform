// Batch Operations for Enhanced Performance - Phase 2.7: Production Enhancements
// Provides optimized batch operations for all core stores

import { supabase, createDatabaseError, type DatabaseError } from './supabaseClient';
import type { 
  DbDogInsert, DbDogUpdate,
  DbUserInsert, DbUserUpdate,
  DbShowInsert,
  DbClassInsert,
  DbEntryInsert
} from '@/types/database-mappings';

// ===== GENERIC BATCH UTILITIES =====

export interface BatchResult<T> {
  success: boolean;
  data?: T;
  error?: DatabaseError;
  index: number; // Original index in batch for tracking
}

export interface BatchOperationOptions {
  continueOnError?: boolean; // Continue processing if individual operations fail
  maxConcurrency?: number; // Limit concurrent operations (default: 10)
  validateBefore?: boolean; // Validate data before executing (default: true)
  retryFailures?: boolean; // Retry failed operations once (default: false)
}

/**
 * Enhanced batch executor with concurrency control and error handling
 */
export const executeBatchWithOptions = async <T>(
  operations: Array<() => Promise<T> | PromiseLike<T>>,
  options: BatchOperationOptions = {}
): Promise<BatchResult<T>[]> => {
  const {
    continueOnError = true,
    maxConcurrency = 10,
    retryFailures = false
  } = options;

  // Process in chunks to control concurrency
  const chunks = [];
  for (let i = 0; i < operations.length; i += maxConcurrency) {
    chunks.push(operations.slice(i, i + maxConcurrency));
  }

  const results: BatchResult<T>[] = [];
  let currentIndex = 0;

  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async (operation, localIndex) => {
      const globalIndex = currentIndex + localIndex;
      try {
        const data = await operation();
        return { success: true, data, index: globalIndex } as BatchResult<T>;
      } catch (error) {
        const result: BatchResult<T> = {
          success: false,
          error: createDatabaseError(error),
          index: globalIndex
        };

        // Retry logic
        if (retryFailures) {
          try {
            const retryData = await operation();
            return { success: true, data: retryData, index: globalIndex } as BatchResult<T>;
          } catch (retryError) {
            result.error = createDatabaseError(retryError);
          }
        }

        if (!continueOnError) {
          throw result.error;
        }
        
        return result;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    currentIndex += chunk.length;
  }

  return results;
};

// ===== DOG BATCH OPERATIONS =====

/**
 * Batch create multiple dogs
 */
export const batchCreateDogs = async (
  dogsData: DbDogInsert[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = dogsData.map(dogData => async () => {
    const { data, error } = await supabase
      .from('dog')
      .insert([{
        ...dogData,
        created_at: new Date().toISOString(),
      }])
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

/**
 * Batch update multiple dogs
 */
export const batchUpdateDogs = async (
  updates: Array<{ id: string; updates: DbDogUpdate }>,
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = updates.map(({ id, updates: updateData }) => async () => {
    const { data, error } = await supabase
      .from('dog')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

/**
 * Batch delete multiple dogs
 */
export const batchDeleteDogs = async (
  ids: string[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = ids.map(id => async () => {
    const { data, error } = await supabase
      .from('dog')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

// ===== USER BATCH OPERATIONS =====

/**
 * Batch create multiple users
 */
export const batchCreateUsers = async (
  usersData: DbUserInsert[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = usersData.map(userData => async () => {
    const { data, error } = await supabase
      .from('user')
      .insert([{
        ...userData,
        created_at: new Date().toISOString(),
      }])
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

/**
 * Batch update multiple users
 */
export const batchUpdateUsers = async (
  updates: Array<{ id: string; updates: DbUserUpdate }>,
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = updates.map(({ id, updates: updateData }) => async () => {
    const { data, error } = await supabase
      .from('user')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

// ===== SHOW BATCH OPERATIONS =====

/**
 * Batch create multiple shows
 */
export const batchCreateShows = async (
  showsData: DbShowInsert[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = showsData.map(showData => async () => {
    const { data, error } = await supabase
      .from('show')
      .insert([{
        ...showData,
        created_at: new Date().toISOString(),
      }])
      .select(`
        *,
        club:club_id (
          id,
          name,
          location
        )
      `)
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

// ===== CLASS BATCH OPERATIONS =====

/**
 * Batch create multiple classes
 */
export const batchCreateClasses = async (
  classesData: DbClassInsert[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = classesData.map(classData => async () => {
    const { data, error } = await supabase
      .from('class')
      .insert([{
        ...classData,
        created_at: new Date().toISOString(),
      }])
      .select(`
        *,
        trial:trial_id (
          id,
          name,
          date
        )
      `)
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

// ===== ENTRY BATCH OPERATIONS =====

/**
 * Batch create multiple entries
 */
export const batchCreateEntries = async (
  entriesData: DbEntryInsert[],
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = entriesData.map(entryData => async () => {
    const { data, error } = await supabase
      .from('entry')
      .insert([{
        ...entryData,
        created_at: new Date().toISOString(),
      }])
      .select(`
        *,
        dog:dog_id (
          id,
          name,
          breed
        ),
        class:class_id (
          id,
          name,
          level
        )
      `)
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

/**
 * Batch update entry statuses (common operation during shows)
 */
export const batchUpdateEntryStatuses = async (
  updates: Array<{ id: string; status: string; score?: string; time?: number; placement?: string }>,
  options?: BatchOperationOptions
): Promise<BatchResult<unknown>[]> => {
  const operations = updates.map(({ id, status }) => async () => {
    const { data, error } = await supabase
      .from('entry')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, options);
};

// ===== UTILITY FUNCTIONS =====

/**
 * Validate batch operation results and return summary
 */
export const getBatchSummary = <T>(results: BatchResult<T>[]) => {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length > 0 ? (successful.length / results.length) * 100 : 0,
    failures: failed.map(f => ({
      index: f.index,
      error: f.error?.message || 'Unknown error'
    }))
  };
};

/**
 * Retry only failed operations from a previous batch
 */
export const retryFailedOperations = async <T>(
  originalOperations: Array<() => Promise<T> | PromiseLike<T>>,
  previousResults: BatchResult<T>[],
  options?: BatchOperationOptions
): Promise<BatchResult<T>[]> => {
  const failedIndexes = previousResults
    .filter(r => !r.success)
    .map(r => r.index);
  
  const retryOperations = failedIndexes.map(index => originalOperations[index]);
  
  return executeBatchWithOptions(retryOperations, {
    ...options,
    retryFailures: false // Avoid double retry
  });
};

/**
 * Chunked upsert for large datasets
 */
export const chunkedUpsert = async <T>(
  tableName: string,
  data: T[],
  chunkSize: number = 100,
  conflictColumn: string = 'id'
): Promise<BatchResult<unknown[]>[]> => {
  const chunks = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  const operations = chunks.map(chunk => async () => {
    const { data, error } = await supabase
      .from(tableName as never) // Type casting for dynamic table names
      .upsert(chunk as never[], { onConflict: conflictColumn })
      .select('*');
    
    if (error) throw error;
    return data;
  });

  return executeBatchWithOptions(operations, {
    maxConcurrency: 5, // Lower concurrency for large operations
    continueOnError: true,
    retryFailures: true
  });
};