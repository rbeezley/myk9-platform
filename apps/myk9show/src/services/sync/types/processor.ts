/**
 * Sync Processor Interface
 *
 * Defines the contract for entity-specific sync processors that handle
 * the actual Supabase operations for different entity types.
 */

import type { SyncQueueItem } from '@/types/sync-types';

export interface SyncProcessorResult {
  success: boolean;
  serverData?: Record<string, unknown>;
  error?: Error;
  conflictDetected?: boolean;
  serverVersion?: number;
}

export interface SyncProcessor {
  /**
   * The entity type this processor handles (e.g., 'entry', 'dog', 'class')
   */
  entityType: string;

  /**
   * Process a single sync queue item.
   * Returns result indicating success/failure and any server data.
   */
  processItem(item: SyncQueueItem): Promise<SyncProcessorResult>;

  /**
   * Check if this processor can handle the given entity type
   */
  canProcess(entityType: string): boolean;
}
