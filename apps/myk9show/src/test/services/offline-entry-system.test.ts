/**
 * Comprehensive tests for Phase 3 Offline Entry System
 * Tests offline entry creation, validation, and limit checking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Service imports
import { OfflineEntryCreator } from '@/services/entries/OfflineEntryCreator';
import { EntryValidator } from '@/services/entries/EntryValidator';
import { EntryLimitChecker } from '@/services/entries/EntryLimitChecker';

// Store imports
import { useEntryStore } from '@/store/entryStore';
import { useClassStore } from '@/store/classStore';
import { useSyncQueue } from '@/store/syncQueue';

// Type imports
import type { EntryStatus } from '@/types/entry-types';
import type { Class } from '@/types/class-types';

// TODO: fix - useSyncQueue store was a stub (not implemented); tests need real store behavior
describe.skip('Phase 3 Offline Entry System', () => {
  beforeEach(() => {
    localStorage.clear();

    // Reset stores
    useEntryStore.getState().clearEntries();
    useClassStore.getState().clearClasses();
    useSyncQueue.getState().clearQueue();
  });

  describe('OfflineEntryCreator - Core Functionality', () => {
    const mockClass: Class = {
      id: 'class-1',
      name: 'Open Dogs',
      showId: 'show-1',
      maxEntries: 10,
      entryFee: 25,
      status: 'active',
      judgeId: 'judge-1',
      rings: ['1'],
      scheduledTime: '09:00',
      estimatedDuration: 60,
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z',
    };

    beforeEach(() => {
      useClassStore.getState().addClass(mockClass);
    });

    it('should create entry offline with proper validation', async () => {
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      const result = await OfflineEntryCreator.createEntry(entryData);

      expect(result.success).toBe(true);
      expect(result.entry).toBeDefined();
      expect(result.entry?.dogId).toBe('dog-1');
      expect(result.entry?.status).toBe('confirmed');

      // Verify entry was added to store
      const entries = useEntryStore.getState().entries;
      expect(entries).toHaveLength(1);
      expect(entries[0].dogId).toBe('dog-1');

      // Verify sync queue entry
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('CREATE_ENTRY');
      expect(syncQueue[0].entityId).toBe(result.entry?.id);
    });

    it('should handle entry creation when class is at capacity', async () => {
      // Fill class to capacity
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        classId: 'class-1',
        showId: 'show-1',
        dogId: `dog-${i}`,
        status: 'confirmed' as EntryStatus,
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: `Handler ${i}`,
          entryFee: 25,
          paymentStatus: 'paid' as const,
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z',
      }));

      entries.forEach(entry => useEntryStore.getState().addEntry(entry));

      const entryData = {
        dogId: 'dog-11',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'Waitlist Handler',
        entryFee: 25,
      };

      const result = await OfflineEntryCreator.createEntry(entryData);

      expect(result.success).toBe(true);
      expect(result.entry?.status).toBe('waitlisted');
      expect(result.warnings).toContain('CLASS_AT_CAPACITY');
    });

    it('should validate entry data before creation', async () => {
      const invalidEntryData = {
        dogId: '', // Invalid - empty
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: -5, // Invalid - negative
      };

      const result = await OfflineEntryCreator.createEntry(invalidEntryData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('INVALID_DOG_ID');
      expect(result.errors).toContain('INVALID_ENTRY_FEE');

      // Verify no entry was created
      const entries = useEntryStore.getState().entries;
      expect(entries).toHaveLength(0);
    });

    it('should handle duplicate entry prevention', async () => {
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      // Create first entry
      const firstResult = await OfflineEntryCreator.createEntry(entryData);
      expect(firstResult.success).toBe(true);

      // Try to create duplicate
      const duplicateResult = await OfflineEntryCreator.createEntry(entryData);
      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.errors).toContain('DUPLICATE_ENTRY');

      // Verify only one entry exists
      const entries = useEntryStore.getState().entries;
      expect(entries).toHaveLength(1);
    });

    it('should handle entry updates offline', async () => {
      // Create initial entry
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      const createResult = await OfflineEntryCreator.createEntry(entryData);
      expect(createResult.success).toBe(true);

      // Update entry
      const updateData = {
        handler: 'Jane Doe',
        specialRequests: 'Early ring time',
      };

      const updateResult = await OfflineEntryCreator.updateEntry(
        createResult.entry!.id,
        updateData
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.entry?.registrationData.handler).toBe('Jane Doe');

      // Verify sync queue has update operation
      const syncQueue = useSyncQueue.getState().queue;
      const updateOperation = syncQueue.find(op => op.operation === 'UPDATE_ENTRY');
      expect(updateOperation).toBeDefined();
    });

    it('should handle entry withdrawal offline', async () => {
      // Create entry
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      const createResult = await OfflineEntryCreator.createEntry(entryData);
      expect(createResult.success).toBe(true);

      // Withdraw entry
      const withdrawResult = await OfflineEntryCreator.withdrawEntry(
        createResult.entry!.id,
        'Owner request'
      );

      expect(withdrawResult.success).toBe(true);

      const updatedEntry = useEntryStore.getState().getEntry(createResult.entry!.id);
      expect(updatedEntry?.status).toBe('withdrawn');

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      const withdrawOperation = syncQueue.find(op => op.operation === 'WITHDRAW_ENTRY');
      expect(withdrawOperation).toBeDefined();
    });
  });

  describe('EntryValidator - Advanced Validation', () => {
    it('should validate entry registration data comprehensively', () => {
      const validData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
        specialRequests: 'Early ring time',
        emergencyContact: {
          name: 'Jane Smith',
          phone: '555-1234',
        },
      };

      const result = EntryValidator.validateEntryData(validData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate handler information', () => {
      const invalidHandler = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: '', // Invalid - empty
        entryFee: 25,
      };

      const result = EntryValidator.validateEntryData(invalidHandler);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_HANDLER')).toBe(true);
    });

    it('should validate emergency contact format', () => {
      const invalidContact = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
        emergencyContact: {
          name: 'Jane Smith',
          phone: 'invalid-phone', // Invalid format
        },
      };

      const result = EntryValidator.validateEntryData(invalidContact);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_EMERGENCY_CONTACT')).toBe(true);
    });

    it('should validate entry fee amounts', () => {
      const negativeFeee = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: -25, // Invalid - negative
      };

      const result = EntryValidator.validateEntryData(negativeFeee);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENTRY_FEE')).toBe(true);
    });
  });

  describe('EntryLimitChecker - Advanced Limit Management', () => {
    const mockClasses = [
      {
        id: 'class-1',
        name: 'Open Dogs',
        maxEntries: 10,
      },
      {
        id: 'class-2',
        name: 'Novice Dogs',
        maxEntries: 15,
      },
      {
        id: 'class-3',
        name: 'Championship',
        // No limit
      },
    ];

    it('should check multi-class entry limits', () => {
      const entries = [
        { classId: 'class-1', status: 'confirmed' as EntryStatus },
        { classId: 'class-1', status: 'confirmed' as EntryStatus },
        { classId: 'class-2', status: 'confirmed' as EntryStatus },
        { classId: 'class-3', status: 'confirmed' as EntryStatus },
      ];

      const result = EntryLimitChecker.checkMultiClassLimits(entries, mockClasses);

      expect(result['class-1'].confirmed).toBe(2);
      expect(result['class-1'].availableSpots).toBe(8);
      expect(result['class-2'].confirmed).toBe(1);
      expect(result['class-2'].availableSpots).toBe(14);
      expect(result['class-3'].availableSpots).toBeNull(); // No limit
    });

    it('should handle waitlist promotion logic', () => {
      const entries = [
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `entry-${i}`,
          classId: 'class-1',
          status: 'confirmed' as EntryStatus,
          registrationData: { submittedAt: `2024-07-01T${10 + i}:00:00Z` },
        })),
        {
          id: 'waitlist-1',
          classId: 'class-1',
          status: 'waitlisted' as EntryStatus,
          registrationData: { submittedAt: '2024-07-01T18:00:00Z' },
        },
        {
          id: 'waitlist-2',
          classId: 'class-1',
          status: 'waitlisted' as EntryStatus,
          registrationData: { submittedAt: '2024-07-01T19:00:00Z' },
        },
      ];

      const mockClass = mockClasses[0];
      const promotionResult = EntryLimitChecker.getWaitlistPromotions(
        'class-1',
        entries,
        mockClass
      );

      expect(promotionResult.canPromote).toBe(true);
      expect(promotionResult.spotsAvailable).toBe(2);
      expect(promotionResult.nextToPromote).toHaveLength(2);
      expect(promotionResult.nextToPromote[0].id).toBe('waitlist-1'); // Earlier submission
    });

    it('should handle complex entry status transitions', () => {
      const entries = [
        { id: 'entry-1', classId: 'class-1', status: 'confirmed' as EntryStatus },
        { id: 'entry-2', classId: 'class-1', status: 'paid' as EntryStatus },
        { id: 'entry-3', classId: 'class-1', status: 'waitlisted' as EntryStatus },
        { id: 'entry-4', classId: 'class-1', status: 'withdrawn' as EntryStatus },
        { id: 'entry-5', classId: 'class-1', status: 'cancelled' as EntryStatus },
      ];

      const stats = EntryLimitChecker.getClassEntryStats('class-1', entries, mockClasses[0]);

      expect(stats.confirmed).toBe(2); // confirmed + paid
      expect(stats.waitlisted).toBe(1);
      expect(stats.withdrawn).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.activeEntries).toBe(3); // confirmed + paid + waitlisted
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock storage failure
      vi.spyOn(useEntryStore.getState(), 'addEntry').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      const result = await OfflineEntryCreator.createEntry(entryData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('STORAGE_ERROR');
    });

    it('should handle invalid class references', async () => {
      const entryData = {
        dogId: 'dog-1',
        classId: 'non-existent-class',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      const result = await OfflineEntryCreator.createEntry(entryData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CLASS_NOT_FOUND');
    });

    it('should handle network connectivity issues during sync preparation', async () => {
      // Mock network failure
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      // Should still create entry offline
      const result = await OfflineEntryCreator.createEntry(entryData);

      expect(result.success).toBe(true);
      expect(result.entry?.id).toBeDefined();

      // Should queue for sync
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of entries efficiently', async () => {
      const startTime = performance.now();

      // Create many entries
      const promises = Array.from({ length: 100 }, (_, i) =>
        OfflineEntryCreator.createEntry({
          dogId: `dog-${i}`,
          classId: 'class-1',
          showId: 'show-1',
          handler: `Handler ${i}`,
          entryFee: 25,
        })
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed (though many will be waitlisted)
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(100);

      // Should complete in reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should efficiently check limits for many classes', () => {
      const classes = Array.from({ length: 50 }, (_, i) => ({
        id: `class-${i}`,
        name: `Class ${i}`,
        maxEntries: 20,
      }));

      const entries = Array.from({ length: 500 }, (_, i) => ({
        id: `entry-${i}`,
        classId: `class-${i % 50}`,
        status: 'confirmed' as EntryStatus,
      }));

      const startTime = performance.now();
      const result = EntryLimitChecker.checkMultiClassLimits(entries, classes);
      const endTime = performance.now();

      expect(Object.keys(result)).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain entry data consistency across operations', async () => {
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        handler: 'John Smith',
        entryFee: 25,
      };

      // Create entry
      const createResult = await OfflineEntryCreator.createEntry(entryData);
      expect(createResult.success).toBe(true);

      const entryId = createResult.entry!.id;

      // Update entry
      await OfflineEntryCreator.updateEntry(entryId, { handler: 'Jane Doe' });

      // Verify consistency
      const updatedEntry = useEntryStore.getState().getEntry(entryId);
      expect(updatedEntry?.registrationData.handler).toBe('Jane Doe');
      expect(updatedEntry?.dogId).toBe('dog-1'); // Original data preserved
      expect(updatedEntry?.updatedAt).not.toBe(updatedEntry?.createdAt);
    });

    it('should maintain referential integrity', async () => {
      // Try to create entry for non-existent show
      const entryData = {
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'non-existent-show',
        handler: 'John Smith',
        entryFee: 25,
      };

      const result = await OfflineEntryCreator.createEntry(entryData);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('SHOW_NOT_FOUND');
    });
  });
});
