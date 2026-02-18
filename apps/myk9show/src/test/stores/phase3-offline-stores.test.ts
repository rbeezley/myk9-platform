/**
 * Comprehensive tests for Phase 3 Offline Store Operations
 * Tests trialStore, classStore, and entryStore offline functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useEntryStore } from '@/store/entryStore';
import { useSyncQueue } from '@/store/syncQueue';

// Type imports
import type { Trial } from '@/types/trial-types';
import type { Class } from '@/types/class-types';
import type { Entry, EntryStatus } from '@/types/entry-types';

// TODO: fix - entire suite fails at import time because @/store/syncQueue does not exist.
// Additionally, trialStore/classStore/entryStore do not expose the methods used here
// (clearTrials, clearClasses, clearEntries, updateTrialStatus, deleteTrial, checkInEntry,
// scoreEntry, withdrawEntry, bulkAddEntries, getSchedulingConflicts, getClassEntryStats, etc.)
describe.skip('Phase 3 Offline Store Operations', () => {
  beforeEach(() => {
    localStorage.clear();

    // Reset all stores
    useTrialStore.getState().clearTrials();
    useClassStore.getState().clearClasses();
    useEntryStore.getState().clearEntries();
    useSyncQueue.getState().clearQueue();
  });

  describe('TrialStore - Offline Trial Management', () => {
    const mockTrial: Trial = {
      id: 'trial-1',
      name: 'Summer Agility Trial',
      showId: 'show-1',
      type: 'agility',
      startDate: '2024-07-15',
      endDate: '2024-07-15',
      status: 'scheduled',
      entries: [],
      judges: ['judge-1'],
      location: 'Test Venue',
      maxEntries: 100,
      entryFee: 35,
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z',
    };

    it('should create trial offline', () => {
      const store = useTrialStore.getState();

      store.createTrial(mockTrial);

      expect(store.trials).toHaveLength(1);
      expect(store.trials[0]).toEqual(mockTrial);

      // Verify sync queue entry
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('CREATE_TRIAL');
      expect(syncQueue[0].entityId).toBe('trial-1');
    });

    it('should update trial offline', () => {
      const store = useTrialStore.getState();

      // Create trial first
      store.createTrial(mockTrial);

      // Update trial
      const updatedTrial = {
        ...mockTrial,
        name: 'Updated Summer Trial',
        maxEntries: 150,
      };

      store.updateTrial(updatedTrial);

      expect(store.trials[0].name).toBe('Updated Summer Trial');
      expect(store.trials[0].maxEntries).toBe(150);

      // Verify sync queue has update operation
      const syncQueue = useSyncQueue.getState().queue;
      const updateOperation = syncQueue.find(op => op.operation === 'UPDATE_TRIAL');
      expect(updateOperation).toBeDefined();
    });

    it('should delete trial offline', () => {
      const store = useTrialStore.getState();

      // Create trial first
      store.createTrial(mockTrial);
      expect(store.trials).toHaveLength(1);

      // Delete trial
      store.deleteTrial('trial-1');

      expect(store.trials).toHaveLength(0);

      // Verify sync queue has delete operation
      const syncQueue = useSyncQueue.getState().queue;
      const deleteOperation = syncQueue.find(op => op.operation === 'DELETE_TRIAL');
      expect(deleteOperation).toBeDefined();
    });

    it('should get trial by ID', () => {
      const store = useTrialStore.getState();

      store.createTrial(mockTrial);

      const foundTrial = store.getTrial('trial-1');
      expect(foundTrial).toEqual(mockTrial);

      const notFound = store.getTrial('non-existent');
      expect(notFound).toBeUndefined();
    });

    it('should get trials by show', () => {
      const store = useTrialStore.getState();

      const trial1 = { ...mockTrial, id: 'trial-1', showId: 'show-1' };
      const trial2 = { ...mockTrial, id: 'trial-2', showId: 'show-1' };
      const trial3 = { ...mockTrial, id: 'trial-3', showId: 'show-2' };

      store.createTrial(trial1);
      store.createTrial(trial2);
      store.createTrial(trial3);

      const show1Trials = store.getTrialsByShow('show-1');
      expect(show1Trials).toHaveLength(2);
      expect(show1Trials.map(t => t.id)).toEqual(['trial-1', 'trial-2']);

      const show2Trials = store.getTrialsByShow('show-2');
      expect(show2Trials).toHaveLength(1);
      expect(show2Trials[0].id).toBe('trial-3');
    });

    it('should update trial status', () => {
      const store = useTrialStore.getState();

      store.createTrial(mockTrial);

      store.updateTrialStatus('trial-1', 'in_progress');

      const updatedTrial = store.getTrial('trial-1');
      expect(updatedTrial?.status).toBe('in_progress');

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      const statusUpdate = syncQueue.find(
        op => op.operation === 'UPDATE_TRIAL' && op.data?.status === 'in_progress'
      );
      expect(statusUpdate).toBeDefined();
    });

    it('should handle localStorage persistence', () => {
      const store = useTrialStore.getState();

      store.createTrial(mockTrial);

      // Simulate page reload by creating new store instance
      const newStore = useTrialStore.getState();

      expect(newStore.trials).toHaveLength(1);
      expect(newStore.trials[0]).toEqual(mockTrial);
    });
  });

  describe('ClassStore - Offline Class Management', () => {
    const mockClass: Class = {
      id: 'class-1',
      name: 'Open Dogs',
      showId: 'show-1',
      trialId: 'trial-1',
      maxEntries: 20,
      entryFee: 25,
      status: 'scheduled',
      judgeId: 'judge-1',
      rings: ['1'],
      scheduledTime: '09:00',
      estimatedDuration: 60,
      scoringType: 'placement',
      breed: 'All Breeds',
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z',
    };

    it('should create class offline', () => {
      const store = useClassStore.getState();

      store.addClass(mockClass);

      expect(store.classes).toHaveLength(1);
      expect(store.classes[0]).toEqual(mockClass);

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('CREATE_CLASS');
    });

    it('should update class offline', () => {
      const store = useClassStore.getState();

      store.addClass(mockClass);

      const updatedClass = {
        ...mockClass,
        name: 'Open Dogs - Updated',
        scheduledTime: '10:00',
      };

      store.updateClass(updatedClass);

      expect(store.classes[0].name).toBe('Open Dogs - Updated');
      expect(store.classes[0].scheduledTime).toBe('10:00');

      // Verify sync queue has update
      const syncQueue = useSyncQueue.getState().queue;
      const updateOp = syncQueue.find(op => op.operation === 'UPDATE_CLASS');
      expect(updateOp).toBeDefined();
    });

    it('should delete class offline', () => {
      const store = useClassStore.getState();

      store.addClass(mockClass);
      expect(store.classes).toHaveLength(1);

      store.deleteClass('class-1');

      expect(store.classes).toHaveLength(0);

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      const deleteOp = syncQueue.find(op => op.operation === 'DELETE_CLASS');
      expect(deleteOp).toBeDefined();
    });

    it('should get classes by trial', () => {
      const store = useClassStore.getState();

      const class1 = { ...mockClass, id: 'class-1', trialId: 'trial-1' };
      const class2 = { ...mockClass, id: 'class-2', trialId: 'trial-1' };
      const class3 = { ...mockClass, id: 'class-3', trialId: 'trial-2' };

      store.addClass(class1);
      store.addClass(class2);
      store.addClass(class3);

      const trial1Classes = store.getClassesByTrial('trial-1');
      expect(trial1Classes).toHaveLength(2);

      const trial2Classes = store.getClassesByTrial('trial-2');
      expect(trial2Classes).toHaveLength(1);
    });

    it('should get classes by show', () => {
      const store = useClassStore.getState();

      const class1 = { ...mockClass, id: 'class-1', showId: 'show-1' };
      const class2 = { ...mockClass, id: 'class-2', showId: 'show-1' };
      const class3 = { ...mockClass, id: 'class-3', showId: 'show-2' };

      store.addClass(class1);
      store.addClass(class2);
      store.addClass(class3);

      const show1Classes = store.getClassesByShow('show-1');
      expect(show1Classes).toHaveLength(2);

      const show2Classes = store.getClassesByShow('show-2');
      expect(show2Classes).toHaveLength(1);
    });

    it('should update class status and track state changes', () => {
      const store = useClassStore.getState();

      store.addClass(mockClass);

      // Start judging
      store.updateClassStatus('class-1', 'in_progress');
      let updatedClass = store.getClass('class-1');
      expect(updatedClass?.status).toBe('in_progress');

      // Complete judging
      store.updateClassStatus('class-1', 'completed');
      updatedClass = store.getClass('class-1');
      expect(updatedClass?.status).toBe('completed');

      // Verify multiple sync queue entries
      const syncQueue = useSyncQueue.getState().queue;
      const statusUpdates = syncQueue.filter(
        op => op.operation === 'UPDATE_CLASS' && op.entityId === 'class-1'
      );
      expect(statusUpdates.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle class scheduling conflicts', () => {
      const store = useClassStore.getState();

      const class1 = {
        ...mockClass,
        id: 'class-1',
        rings: ['1'],
        scheduledTime: '09:00',
      };
      const class2 = {
        ...mockClass,
        id: 'class-2',
        rings: ['1'],
        scheduledTime: '09:00', // Same ring, same time
      };

      store.addClass(class1);
      store.addClass(class2);

      const conflicts = store.getSchedulingConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].classIds).toEqual(['class-1', 'class-2']);
      expect(conflicts[0].conflictType).toBe('RING_TIME_OVERLAP');
    });

    it('should calculate class entry statistics', () => {
      const store = useClassStore.getState();
      const entryStore = useEntryStore.getState();

      store.addClass(mockClass);

      // Add some entries
      const entries: Entry[] = [
        {
          id: 'entry-1',
          classId: 'class-1',
          showId: 'show-1',
          dogId: 'dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 1',
            entryFee: 25,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
        {
          id: 'entry-2',
          classId: 'class-1',
          showId: 'show-1',
          dogId: 'dog-2',
          status: 'waitlisted',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 2',
            entryFee: 25,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
      ];

      entries.forEach(entry => entryStore.addEntry(entry));

      const stats = store.getClassEntryStats('class-1');
      expect(stats.totalEntries).toBe(2);
      expect(stats.confirmedEntries).toBe(1);
      expect(stats.waitlistedEntries).toBe(1);
      expect(stats.availableSpots).toBe(19); // 20 max - 1 confirmed
    });
  });

  describe('EntryStore - Offline Entry Management', () => {
    const mockEntry: Entry = {
      id: 'entry-1',
      dogId: 'dog-1',
      classId: 'class-1',
      showId: 'show-1',
      status: 'confirmed',
      registrationData: {
        submittedAt: '2024-07-01T10:00:00Z',
        handler: 'John Smith',
        entryFee: 25,
        paymentStatus: 'paid',
      },
      statusHistory: [],
      createdAt: '2024-07-01T10:00:00Z',
      updatedAt: '2024-07-01T10:00:00Z',
    };

    it('should create entry offline', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);

      expect(store.entries).toHaveLength(1);
      expect(store.entries[0]).toEqual(mockEntry);

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('CREATE_ENTRY');
    });

    it('should update entry offline', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);

      const updatedEntry = {
        ...mockEntry,
        registrationData: {
          ...mockEntry.registrationData,
          handler: 'Jane Doe',
        },
      };

      store.updateEntry(updatedEntry);

      expect(store.entries[0].registrationData.handler).toBe('Jane Doe');

      // Verify sync queue has update
      const syncQueue = useSyncQueue.getState().queue;
      const updateOp = syncQueue.find(op => op.operation === 'UPDATE_ENTRY');
      expect(updateOp).toBeDefined();
    });

    it('should delete entry offline', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);
      expect(store.entries).toHaveLength(1);

      store.deleteEntry('entry-1');

      expect(store.entries).toHaveLength(0);

      // Verify sync queue
      const syncQueue = useSyncQueue.getState().queue;
      const deleteOp = syncQueue.find(op => op.operation === 'DELETE_ENTRY');
      expect(deleteOp).toBeDefined();
    });

    it('should update entry status with history tracking', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);

      // Update status from confirmed to checked_in
      store.updateEntryStatus('entry-1', 'checked_in', 'gate-steward-1');

      const updatedEntry = store.getEntry('entry-1');
      expect(updatedEntry?.status).toBe('checked_in');
      expect(updatedEntry?.statusHistory).toHaveLength(1);
      expect(updatedEntry?.statusHistory[0].status).toBe('checked_in');
      expect(updatedEntry?.statusHistory[0].changedBy).toBe('gate-steward-1');

      // Update status again
      store.updateEntryStatus('entry-1', 'judged', 'judge-1');

      const finalEntry = store.getEntry('entry-1');
      expect(finalEntry?.status).toBe('judged');
      expect(finalEntry?.statusHistory).toHaveLength(2);
    });

    it('should get entries by various filters', () => {
      const store = useEntryStore.getState();

      const entries: Entry[] = [
        { ...mockEntry, id: 'entry-1', classId: 'class-1', status: 'confirmed' },
        { ...mockEntry, id: 'entry-2', classId: 'class-1', status: 'checked_in' },
        { ...mockEntry, id: 'entry-3', classId: 'class-2', status: 'confirmed' },
        { ...mockEntry, id: 'entry-4', classId: 'class-1', status: 'withdrawn' },
      ];

      entries.forEach(entry => store.addEntry(entry));

      // Get by class
      const class1Entries = store.getEntriesByClass('class-1');
      expect(class1Entries).toHaveLength(3);

      // Get by status
      const confirmedEntries = store.getEntriesByStatus('confirmed');
      expect(confirmedEntries).toHaveLength(2);

      // Get by show
      const showEntries = store.getEntriesByShow('show-1');
      expect(showEntries).toHaveLength(4);

      // Get by dog
      const dogEntries = store.getEntriesByDog('dog-1');
      expect(dogEntries).toHaveLength(4);
    });

    it('should handle entry check-in workflow', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);

      // Check in entry with armband
      store.checkInEntry('entry-1', '101', 'gate-steward-1');

      const checkedInEntry = store.getEntry('entry-1');
      expect(checkedInEntry?.status).toBe('checked_in');
      expect(checkedInEntry?.armbandNumber).toBe('101');
      expect(checkedInEntry?.checkInData?.checkedInBy).toBe('gate-steward-1');
      expect(checkedInEntry?.checkInData?.checkedInAt).toBeDefined();

      // Verify status history
      expect(checkedInEntry?.statusHistory).toHaveLength(1);
      expect(checkedInEntry?.statusHistory[0].status).toBe('checked_in');
    });

    it('should handle entry scoring workflow', () => {
      const store = useEntryStore.getState();

      // Start with checked-in entry
      const checkedInEntry = {
        ...mockEntry,
        status: 'checked_in' as EntryStatus,
        armbandNumber: '101',
      };

      store.addEntry(checkedInEntry);

      // Score entry
      const scoreData = {
        placement: 1,
        score: 195.5,
        comments: 'Excellent performance',
        judgeId: 'judge-1',
      };

      store.scoreEntry('entry-1', scoreData);

      const scoredEntry = store.getEntry('entry-1');
      expect(scoredEntry?.status).toBe('judged');
      expect(scoredEntry?.score).toEqual(scoreData);

      // Verify status history includes judging
      expect(scoredEntry?.statusHistory).toHaveLength(1);
      expect(scoredEntry?.statusHistory[0].status).toBe('judged');
    });

    it('should handle bulk operations efficiently', () => {
      const store = useEntryStore.getState();

      // Create many entries
      const manyEntries = Array.from({ length: 100 }, (_, i) => ({
        ...mockEntry,
        id: `entry-${i}`,
        dogId: `dog-${i}`,
      }));

      const startTime = performance.now();

      // Bulk add
      store.bulkAddEntries(manyEntries);

      const endTime = performance.now();

      expect(store.entries).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast

      // Verify sync queue efficiency
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1); // Should be batched
      expect(syncQueue[0].operation).toBe('BULK_CREATE_ENTRIES');
    });

    it('should handle entry withdrawal with refund tracking', () => {
      const store = useEntryStore.getState();

      store.addEntry(mockEntry);

      const withdrawalData = {
        reason: 'Dog injured',
        refundAmount: 25,
        refundStatus: 'pending' as const,
        withdrawnBy: 'owner-1',
      };

      store.withdrawEntry('entry-1', withdrawalData);

      const withdrawnEntry = store.getEntry('entry-1');
      expect(withdrawnEntry?.status).toBe('withdrawn');
      expect(withdrawnEntry?.withdrawalData).toEqual(withdrawalData);

      // Verify status history
      expect(withdrawnEntry?.statusHistory).toHaveLength(1);
      expect(withdrawnEntry?.statusHistory[0].status).toBe('withdrawn');
    });
  });

  describe('Store Integration and Workflow Tests', () => {
    it('should handle complete show creation workflow offline', () => {
      const trialStore = useTrialStore.getState();
      const classStore = useClassStore.getState();
      const entryStore = useEntryStore.getState();

      // Create trial
      const trial: Trial = {
        id: 'trial-1',
        name: 'Complete Workflow Trial',
        showId: 'show-1',
        type: 'agility',
        startDate: '2024-07-15',
        endDate: '2024-07-15',
        status: 'scheduled',
        entries: [],
        judges: ['judge-1'],
        location: 'Test Venue',
        maxEntries: 100,
        entryFee: 35,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z',
      };

      trialStore.createTrial(trial);

      // Create classes for trial
      const classes: Class[] = [
        {
          id: 'class-1',
          name: 'Novice A',
          showId: 'show-1',
          trialId: 'trial-1',
          maxEntries: 20,
          entryFee: 25,
          status: 'scheduled',
          judgeId: 'judge-1',
          rings: ['1'],
          scheduledTime: '09:00',
          estimatedDuration: 60,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z',
        },
        {
          id: 'class-2',
          name: 'Open A',
          showId: 'show-1',
          trialId: 'trial-1',
          maxEntries: 15,
          entryFee: 30,
          status: 'scheduled',
          judgeId: 'judge-1',
          rings: ['1'],
          scheduledTime: '11:00',
          estimatedDuration: 90,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z',
        },
      ];

      classes.forEach(cls => classStore.addClass(cls));

      // Create entries
      const entries: Entry[] = [
        {
          id: 'entry-1',
          dogId: 'dog-1',
          classId: 'class-1',
          showId: 'show-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 1',
            entryFee: 25,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
        {
          id: 'entry-2',
          dogId: 'dog-2',
          classId: 'class-2',
          showId: 'show-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 2',
            entryFee: 30,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
      ];

      entries.forEach(entry => entryStore.addEntry(entry));

      // Verify complete show structure
      expect(trialStore.trials).toHaveLength(1);
      expect(classStore.classes).toHaveLength(2);
      expect(entryStore.entries).toHaveLength(2);

      // Verify relationships
      const trialClasses = classStore.getClassesByTrial('trial-1');
      expect(trialClasses).toHaveLength(2);

      const class1Entries = entryStore.getEntriesByClass('class-1');
      expect(class1Entries).toHaveLength(1);

      // Verify sync queue captured all operations
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue.length).toBeGreaterThanOrEqual(5); // 1 trial + 2 classes + 2 entries
    });

    it('should handle complete judging workflow offline', () => {
      const classStore = useClassStore.getState();
      const entryStore = useEntryStore.getState();

      // Set up class and entries
      const mockClass: Class = {
        id: 'class-1',
        name: 'Open Dogs',
        showId: 'show-1',
        maxEntries: 10,
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 60,
        scoringType: 'placement',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z',
      };

      classStore.addClass(mockClass);

      const entries: Entry[] = [
        {
          id: 'entry-1',
          dogId: 'dog-1',
          classId: 'class-1',
          showId: 'show-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 1',
            entryFee: 25,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
        {
          id: 'entry-2',
          dogId: 'dog-2',
          classId: 'class-1',
          showId: 'show-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: '2024-07-01T10:00:00Z',
            handler: 'Handler 2',
            entryFee: 25,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: '2024-07-01T10:00:00Z',
          updatedAt: '2024-07-01T10:00:00Z',
        },
      ];

      entries.forEach(entry => entryStore.addEntry(entry));

      // Start judging workflow
      classStore.updateClassStatus('class-1', 'check_in_open');

      // Check in entries
      entryStore.checkInEntry('entry-1', '101', 'gate-steward-1');
      entryStore.checkInEntry('entry-2', '102', 'gate-steward-1');

      // Start judging
      classStore.updateClassStatus('class-1', 'in_progress');

      // Score entries
      entryStore.scoreEntry('entry-1', {
        placement: 2,
        comments: 'Good performance',
        judgeId: 'judge-1',
      });

      entryStore.scoreEntry('entry-2', {
        placement: 1,
        comments: 'Excellent performance',
        judgeId: 'judge-1',
      });

      // Complete judging
      classStore.updateClassStatus('class-1', 'completed');

      // Verify final state
      const finalClass = classStore.getClass('class-1');
      expect(finalClass?.status).toBe('completed');

      const finalEntries = entryStore.getEntriesByClass('class-1');
      expect(finalEntries.every(e => e.status === 'judged')).toBe(true);
      expect(finalEntries.every(e => e.score)).toBe(true);

      // Verify comprehensive sync queue
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue.length).toBeGreaterThan(10); // Many operations recorded
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle store operation failures gracefully', () => {
      const store = useTrialStore.getState();

      // Mock store method to throw error
      const originalCreate = store.createTrial;
      store.createTrial = vi.fn().mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      expect(() => {
        store.createTrial({
          id: 'trial-1',
          name: 'Test Trial',
          showId: 'show-1',
          type: 'agility',
          startDate: '2024-07-15',
          endDate: '2024-07-15',
          status: 'scheduled',
          entries: [],
          judges: [],
          location: 'Test',
          maxEntries: 100,
          entryFee: 35,
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z',
        });
      }).toThrow('Storage quota exceeded');

      // Restore original method
      store.createTrial = originalCreate;
    });

    it('should handle invalid data gracefully', () => {
      const store = useEntryStore.getState();

      // Try to add entry with invalid data
      const invalidEntry = {
        id: '', // Invalid empty ID
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        status: 'invalid_status' as EntryStatus, // Invalid status
      } as Entry;

      expect(() => {
        store.addEntry(invalidEntry);
      }).toThrow();
    });

    it('should handle concurrent modifications', () => {
      const store = useEntryStore.getState();

      const entry: Entry = {
        id: 'entry-1',
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        status: 'confirmed',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler 1',
          entryFee: 25,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z',
      };

      store.addEntry(entry);

      // Simulate concurrent updates
      const update1 = {
        ...entry,
        registrationData: { ...entry.registrationData, handler: 'Handler A' },
      };
      const update2 = {
        ...entry,
        registrationData: { ...entry.registrationData, handler: 'Handler B' },
      };

      store.updateEntry(update1);
      store.updateEntry(update2);

      // Last update should win
      const finalEntry = store.getEntry('entry-1');
      expect(finalEntry?.registrationData.handler).toBe('Handler B');
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle large datasets efficiently', () => {
      const entryStore = useEntryStore.getState();

      // Create large number of entries
      const largeEntrySet = Array.from({ length: 1000 }, (_, i) => ({
        id: `entry-${i}`,
        dogId: `dog-${i}`,
        classId: `class-${i % 10}`, // 10 classes
        showId: 'show-1',
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

      const startTime = performance.now();
      entryStore.bulkAddEntries(largeEntrySet);
      const endTime = performance.now();

      expect(entryStore.entries).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(500); // Should be fast

      // Test query performance
      const queryStart = performance.now();
      const classEntries = entryStore.getEntriesByClass('class-0');
      const queryEnd = performance.now();

      expect(classEntries).toHaveLength(100);
      expect(queryEnd - queryStart).toBeLessThan(50); // Very fast query
    });

    it('should manage memory efficiently with cleanup', () => {
      const stores = [useTrialStore, useClassStore, useEntryStore];

      // Fill stores with data
      stores.forEach(storeHook => {
        const store = storeHook.getState();

        if ('createTrial' in store) {
          for (let i = 0; i < 100; i++) {
            store.createTrial({
              id: `trial-${i}`,
              name: `Trial ${i}`,
              showId: 'show-1',
              type: 'agility',
              startDate: '2024-07-15',
              endDate: '2024-07-15',
              status: 'scheduled',
              entries: [],
              judges: [],
              location: 'Test',
              maxEntries: 100,
              entryFee: 35,
              createdAt: '2024-07-01T08:00:00Z',
              updatedAt: '2024-07-01T08:00:00Z',
            });
          }
        }
      });

      // Clear all stores
      stores.forEach(storeHook => {
        const store = storeHook.getState();
        if ('clearTrials' in store) store.clearTrials();
        if ('clearClasses' in store) store.clearClasses();
        if ('clearEntries' in store) store.clearEntries();
      });

      // Verify cleanup
      expect(useTrialStore.getState().trials).toHaveLength(0);
      expect(useClassStore.getState().classes).toHaveLength(0);
      expect(useEntryStore.getState().entries).toHaveLength(0);
    });
  });
});
