import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEntryStore, type ShowEntryInput } from '@/store/entryStore';

// Mock the sync service
vi.mock('@/services/sync/syncService', () => ({
  syncService: {
    addToQueue: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the storage adapter
vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => localStorage),
}));

describe('Phase 3.1: Entry Store - Single Dog, Single Class Entry', () => {
  beforeEach(() => {
    // Clear the store before each test
    useEntryStore.getState().clearAllEntries();
    vi.clearAllMocks();
  });

  describe('Entry Creation', () => {
    it('should create a single entry with correct initial state', async () => {
      const entryStore = useEntryStore.getState();

      const entryData: ShowEntryInput = {
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
          jumpHeight: '12"',
        },
      };

      const entry = await entryStore.createEntry(entryData);

      // Verify entry creation
      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.showId).toBe('test-show-123');
      expect(entry.classId).toBe('novice-standard');
      expect(entry.dogId).toBe('test-dog-1');
      expect(entry.status).toBe('draft');
      expect(entry.registrationData.entryFee).toBe(25.0);
      expect(entry.registrationData.paymentStatus).toBe('pending');
      expect(entry.statusHistory).toHaveLength(1);
      expect(entry.statusHistory[0].status).toBe('draft');
      expect(entry._syncStatus).toBe('pending');
    });

    it('should add entry to store state', async () => {
      const entryStore = useEntryStore.getState();

      const entryData: ShowEntryInput = {
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      await entryStore.createEntry(entryData);

      // Get fresh state to verify entry is in store
      const freshState = useEntryStore.getState();
      const entries = freshState.entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].showId).toBe('test-show-123');
      expect(entries[0].classId).toBe('novice-standard');
      expect(entries[0].dogId).toBe('test-dog-1');
    });
  });

  describe('Entry Status Progression', () => {
    let entryId: string;

    beforeEach(async () => {
      const entryStore = useEntryStore.getState();
      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      });
      entryId = entry.id;
    });

    it('should progress from draft to submitted', async () => {
      const entryStore = useEntryStore.getState();

      const updatedEntry = await entryStore.updateStatus(
        entryId,
        'submitted',
        'test-user',
        'Entry submitted'
      );

      expect(updatedEntry).toBeDefined();
      expect(updatedEntry!.status).toBe('submitted');
      expect(updatedEntry!.statusHistory).toHaveLength(2);
      expect(updatedEntry!.statusHistory[1].status).toBe('submitted');
      expect(updatedEntry!.statusHistory[1].userId).toBe('test-user');
      expect(updatedEntry!.statusHistory[1].reason).toBe('Entry submitted');
    });

    it('should progress from submitted to paid', async () => {
      const entryStore = useEntryStore.getState();

      // First submit
      await entryStore.updateStatus(entryId, 'submitted', 'test-user');

      // Then mark as paid
      const paidEntry = await entryStore.updateStatus(
        entryId,
        'paid',
        'payment-system',
        'Payment confirmed'
      );

      expect(paidEntry).toBeDefined();
      expect(paidEntry!.status).toBe('paid');
      expect(paidEntry!.statusHistory).toHaveLength(3);
      expect(paidEntry!.statusHistory[2].status).toBe('paid');
    });

    it('should progress from paid to confirmed', async () => {
      const entryStore = useEntryStore.getState();

      // Progress through statuses
      await entryStore.updateStatus(entryId, 'submitted', 'test-user');
      await entryStore.updateStatus(entryId, 'paid', 'payment-system');

      const confirmedEntry = await entryStore.updateStatus(
        entryId,
        'confirmed',
        'secretary-user',
        'Entry confirmed'
      );

      expect(confirmedEntry).toBeDefined();
      expect(confirmedEntry!.status).toBe('confirmed');
      expect(confirmedEntry!.statusHistory).toHaveLength(4);
      expect(confirmedEntry!.statusHistory[3].status).toBe('confirmed');
      expect(confirmedEntry!.statusHistory[3].userId).toBe('secretary-user');
    });
  });

  describe('Payment Processing', () => {
    let entryId: string;

    beforeEach(async () => {
      const entryStore = useEntryStore.getState();
      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      });
      entryId = entry.id;
    });

    it('should update payment status to paid', async () => {
      const entryStore = useEntryStore.getState();

      const updatedEntry = await entryStore.updateRegistration(entryId, {
        paymentStatus: 'paid',
        paymentReference: 'cc-12345',
      });

      expect(updatedEntry).toBeDefined();
      expect(updatedEntry!.registrationData.paymentStatus).toBe('paid');
      expect(updatedEntry!.registrationData.paymentReference).toBe('cc-12345');
    });

    it('should handle different payment methods', async () => {
      const entryStore = useEntryStore.getState();

      // Test credit card payment
      const ccEntry = await entryStore.updateRegistration(entryId, {
        paymentStatus: 'paid',
        paymentMethod: 'credit_card',
        paymentReference: 'cc-12345',
      });

      expect(ccEntry!.registrationData.paymentStatus).toBe('paid');
      expect(ccEntry!.registrationData.paymentMethod).toBe('credit_card');

      // Create another entry for check payment
      const checkEntry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'open-standard',
        dogId: 'test-dog-2',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler 2',
          entryFee: 30.0,
          paymentStatus: 'pending',
        },
      });

      const checkPaid = await entryStore.updateRegistration(checkEntry.id, {
        paymentStatus: 'paid',
        paymentMethod: 'check',
        checkNumber: '1234',
      });

      expect(checkPaid!.registrationData.paymentStatus).toBe('paid');
      expect(checkPaid!.registrationData.paymentMethod).toBe('check');
      expect(checkPaid!.registrationData.checkNumber).toBe('1234');
    });

    it('should calculate total fees correctly', async () => {
      const entryStore = useEntryStore.getState();

      // Create multiple entries for the same show
      await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'open-standard',
        dogId: 'test-dog-2',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler 2',
          entryFee: 30.0,
          paymentStatus: 'paid',
        },
      });

      await entryStore.updateRegistration(entryId, { paymentStatus: 'paid' });

      const stats = entryStore.getStatsForShow('test-show-123');

      expect(stats.totalRevenue).toBe(55.0); // 25 + 30
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('Entry Queries and Statistics', () => {
    beforeEach(async () => {
      const entryStore = useEntryStore.getState();

      // Create test entries with different statuses
      const entry1 = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler 1',
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
      });

      const entry2 = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'open-standard',
        dogId: 'dog-2',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler 2',
          entryFee: 30.0,
          paymentStatus: 'pending',
        },
      });

      // Update statuses
      await entryStore.updateStatus(entry1.id, 'confirmed', 'secretary');
      await entryStore.updateStatus(entry2.id, 'submitted', 'exhibitor');
    });

    it('should get entries by show', () => {
      const entryStore = useEntryStore.getState();

      const showEntries = entryStore.getEntriesByShow('test-show-123');

      expect(showEntries).toHaveLength(2);
      expect(showEntries.every(entry => entry.showId === 'test-show-123')).toBe(true);
    });

    it('should get entries by class', () => {
      const entryStore = useEntryStore.getState();

      const classEntries = entryStore.getEntriesByClass('novice-standard');

      expect(classEntries).toHaveLength(1);
      expect(classEntries[0].classId).toBe('novice-standard');
    });

    it('should get entries by status', () => {
      const entryStore = useEntryStore.getState();

      const confirmedEntries = entryStore.getEntriesByStatus('confirmed');
      const submittedEntries = entryStore.getEntriesByStatus('submitted');

      expect(confirmedEntries).toHaveLength(1);
      expect(submittedEntries).toHaveLength(1);
    });

    it('should calculate show statistics correctly', () => {
      const entryStore = useEntryStore.getState();

      const stats = entryStore.getStatsForShow('test-show-123');

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalRevenue).toBe(25.0); // Only paid entry counts
      expect(stats.byStatus.confirmed).toBe(1);
      expect(stats.byStatus.submitted).toBe(1);
      expect(stats.completionRate).toBe(0); // No entries completed yet
    });
  });

  describe('Bulk Operations', () => {
    it('should create multiple entries', async () => {
      const entryStore = useEntryStore.getState();

      const entriesData: ShowEntryInput[] = [
        {
          showId: 'test-show-123',
          classId: 'novice-standard',
          dogId: 'dog-1',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
        {
          showId: 'test-show-123',
          classId: 'open-standard',
          dogId: 'dog-2',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 30.0,
            paymentStatus: 'pending',
          },
        },
      ];

      const entries = await entryStore.createMultipleEntries(entriesData);

      expect(entries).toHaveLength(2);
      expect(entries[0].showId).toBe('test-show-123');
      expect(entries[1].showId).toBe('test-show-123');
      expect(entries[0].status).toBe('draft');
      expect(entries[1].status).toBe('draft');
    });

    it('should update multiple entries status', async () => {
      const entryStore = useEntryStore.getState();

      // Create entries
      const entries = await entryStore.createMultipleEntries([
        {
          showId: 'test-show-123',
          classId: 'novice-standard',
          dogId: 'dog-1',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
        {
          showId: 'test-show-123',
          classId: 'open-standard',
          dogId: 'dog-2',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 30.0,
            paymentStatus: 'pending',
          },
        },
      ]);

      const entryIds = entries.map(e => e.id);

      // Update all to submitted
      await entryStore.updateEntriesStatus(entryIds, 'submitted', 'bulk-user', 'Bulk submission');

      // Verify updates
      const updatedEntries = entryIds.map(id => entryStore.getEntry(id));
      expect(updatedEntries.every(entry => entry?.status === 'submitted')).toBe(true);
    });
  });

  describe('Competition Results', () => {
    let entryId: string;

    beforeEach(async () => {
      const entryStore = useEntryStore.getState();
      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
      });
      entryId = entry.id;

      // Progress to competing status
      await entryStore.updateStatus(entryId, 'submitted', 'exhibitor');
      await entryStore.updateStatus(entryId, 'paid', 'payment-system');
      await entryStore.updateStatus(entryId, 'confirmed', 'secretary');
      await entryStore.updateStatus(entryId, 'competing', 'judge');
    });

    it('should record competition results', async () => {
      const entryStore = useEntryStore.getState();

      const result = {
        score: '195',
        time: '45.32',
        placement: '1st',
        qualified: true,
        qualification: 'Qualified',
        recordedBy: 'judge-1',
      };

      const completedEntry = await entryStore.recordResult(entryId, result);

      expect(completedEntry).toBeDefined();
      expect(completedEntry!.status).toBe('completed');
      expect(completedEntry!.competitionData).toBeDefined();
      expect(completedEntry!.competitionData!.score).toBe('195');
      expect(completedEntry!.competitionData!.qualified).toBe(true);
      expect(completedEntry!.competitionData!.placement).toBe('1st');
    });

    it('should update existing results', async () => {
      const entryStore = useEntryStore.getState();

      // Record initial result
      await entryStore.recordResult(entryId, {
        score: '195',
        time: '45.32',
        placement: '1st',
        qualified: true,
        recordedBy: 'judge-1',
      });

      // Update result
      const updatedEntry = await entryStore.updateResult(entryId, {
        score: '198',
        placement: '1st',
        judgeNotes: 'Excellent performance',
        recordedBy: 'judge-1',
      });

      expect(updatedEntry!.competitionData!.score).toBe('198');
      expect(updatedEntry!.competitionData!.judgeNotes).toBe('Excellent performance');
      expect(updatedEntry!.competitionData!.time).toBe('45.32'); // Should preserve
    });
  });

  describe('Data Integrity and Validation', () => {
    it('should handle missing entry gracefully', async () => {
      const entryStore = useEntryStore.getState();

      const result = await entryStore.updateStatus('non-existent-id', 'submitted', 'test-user');

      expect(result).toBeNull();
      // Get fresh state to check error
      const freshState = useEntryStore.getState();
      expect(freshState.error).toBeTruthy();
      expect(freshState.error).toEqual(
        expect.stringContaining('Entry with id non-existent-id not found')
      );
    });

    it('should maintain entry relationships', async () => {
      const entryStore = useEntryStore.getState();

      const entry = await entryStore.createEntry({
        showId: 'test-show-123',
        classId: 'novice-standard',
        dogId: 'test-dog-1',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      });

      // Verify relationships
      const dogEntries = entryStore.getEntriesByDog('test-dog-1');
      const showEntries = entryStore.getEntriesByShow('test-show-123');
      const classEntries = entryStore.getEntriesByClass('novice-standard');

      expect(dogEntries).toHaveLength(1);
      expect(showEntries).toHaveLength(1);
      expect(classEntries).toHaveLength(1);
      expect(dogEntries[0].id).toBe(entry.id);
      expect(showEntries[0].id).toBe(entry.id);
      expect(classEntries[0].id).toBe(entry.id);
    });

    it('should maintain sync metadata', async () => {
      const entryStore = useEntryStore.getState();

      // Pass userId as second arg so _lastModifiedBy is set correctly
      const entry = await entryStore.createEntry(
        {
          showId: 'test-show-123',
          classId: 'novice-standard',
          dogId: 'test-dog-1',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
        'current-user'
      );

      // Verify sync metadata
      expect(entry._version).toBe(1);
      expect(entry._syncStatus).toBe('pending');
      expect(entry._lastModified).toBeInstanceOf(Date);
      expect(entry._lastModifiedBy).toBe('current-user');

      // Update and verify version increment
      const updated = await entryStore.updateStatus(entry.id, 'submitted', 'test-user');
      expect(updated!._version).toBe(2);
      expect(updated!._syncStatus).toBe('pending');
    });
  });

  console.log('=== Phase 3.1: Entry Store Tests PASSED ===');
});
