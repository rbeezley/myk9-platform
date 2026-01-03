/**
 * Example usage of DifferentialSyncService for Phase 5.1.2
 * Demonstrates integration with existing sync infrastructure
 */

import { differentialSync } from '../services/sync/DifferentialSyncService';
// import { syncService } from '../services/sync/syncService';
import { eventEmitter } from '../services/sync/eventEmitter';
import { SyncableEntity } from '../types/sync-types';
import { DeltaAlgorithm, DeltaCompressionType } from '../types/performance-types';

// For demo purposes, we'll define basic types
interface Dog extends SyncableEntity {
  name: string;
  breed: string;
  registration: {
    number: string;
    organization: string;
  };
  owner: {
    id: string;
    name: string;
  };
  birthDate: string;
  color: string;
  sex: string;
  [key: string]: unknown;
}

/**
 * Example: Optimized dog profile sync with delta compression
 */
export async function syncDogProfileOptimized(
  originalDog: Dog,
  modifiedDog: Dog
): Promise<{ success: boolean; bandwidth: number; duration: number }> {
  const startTime = performance.now();
  let bandwidth = 0;

  try {
    // Calculate delta with compression and checksums
    const delta = await differentialSync.calculateDelta(originalDog, modifiedDog, {
      algorithm: 'json-patch',
      compressionType: 'gzip',
      includeChecksum: true,
      maxDeltaSize: 500 * 1024 // 500KB max delta size
    });

    console.log(`Delta calculated: ${delta.operations.length} operations`);
    console.log(`Compression ratio: ${delta.compressionRatio?.toFixed(2) || 'N/A'}`);

    // Simulate network transmission (would be actual API call)
    const deltaPayload = JSON.stringify(delta);
    bandwidth = deltaPayload.length;

    // On the receiving end, apply the delta
    const reconstructedDog = await differentialSync.applyDelta(originalDog, delta, {
      validateChecksum: true,
      rollbackOnError: true
    });

    // Verify reconstruction
    const isEqual = JSON.stringify(reconstructedDog) === JSON.stringify(modifiedDog);
    
    console.log(`Sync completed. Bandwidth used: ${bandwidth} bytes`);
    console.log(`Reconstruction successful: ${isEqual}`);

    return {
      success: isEqual,
      bandwidth,
      duration: performance.now() - startTime
    };
  } catch (error) {
    console.error('Delta sync failed:', error);
    return {
      success: false,
      bandwidth,
      duration: performance.now() - startTime
    };
  }
}

/**
 * Example: Batch sync with differential updates
 */
export async function batchSyncWithDeltas(
  entities: { original: Record<string, unknown>; modified: Record<string, unknown>; type: string; id: string }[]
): Promise<void> {
  const deltas = [];
  let totalBandwidthSaved = 0;

  for (const entity of entities) {
    try {
      // Calculate delta for each entity
      const delta = await differentialSync.calculateDelta(
        entity.original as unknown as SyncableEntity, 
        entity.modified as unknown as SyncableEntity,
        {
          algorithm: 'custom', // Use custom algorithm for better entity-specific optimization
          compressionType: 'gzip',
          includeChecksum: true
        }
      );

      // Calculate bandwidth savings vs full sync
      const fullSize = JSON.stringify(entity.modified).length;
      const deltaSize = JSON.stringify(delta).length;
      const savings = fullSize - deltaSize;
      totalBandwidthSaved += savings;

      deltas.push(delta);

      console.log(`Entity ${entity.id}: ${savings} bytes saved (${(savings/fullSize*100).toFixed(1)}%)`);
    } catch (error) {
      console.error(`Failed to create delta for ${entity.id}:`, error);
      // Fall back to full sync for this entity
    }
  }

  console.log(`Total bandwidth saved: ${totalBandwidthSaved} bytes across ${deltas.length} entities`);

  // Send deltas to server (simulated)
  await simulateBatchDeltaUpload(deltas);
}

/**
 * Example: Conflict-aware sync with automatic resolution
 */
export async function conflictAwareDeltaSync(
  localVersion: Record<string, unknown>,
  remoteVersion: Record<string, unknown>,
  baseVersion: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    // Calculate what changed locally and remotely
    const localDelta = await differentialSync.calculateDelta(baseVersion as unknown as SyncableEntity, localVersion as unknown as SyncableEntity);
    const remoteDelta = await differentialSync.calculateDelta(baseVersion as unknown as SyncableEntity, remoteVersion as unknown as SyncableEntity);

    console.log(`Local changes: ${localDelta.operations.length} operations`);
    console.log(`Remote changes: ${remoteDelta.operations.length} operations`);

    // Check for conflicts
    const localPaths = new Set(localDelta.operations.map(op => op.path));
    const remotePaths = new Set(remoteDelta.operations.map(op => op.path));
    const conflictPaths = Array.from(localPaths).filter(path => remotePaths.has(path));

    if (conflictPaths.length > 0) {
      console.log(`Conflicts detected on paths: ${conflictPaths.join(', ')}`);
      
      // Use differential sync's conflict resolution
      const resolved = await differentialSync.resolveConflict(
        localVersion as unknown as SyncableEntity,
        remoteVersion as unknown as SyncableEntity,
        baseVersion as unknown as SyncableEntity,
        'merge' // Try automatic merge first
      );

      if ((resolved as unknown as { _conflict?: unknown })._conflict) {
        console.log('Manual resolution required');
        // Emit event for UI to handle manual resolution
        eventEmitter.emit('sync:conflict-manual', {
          entityType: (localVersion as unknown as { _type?: string })._type || 'unknown',
          entityId: (localVersion as unknown as { id?: string }).id || 'unknown',
          conflict: resolved
        });
        return {};
      }

      return resolved as unknown as Record<string, unknown>;
    } else {
      // No conflicts, apply both deltas
      let result = await differentialSync.applyDelta(baseVersion as unknown as SyncableEntity, localDelta);
      result = await differentialSync.applyDelta(result as unknown as SyncableEntity, remoteDelta);
      return result as unknown as Record<string, unknown>;
    }
  } catch (error) {
    console.error('Conflict resolution failed:', error);
    throw error;
  }
}

/**
 * Example: Performance monitoring and optimization
 */
export async function monitoredDeltaSync(
  original: Record<string, unknown>,
  modified: Record<string, unknown>,
  entityType: string
): Promise<void> {
  // Test different algorithms and find the best one
  const algorithms: Array<{ algorithm: string; compression: string }> = [
    { algorithm: 'json-patch', compression: 'none' },
    { algorithm: 'json-patch', compression: 'gzip' },
    { algorithm: 'custom', compression: 'none' },
    { algorithm: 'custom', compression: 'gzip' },
    { algorithm: 'binary-diff', compression: 'gzip' }
  ];

  const results = [];

  for (const config of algorithms) {
    try {
      const startTime = performance.now();
      
      const delta = await differentialSync.calculateDelta(original as unknown as SyncableEntity, modified as unknown as SyncableEntity, {
        algorithm: config.algorithm as DeltaAlgorithm,
        compressionType: config.compression as DeltaCompressionType
      });

      const deltaSize = JSON.stringify(delta).length;
      const duration = performance.now() - startTime;

      results.push({
        algorithm: config.algorithm,
        compression: config.compression,
        size: deltaSize,
        duration,
        operations: delta.operations.length,
        compressionRatio: delta.compressionRatio || 1
      });

      console.log(`${config.algorithm}+${config.compression}: ${deltaSize} bytes, ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error(`Failed ${config.algorithm}+${config.compression}:`, error);
    }
  }

  // Find the most efficient combination
  const best = results.reduce((best, current) => {
    const bestScore = best.size * best.duration;
    const currentScore = current.size * current.duration;
    return currentScore < bestScore ? current : best;
  });

  console.log(`Best configuration for ${entityType}:`, best);

  // Get performance statistics
  const stats = differentialSync.getPerformanceStats();
  if (stats) {
    console.log('Overall performance stats:', {
      totalOperations: stats.totalOperations,
      averageDuration: stats.avgDuration,
      minDuration: stats.minDuration,
      maxDuration: stats.maxDuration
    });
  }
}

/**
 * Example: Smart caching with delta validation
 */
export async function smartDeltaCache(
  entities: Record<string, unknown>[],
  cacheKey: string
): Promise<void> {
  // Simulate getting cached versions
  const cachedEntities = await getCachedEntities(cacheKey);
  
  for (const entity of entities) {
    const cached = cachedEntities.find(c => c.id === entity.id);
    
    if (cached) {
      // Calculate delta from cached version
      const delta = await differentialSync.calculateDelta(
        { id: String(cached.id), createdAt: new Date(), updatedAt: new Date(), ...cached } as SyncableEntity, 
        { id: String(entity.id), createdAt: new Date(), updatedAt: new Date(), ...entity } as SyncableEntity, 
        {
          includeChecksum: true
        }
      );

      // Validate the delta before applying
      const validation = await differentialSync.validateDelta(delta);
      
      if (validation.isValid) {
        console.log(`Valid delta for ${entity.id}: ${delta.operations.length} operations`);
        
        // Apply delta to get updated entity
        await differentialSync.applyDelta(
          { id: String(cached.id), createdAt: new Date(), updatedAt: new Date(), ...cached } as SyncableEntity, 
          delta
        );
        
        // Update cache
        await updateCacheEntity();
      } else {
        console.warn(`Invalid delta for ${entity.id}:`, validation.errors);
        // Fall back to full cache update
        await updateCacheEntity();
      }
    } else {
      // No cached version, store full entity
      await storeCacheEntity(cacheKey, entity);
    }
  }
}

/**
 * Example: Offline-first sync with delta queuing
 */
export async function offlineDeltaSync(
  changes: Array<{ before: Record<string, unknown>; after: Record<string, unknown>; timestamp: number }>
): Promise<void> {
  const deltaQueue = [];

  // Create deltas for all changes
  for (const change of changes) {
    try {
      const delta = await differentialSync.calculateDelta(
        { id: 'unknown', createdAt: new Date(), updatedAt: new Date(), ...change.before } as SyncableEntity,
        { id: 'unknown', createdAt: new Date(), updatedAt: new Date(), ...change.after } as SyncableEntity,
        {
          algorithm: 'custom',
          compressionType: 'gzip',
          includeChecksum: true
        }
      );

      deltaQueue.push({
        delta,
        timestamp: change.timestamp,
        retries: 0
      });
    } catch (error) {
      console.error('Failed to create delta:', error);
    }
  }

  console.log(`Created ${deltaQueue.length} deltas for offline sync`);

  // When online, process the delta queue
  await processDeltaQueue(deltaQueue);
}

// Helper functions (simulated)
async function simulateBatchDeltaUpload(deltas: unknown[]): Promise<void> {
  console.log(`Uploading ${deltas.length} deltas...`);
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('Upload complete');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getCachedEntities(cacheKey: string): Promise<Record<string, unknown>[]> {
  // Simulate cache lookup
  return [];
}

async function updateCacheEntity(): Promise<void> {
  console.log('Updating cache');
}

async function storeCacheEntity(cacheKey: string, entity: Record<string, unknown>): Promise<void> {
  console.log(`Storing in cache ${cacheKey}/${entity.id}`);
}

async function processDeltaQueue(deltaQueue: Record<string, unknown>[]): Promise<void> {
  console.log(`Processing ${deltaQueue.length} deltas from offline queue...`);
  
  for (const item of deltaQueue) {
    try {
      // Simulate API call to apply delta
      await new Promise(resolve => setTimeout(resolve, 50));
      console.log(`Applied delta ${(item as { delta: { id: string }; timestamp: number; retries: number }).delta.id}`);
    } catch (error) {
      const typedItem = item as { delta: { id: string }; timestamp: number; retries: number };
      console.error(`Failed to apply delta ${typedItem.delta.id}:`, error);
      typedItem.retries++;
    }
  }
}

// Example usage
export async function demonstrateDifferentialSync(): Promise<void> {
  console.log('=== Differential Sync Service Demo ===\n');

  // Sample data
  const originalDog: Dog = {
    id: 'dog-1',
    name: 'Buddy',
    breed: 'Golden Retriever',
    registration: {
      number: 'AKC123456',
      organization: 'AKC'
    },
    owner: {
      id: 'person-1',
      name: 'John Doe'
    },
    birthDate: '2020-01-15',
    color: 'Golden',
    sex: 'Male'
  } as Dog;

  const modifiedDog: Dog = {
    ...originalDog,
    name: 'Buddy Champion',
    registration: {
      ...originalDog.registration,
      number: 'AKC789012'
    },
    achievements: ['Best in Show 2023', 'Agility Champion'],
    weight: 65
  } as Dog;

  // Demonstrate optimized sync
  console.log('1. Optimized Dog Profile Sync:');
  const result = await syncDogProfileOptimized(originalDog, modifiedDog);
  console.log(`Result: ${result.success ? 'Success' : 'Failed'}, ${result.bandwidth} bytes, ${result.duration.toFixed(2)}ms\n`);

  // Demonstrate performance monitoring
  console.log('2. Performance Monitoring:');
  await monitoredDeltaSync(originalDog, modifiedDog, 'dog');
  console.log();

  // Demonstrate conflict resolution
  console.log('3. Conflict Resolution:');
  const localVersion = { ...originalDog, name: 'Buddy Local', color: 'Light Golden' };
  const remoteVersion = { ...originalDog, name: 'Buddy Remote', weight: 70 };
  const resolved = await conflictAwareDeltaSync(localVersion, remoteVersion, originalDog);
  console.log('Resolved version:', resolved ? resolved.name : 'Manual resolution needed');
  console.log();

  console.log('=== Demo Complete ===');
}