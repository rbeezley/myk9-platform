/**
 * Replication Helper Utilities
 *
 * Provides utilities to ensure replication is properly initialized
 * before accessing replicated data, especially after recovery scenarios.
 */

import { getReplicationManager, ReplicationManager } from '../services/replication';
import { logger } from '@/utils/logger';

/**
 * Gets the replication manager, attempting to initialize it if not ready.
 * This is especially important after database recovery when replication
 * may have been disabled and re-enabled.
 *
 * @returns The initialized ReplicationManager or throws an error
 */
export async function ensureReplicationManager(): Promise<ReplicationManager> {
// Try to get existing manager
  let manager = getReplicationManager();
if (!manager) {
    logger.warn('[ReplicationHelper] Manager not ready, attempting initialization...');

    try {
      // Try to initialize replication if it's not ready
const { initializeReplication } = await import('../services/replication/initReplication');

await initializeReplication();
// Try to get manager again
      manager = getReplicationManager();
if (!manager) {
        logger.error('[ReplicationHelper] Failed to initialize manager after initializeReplication()');
        throw new Error('Replication manager not initialized. Please refresh the page.');
      }

} catch (error) {
      logger.error('[ReplicationHelper] Error during initialization:', error);
      throw error;
    }
  }

return manager;
}

/**
 * Checks if replication is enabled and ready
 */
export function isReplicationReady(): boolean {
  const manager = getReplicationManager();
  return manager !== null;
}