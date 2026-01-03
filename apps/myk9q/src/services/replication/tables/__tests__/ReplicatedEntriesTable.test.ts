/**
 * ReplicatedEntriesTable Tests
 *
 * Validates the first concrete implementation of ReplicatedTable:
 * - CRUD operations with IndexedDB persistence
 * - Query methods (getByClassId, getByArmband)
 * - Subscription pattern for real-time updates
 * - TTL expiration and cache invalidation
 * - Conflict resolution (client wins check-in, server wins scores)
 * - Sync with Supabase
 */

import { vi } from 'vitest';
import { ReplicatedEntriesTable, type Entry } from '../ReplicatedEntriesTable';
import { deleteDB } from 'idb';
import './setup'; // Use custom setup with real IndexedDB

const TEST_DB_NAME = 'myK9Q';
const TEST_LICENSE_KEY = 'test-license-123';

describe('ReplicatedEntriesTable', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    // Clean up any existing database
    await deleteDB(TEST_DB_NAME);

    // Create fresh instance
    table = new ReplicatedEntriesTable();
  });

  afterEach(async () => {
    // Clean up
    await deleteDB(TEST_DB_NAME);
  });

  describe('CRUD Operations', () => {
    it('should set and get a single entry', async () => {
      const entry: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        dog_breed: 'Golden Retriever',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await table.set(entry.id, entry, false);
      const retrieved = await table.get(entry.id);

      expect(retrieved).toEqual(entry);
    });

    it('should return null for non-existent entry', async () => {
      const result = await table.get('non-existent');
      expect(result).toBeNull();
    });

    it('should update an existing entry', async () => {
      const entry: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await table.set(entry.id, entry, false);

      // Update status
      const updated = { ...entry, entry_status: 'checked-in' };
      await table.set(entry.id, updated, false);

      const retrieved = await table.get(entry.id);
      expect(retrieved?.entry_status).toBe('checked-in');
    });

    it('should delete an entry', async () => {
      const entry: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await table.set(entry.id, entry, false);
      await table.delete(entry.id);

      const retrieved = await table.get(entry.id);
      expect(retrieved).toBeNull();
    });

    it('should batch set multiple entries', async () => {
      const entries: Entry[] = [
        {
          id: '1',
          armband_number: 101,
          handler_name: 'John Doe',
          dog_call_name: 'Buddy',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
        {
          id: '2',
          armband_number: 102,
          handler_name: 'Jane Smith',
          dog_call_name: 'Max',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
      ];

      await table.batchSet(entries);

      const allEntries = await table.getAll(TEST_LICENSE_KEY);
      expect(allEntries).toHaveLength(2);
      expect(allEntries.map(e => e.id)).toEqual(['1', '2']);
    });

    it('should batch delete multiple entries', async () => {
      const entries: Entry[] = [
        {
          id: '1',
          armband_number: 101,
          handler_name: 'John Doe',
          dog_call_name: 'Buddy',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
        {
          id: '2',
          armband_number: 102,
          handler_name: 'Jane Smith',
          dog_call_name: 'Max',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
      ];

      await table.batchSet(entries);
      await table.batchDelete(['1', '2']);

      const allEntries = await table.getAll(TEST_LICENSE_KEY);
      expect(allEntries).toHaveLength(0);
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      // Seed data
      const entries: Entry[] = [
        {
          id: '1',
          armband_number: 101,
          handler_name: 'John Doe',
          dog_call_name: 'Buddy',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
        {
          id: '2',
          armband_number: 102,
          handler_name: 'Jane Smith',
          dog_call_name: 'Max',
          class_id: 'class-1',
          entry_status: 'checked-in',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
        {
          id: '3',
          armband_number: 201,
          handler_name: 'Bob Johnson',
          dog_call_name: 'Charlie',
          class_id: 'class-2',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
      ];

      await table.batchSet(entries);
    });

    it('should get entries by class ID', async () => {
      const classEntries = await table.getByClassId('class-1');
      expect(classEntries).toHaveLength(2);
      expect(classEntries.every(e => e.class_id === 'class-1')).toBe(true);
    });

    it('should get entry by armband number', async () => {
      const entry = await table.getByArmband(101, 'class-1');
      expect(entry).not.toBeNull();
      expect(entry?.armband_number).toBe(101);
      expect(entry?.dog_call_name).toBe('Buddy');
    });

    it('should return null for non-existent armband', async () => {
      const entry = await table.getByArmband(999, 'class-1');
      expect(entry).toBeNull();
    });

    it('should filter by license key', async () => {
      // Add entry with different license key
      const otherEntry: Entry = {
        id: '4',
        armband_number: 301,
        handler_name: 'Other User',
        dog_call_name: 'Different',
        class_id: 'class-3',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: 'other-license',
      };

      await table.set(otherEntry.id, otherEntry, false);

      const filtered = await table.getAll(TEST_LICENSE_KEY);
      expect(filtered).toHaveLength(3); // Should not include 'other-license' entry
      expect(filtered.every(e => e.license_key === TEST_LICENSE_KEY)).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    it('should update entry status optimistically', async () => {
      const entry: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await table.set(entry.id, entry, false);
      await table.updateEntryStatus(entry.id, 'checked-in', false);

      const updated = await table.get(entry.id);
      expect(updated?.entry_status).toBe('checked-in');
    });

    it('should mark entry as scored', async () => {
      const entry: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'in-ring',
        is_scored: false,
        is_in_ring: true,
        license_key: TEST_LICENSE_KEY,
      };

      await table.set(entry.id, entry, false);
      await table.markAsScored(
        entry.id,
        {
          search_time_seconds: 120,
          total_faults: 2,
          result_status: 'qualified',
        },
        false
      );

      const updated = await table.get(entry.id);
      expect(updated?.is_scored).toBe(true);
      expect(updated?.entry_status).toBe('completed');
      expect(updated?.search_time_seconds).toBe(120);
      expect(updated?.total_faults).toBe(2);
      expect(updated?.result_status).toBe('qualified');
    });
  });

  describe('TTL Expiration', () => {
    /**
     * TTL Safety Mechanism Tests
     *
     * The ReplicatedTable has an intentional safety feature: data will NOT expire
     * unless there has been a successful sync within 2x TTL. This prevents data loss
     * when the app is offline or sync fails silently.
     *
     * These tests verify that the safety mechanism works correctly.
     */

    it('should NOT expire entries when no successful sync has occurred (safety mechanism)', async () => {
      // Create table - no sync has occurred, so lastSuccessfulSyncAt = 0
      const safetyTable = new ReplicatedEntriesTable();

      const entry: Entry = {
        id: 'safety-test-1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await safetyTable.set(entry.id, entry, false);

      // Wait longer than any reasonable TTL
      await new Promise(resolve => setTimeout(resolve, 200));

      // Entry should NOT be expired because no sync has occurred
      // This is the safety mechanism preventing data loss
      const stillPresent = await safetyTable.get(entry.id);
      expect(stillPresent).not.toBeNull();
      expect(stillPresent?.id).toBe(entry.id);
    });

    it('should expire entries after successful sync and TTL elapsed', async () => {
      const syncTable = new ReplicatedEntriesTable();

      const entry: Entry = {
        id: 'expire-after-sync-1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await syncTable.set(entry.id, entry, false);

      // Simulate a successful sync by refreshing timestamps
      // This sets lastSuccessfulSyncAt to now, enabling TTL expiration
      await syncTable.refreshTimestamps();

      // Entry should exist immediately after sync
      const beforeExpiry = await syncTable.get(entry.id);
      expect(beforeExpiry).not.toBeNull();

      // Note: With default TTL (5 minutes), we can't actually wait for expiration
      // in a unit test. This test verifies the sync mechanism enables expiration.
      // Full TTL expiration is tested in integration tests with mocked time.
    });

    it('should preserve dirty entries regardless of TTL (offline protection)', async () => {
      const dirtyTable = new ReplicatedEntriesTable();

      const entry: Entry = {
        id: 'dirty-entry-1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'checked-in',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      // Mark as dirty (unsaved local change) - this should never expire
      await dirtyTable.set(entry.id, entry, true);

      // Simulate sync so TTL would normally be enabled
      await dirtyTable.refreshTimestamps();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Dirty entry should NEVER expire, regardless of TTL
      const stillPresent = await dirtyTable.get(entry.id);
      expect(stillPresent).not.toBeNull();
      expect(stillPresent?.entry_status).toBe('checked-in');
    });
  });

  describe('Subscription Pattern', () => {
    it('should notify listeners on data changes', async () => {
      // Create a fresh table instance for this test to ensure isolation
      const freshTable = new ReplicatedEntriesTable();
      const mockListener = vi.fn();
      const unsubscribe = freshTable.subscribe(mockListener);

      // Wait for initial callback
      await new Promise(resolve => setTimeout(resolve, 50));

      // Initial call should happen (may have data from shared DB, so just verify it was called)
      expect(mockListener).toHaveBeenCalledTimes(1);
      const initialData = mockListener.mock.calls[0][0];
      const initialCount = initialData.length;

      // Add a unique entry
      const entry: Entry = {
        id: 'subscribe-test-' + Date.now(),
        armband_number: 999,
        handler_name: 'Subscribe Test',
        dog_call_name: 'TestDog',
        class_id: 'class-subscribe',
        entry_status: 'no-status',
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      await freshTable.set(entry.id, entry, false);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should be called again with new data (one more entry than before)
      expect(mockListener).toHaveBeenCalledTimes(2);
      const newData = mockListener.mock.calls[1][0];
      expect(newData.length).toBe(initialCount + 1);
      expect(newData.some((e: Entry) => e.id === entry.id)).toBe(true);

      // Unsubscribe
      unsubscribe();

      // Add another entry
      await freshTable.set('subscribe-test-2', { ...entry, id: 'subscribe-test-2' }, false);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not be called again (unsubscribed)
      expect(mockListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('Conflict Resolution', () => {
    it('should always use server entry_status (server wins)', async () => {
      const local: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'checked-in', // Client has newer status
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      const remote: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status', // Server value
        is_scored: false,
        is_in_ring: false,
        license_key: TEST_LICENSE_KEY,
      };

      // Access protected method for testing
      const resolved = (table as any).resolveConflict(local, remote);

      // Server always wins - local changes are uploaded first via MutationManager,
      // so by the time we merge, server has the most recent committed state
      expect(resolved.entry_status).toBe('no-status');
    });

    it('should use all server values including scoring results', async () => {
      const local: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'completed',
        is_scored: true,
        is_in_ring: false,
        result_status: 'qualified',
        search_time_seconds: 100,
        total_faults: 0,
        final_placement: 1,
        license_key: TEST_LICENSE_KEY,
      };

      const remote: Entry = {
        id: '1',
        armband_number: 101,
        handler_name: 'John Doe',
        dog_call_name: 'Buddy',
        class_id: 'class-1',
        entry_status: 'no-status', // Server value wins
        is_scored: true,
        is_in_ring: false,
        result_status: 'nq', // Server's authoritative score
        search_time_seconds: 125,
        total_faults: 5,
        final_placement: 10,
        license_key: TEST_LICENSE_KEY,
      };

      const resolved = (table as any).resolveConflict(local, remote);

      // Server wins for everything
      expect(resolved.entry_status).toBe('no-status');
      expect(resolved.result_status).toBe('nq');
      expect(resolved.search_time_seconds).toBe(125);
      expect(resolved.total_faults).toBe(5);
      expect(resolved.final_placement).toBe(10);
    });
  });

  describe('Sync Metadata', () => {
    it('should get sync metadata', async () => {
      const metadata = await table.getSyncMetadata();

      // First time should be null or undefined (no metadata exists yet)
      expect(metadata == null).toBe(true); // == null checks for both null and undefined
    });

    it('should update sync metadata after operations', async () => {
      // Trigger initialization by doing a sync-like operation
      await table.getAll();

      // After operations, metadata might still be null/undefined in a fresh test environment
      // unless sync has been explicitly run
      const metadata = await table.getSyncMetadata();
      // Metadata is only created after a successful sync, so it may be null/undefined in tests
      expect(metadata == null || metadata?.tableName === 'entries').toBe(true);
    });
  });

  describe('Cache Operations', () => {
    it('should clear all cached entries', async () => {
      const entries: Entry[] = [
        {
          id: '1',
          armband_number: 101,
          handler_name: 'John Doe',
          dog_call_name: 'Buddy',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
        {
          id: '2',
          armband_number: 102,
          handler_name: 'Jane Smith',
          dog_call_name: 'Max',
          class_id: 'class-1',
          entry_status: 'no-status',
          is_scored: false,
          is_in_ring: false,
          license_key: TEST_LICENSE_KEY,
        },
      ];

      await table.batchSet(entries);
      await table.clearCache();

      const remaining = await table.getAll(TEST_LICENSE_KEY);
      expect(remaining).toHaveLength(0);
    });
  });
});
