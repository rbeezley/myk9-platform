/**
 * @deprecated DEPRECATED - Phase 2.2 complete
 *
 * This mock sync service was used before stores migrated to @myk9/replication.
 * Stores now use replicated tables directly (see showStore, trialStore, etc.)
 *
 * This stub remains only for Phase 6 features (OfflineEntryCreator,
 * OfflineScoringService, OfflineCheckInService) which will be updated
 * to use @myk9/replication in Phase 6.
 *
 * DO NOT USE IN NEW CODE - use @myk9/replication instead.
 */

export interface MockSyncQueueItem {
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * @deprecated Use @myk9/replication ReplicatedTable instead
 */
export class MockSyncService {
  async addToQueue(item: MockSyncQueueItem): Promise<string> {
    // No-op stub - stores now use replicated tables directly
    console.debug('[DEPRECATED] Mock sync service addToQueue - use @myk9/replication', item.entityType);
    return `mock-queue-${Date.now()}`;
  }

  async getQueueStatus() {
    return {
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0
    };
  }

  async processQueue(): Promise<void> {
    // No-op stub
    console.debug('[DEPRECATED] Mock sync service processQueue - use @myk9/replication');
  }

  async clearQueue(): Promise<void> {
    // No-op stub
    console.debug('[DEPRECATED] Mock sync service clearQueue - use @myk9/replication');
  }
}

export const syncService = new MockSyncService();

// Export class with expected name for tests
export { MockSyncService as SyncService };