// Mock sync service for stores to use until Supabase integration
// This provides a compatible interface without the complex sync logic

export interface MockSyncQueueItem {
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class MockSyncService {
  async addToQueue(item: MockSyncQueueItem): Promise<string> {
    // Mock implementation - just log for now
    console.log('Mock sync service: queuing operation', item);
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
    // Mock implementation
    console.log('Mock sync service: processing queue');
  }

  async clearQueue(): Promise<void> {
    // Mock implementation
    console.log('Mock sync service: clearing queue');
  }
}

export const syncService = new MockSyncService();

// Export class with expected name for tests
export { MockSyncService as SyncService };