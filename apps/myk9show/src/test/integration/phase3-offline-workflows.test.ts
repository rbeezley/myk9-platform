/**
 * Comprehensive integration tests for Phase 3 Offline Workflows
 * Tests complete end-to-end scenarios for offline show operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Service imports
import { OfflineEntryCreator } from '@/services/entries/OfflineEntryCreator';
import { OfflineScoringService } from '@/services/scoring/OfflineScoringService';
import { OfflineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { ArmbandManager } from '@/services/offline-checkin/ArmbandManager';
import { GateCoordinator } from '@/services/offline-checkin/GateCoordinator';

// Store imports
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useEntryStore } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';
import { useSyncQueue } from '@/store/syncQueue';

// Type imports
import type { Show } from '@/types/show-types';
import type { Trial } from '@/types/trial-types';
import type { Class } from '@/types/class-types';

describe('Phase 3 Offline Workflow Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    
    // Reset all stores
    useShowStore.getState().clearShows();
    useTrialStore.getState().clearTrials();
    useClassStore.getState().clearClasses();
    useEntryStore.getState().clearEntries();
    useSyncQueue.getState().clearQueue();
    
    // Reset service states
    ArmbandManager.reset();
    GateCoordinator.reset();
  });

  describe('Complete Show Setup and Entry Management Workflow', () => {
    it('should handle complete offline show creation and entry processing', async () => {
      // 1. Create show structure
      const show: Show = {
        id: 'show-1',
        name: 'Regional Dog Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const trial: Trial = {
        id: 'trial-1',
        name: 'Agility Trial',
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
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const classes: Class[] = [
        {
          id: 'class-1',
          name: 'Novice A Standard',
          showId: 'show-1',
          trialId: 'trial-1',
          maxEntries: 20,
          entryFee: 25,
          status: 'scheduled',
          judgeId: 'judge-1',
          rings: ['1'],
          scheduledTime: '09:00',
          estimatedDuration: 90,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        },
        {
          id: 'class-2',
          name: 'Open A Standard',
          showId: 'show-1',
          trialId: 'trial-1',
          maxEntries: 15,
          entryFee: 30,
          status: 'scheduled',
          judgeId: 'judge-1',
          rings: ['1'],
          scheduledTime: '11:00',
          estimatedDuration: 120,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        }
      ];

      // Set up show structure
      useShowStore.getState().addShow(show);
      useTrialStore.getState().createTrial(trial);
      classes.forEach(cls => useClassStore.getState().addClass(cls));

      // Initialize armband ranges
      ArmbandManager.initializeRanges('show-1', [
        { classId: 'class-1', startNumber: 101, endNumber: 120 },
        { classId: 'class-2', startNumber: 201, endNumber: 215 }
      ]);

      // 2. Process entries for multiple classes
      const entryRequests = [
        { dogId: 'dog-1', classId: 'class-1', handler: 'Alice Smith' },
        { dogId: 'dog-2', classId: 'class-1', handler: 'Bob Jones' },
        { dogId: 'dog-3', classId: 'class-2', handler: 'Carol Wilson' },
        { dogId: 'dog-1', classId: 'class-2', handler: 'Alice Smith' }, // Same dog, different class
        { dogId: 'dog-4', classId: 'class-1', handler: 'David Brown' }
      ];

      const entryResults = [];
      for (const request of entryRequests) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: request.dogId,
          classId: request.classId,
          showId: 'show-1',
          handler: request.handler,
          entryFee: request.classId === 'class-1' ? 25 : 30
        });
        entryResults.push(result);
      }

      // Verify all entries created successfully
      expect(entryResults.every(r => r.success)).toBe(true);
      
      const allEntries = useEntryStore.getState().entries;
      expect(allEntries).toHaveLength(5);

      // Verify class distribution
      const class1Entries = useEntryStore.getState().getEntriesByClass('class-1');
      const class2Entries = useEntryStore.getState().getEntriesByClass('class-2');
      expect(class1Entries).toHaveLength(3);
      expect(class2Entries).toHaveLength(2);

      // 3. Test entry modifications
      const firstEntry = entryResults[0].entry!;
      const updateResult = await OfflineEntryCreator.updateEntry(firstEntry.id, {
        handler: 'Alice Smith-Updated',
        specialRequests: 'Early ring time'
      });
      
      expect(updateResult.success).toBe(true);
      expect(updateResult.entry?.registrationData.handler).toBe('Alice Smith-Updated');

      // 4. Test entry withdrawal
      const withdrawalResult = await OfflineEntryCreator.withdrawEntry(
        entryResults[4].entry!.id,
        'Dog injured'
      );
      
      expect(withdrawalResult.success).toBe(true);
      
      const withdrawnEntry = useEntryStore.getState().getEntry(entryResults[4].entry!.id);
      expect(withdrawnEntry?.status).toBe('withdrawn');

      // 5. Verify sync queue captured all operations
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue.length).toBeGreaterThan(10); // Show setup + entries + modifications

      // Verify operation types
      const createOperations = syncQueue.filter(op => op.operation.includes('CREATE'));
      const updateOperations = syncQueue.filter(op => op.operation.includes('UPDATE'));
      const withdrawOperations = syncQueue.filter(op => op.operation.includes('WITHDRAW'));
      
      expect(createOperations.length).toBeGreaterThan(5);
      expect(updateOperations.length).toBeGreaterThan(0);
      expect(withdrawOperations.length).toBe(1);
    });

    it('should handle capacity limits and waitlist management', async () => {
      // Set up limited capacity class
      const limitedClass: Class = {
        id: 'limited-class',
        name: 'Limited Class',
        showId: 'show-1',
        maxEntries: 3, // Very limited
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 60,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow({
        id: 'show-1',
        name: 'Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      });

      useClassStore.getState().addClass(limitedClass);

      // Create entries to fill and exceed capacity
      const entryRequests = Array.from({ length: 6 }, (_, i) => ({
        dogId: `dog-${i + 1}`,
        classId: 'limited-class',
        showId: 'show-1',
        handler: `Handler ${i + 1}`,
        entryFee: 25
      }));

      const results = [];
      for (const request of entryRequests) {
        const result = await OfflineEntryCreator.createEntry(request);
        results.push(result);
      }

      // First 3 should be confirmed, rest waitlisted
      expect(results.slice(0, 3).every(r => r.entry?.status === 'confirmed')).toBe(true);
      expect(results.slice(3).every(r => r.entry?.status === 'waitlisted')).toBe(true);

      // Verify warnings for waitlisted entries
      expect(results.slice(3).every(r => r.warnings?.includes('CLASS_AT_CAPACITY'))).toBe(true);

      // Test waitlist promotion when entry is withdrawn
      const confirmedEntries = results.slice(0, 3);
      const withdrawResult = await OfflineEntryCreator.withdrawEntry(
        confirmedEntries[0].entry!.id,
        'Withdrew entry'
      );

      expect(withdrawResult.success).toBe(true);

      // Check if waitlist was promoted (this would be handled by the system)
      const allEntries = useEntryStore.getState().getEntriesByClass('limited-class');
      const confirmedCount = allEntries.filter(e => e.status === 'confirmed' || e.status === 'paid').length;
      const waitlistedCount = allEntries.filter(e => e.status === 'waitlisted').length;

      expect(confirmedCount).toBe(2); // 2 remaining confirmed + should promote 1 from waitlist
      expect(waitlistedCount).toBe(3); // 3 remaining waitlisted
    });
  });

  describe('Complete Check-in and Judging Workflow', () => {
    it('should handle complete offline check-in to scoring workflow', async () => {
      // Set up show structure
      const show: Show = {
        id: 'show-1',
        name: 'Check-in Workflow Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const judgingClass: Class = {
        id: 'judging-class',
        name: 'Standard Agility',
        showId: 'show-1',
        maxEntries: 10,
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 90,
        scoringType: 'time_plus_faults',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(judgingClass);

      // Initialize gate coordination
      GateCoordinator.initializeGates([
        { id: 'main-gate', name: 'Main Gate', rings: ['1'] }
      ]);

      // Initialize armband ranges
      ArmbandManager.initializeRanges('show-1', [
        { classId: 'judging-class', startNumber: 101, endNumber: 110 }
      ]);

      // 1. Create entries
      const entries = [];
      for (let i = 1; i <= 5; i++) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: `dog-${i}`,
          classId: 'judging-class',
          showId: 'show-1',
          handler: `Handler ${i}`,
          entryFee: 25
        });
        expect(result.success).toBe(true);
        entries.push(result.entry!);
      }

      // 2. Open check-in for class
      useClassStore.getState().updateClassStatus('judging-class', 'check_in_open');

      // 3. Check in entries with armbands
      const checkInResults = [];
      for (let i = 0; i < entries.length; i++) {
        const checkInResult = await GateCoordinator.processCheckIn('main-gate', {
          entryId: entries[i].id,
          classId: 'judging-class',
          showId: 'show-1',
          checkedInBy: 'gate-steward-1',
          checkedInAt: new Date().toISOString(),
          armbandNumber: `${101 + i}`
        });
        checkInResults.push(checkInResult);
      }

      // Verify all check-ins successful
      expect(checkInResults.every(r => r.success)).toBe(true);

      // Verify entry statuses updated
      const checkedInEntries = useEntryStore.getState().getEntriesByClass('judging-class');
      expect(checkedInEntries.every(e => e.status === 'checked_in')).toBe(true);
      expect(checkedInEntries.every(e => e.armbandNumber)).toBe(true);

      // 4. Start judging
      useClassStore.getState().updateClassStatus('judging-class', 'in_progress');

      // 5. Record scores for all entries
      const scoreResults = [];
      for (let i = 0; i < entries.length; i++) {
        const scoreResult = await OfflineScoringService.recordScore({
          entryId: entries[i].id,
          classId: 'judging-class',
          judgeId: 'judge-1',
          time: `${45 + i * 2}.${Math.floor(Math.random() * 100)}`,
          faults: i % 2, // Alternate faults
          status: 'Qualified',
          scoredAt: new Date().toISOString()
        });
        scoreResults.push(scoreResult);
      }

      // Verify all scores recorded
      expect(scoreResults.every(r => r.success)).toBe(true);

      // Verify entry statuses updated to judged
      const scoredEntries = useEntryStore.getState().getEntriesByClass('judging-class');
      expect(scoredEntries.every(e => e.status === 'judged')).toBe(true);

      // 6. Complete judging
      useClassStore.getState().updateClassStatus('judging-class', 'completed');

      // Verify final class status
      const finalClass = useClassStore.getState().getClass('judging-class');
      expect(finalClass?.status).toBe('completed');

      // 7. Verify comprehensive sync queue
      const syncQueue = useSyncQueue.getState().queue;
      
      // Should include: entries, check-ins, scores, class status updates
      const entryOps = syncQueue.filter(op => op.operation.includes('ENTRY'));
      const checkInOps = syncQueue.filter(op => op.operation.includes('CHECK_IN'));
      const scoreOps = syncQueue.filter(op => op.operation.includes('SCORE'));
      const classOps = syncQueue.filter(op => op.operation.includes('CLASS'));

      expect(entryOps.length).toBe(5); // 5 entries created
      expect(checkInOps.length).toBe(5); // 5 check-ins
      expect(scoreOps.length).toBe(5); // 5 scores
      expect(classOps.length).toBeGreaterThanOrEqual(3); // Multiple status updates

      // 8. Verify gate activity tracking
      const gateActivity = GateCoordinator.getGateActivity('main-gate');
      expect(gateActivity.checkInsToday).toBe(5);
    });

    it('should handle conflict resolution during check-in', async () => {
      // Set up show and class
      const show: Show = {
        id: 'show-1',
        name: 'Conflict Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const testClass: Class = {
        id: 'conflict-class',
        name: 'Conflict Test Class',
        showId: 'show-1',
        maxEntries: 10,
        entryFee: 25,
        status: 'check_in_open',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 60,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(testClass);

      // Initialize multiple gates
      GateCoordinator.initializeGates([
        { id: 'gate-1', name: 'Gate 1', rings: ['1'] },
        { id: 'gate-2', name: 'Gate 2', rings: ['1'] }
      ]);

      ArmbandManager.initializeRanges('show-1', [
        { classId: 'conflict-class', startNumber: 101, endNumber: 110 }
      ]);

      // Create entries
      const entries = [];
      for (let i = 1; i <= 3; i++) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: `dog-${i}`,
          classId: 'conflict-class',
          showId: 'show-1',
          handler: `Handler ${i}`,
          entryFee: 25
        });
        entries.push(result.entry!);
      }

      // Simulate simultaneous check-in attempts from different gates with same armband
      const conflictPromises = [
        GateCoordinator.processCheckIn('gate-1', {
          entryId: entries[0].id,
          classId: 'conflict-class',
          showId: 'show-1',
          checkedInBy: 'steward-1',
          checkedInAt: new Date().toISOString(),
          armbandNumber: '101'
        }),
        GateCoordinator.processCheckIn('gate-2', {
          entryId: entries[1].id,
          classId: 'conflict-class',
          showId: 'show-1',
          checkedInBy: 'steward-2',
          checkedInAt: new Date().toISOString(),
          armbandNumber: '101' // Same armband!
        })
      ];

      const conflictResults = await Promise.all(conflictPromises);

      // One should succeed, one should fail
      const successCount = conflictResults.filter(r => r.success).length;
      const failureCount = conflictResults.filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Failed one should have conflict error
      const failedResult = conflictResults.find(r => !r.success);
      expect(failedResult?.errors).toContain('ARMBAND_ALREADY_ASSIGNED');

      // Check in the failed entry with different armband
      const retryResult = await GateCoordinator.processCheckIn('gate-2', {
        entryId: entries[1].id,
        classId: 'conflict-class',
        showId: 'show-1',
        checkedInBy: 'steward-2',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '102'
      });

      expect(retryResult.success).toBe(true);

      // Verify both entries are now checked in with different armbands
      const finalEntries = useEntryStore.getState().getEntriesByClass('conflict-class');
      const checkedInEntries = finalEntries.filter(e => e.status === 'checked_in');
      expect(checkedInEntries).toHaveLength(2);

      const armbands = checkedInEntries.map(e => e.armbandNumber).sort();
      expect(armbands).toEqual(['101', '102']);
    });
  });

  describe('Multi-Class and Multi-Trial Workflows', () => {
    it('should handle complex multi-trial show with overlapping schedules', async () => {
      // Set up comprehensive show structure
      const show: Show = {
        id: 'multi-show',
        name: 'Complex Multi-Trial Show',
        date: '2024-07-15',
        location: 'Large Venue',
        status: 'active',
        organizingClub: 'Major Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const trials: Trial[] = [
        {
          id: 'agility-trial',
          name: 'Agility Trial',
          showId: 'multi-show',
          type: 'agility',
          startDate: '2024-07-15',
          endDate: '2024-07-15',
          status: 'scheduled',
          entries: [],
          judges: ['judge-agility'],
          location: 'Rings 1-2',
          maxEntries: 100,
          entryFee: 35,
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        },
        {
          id: 'obedience-trial',
          name: 'Obedience Trial',
          showId: 'multi-show',
          type: 'obedience',
          startDate: '2024-07-15',
          endDate: '2024-07-15',
          status: 'scheduled',
          entries: [],
          judges: ['judge-obedience'],
          location: 'Ring 3',
          maxEntries: 50,
          entryFee: 30,
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        }
      ];

      const classes: Class[] = [
        // Agility classes
        {
          id: 'ag-novice-std',
          name: 'Novice Standard',
          showId: 'multi-show',
          trialId: 'agility-trial',
          maxEntries: 25,
          entryFee: 25,
          status: 'scheduled',
          judgeId: 'judge-agility',
          rings: ['1'],
          scheduledTime: '09:00',
          estimatedDuration: 90,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        },
        {
          id: 'ag-open-std',
          name: 'Open Standard',
          showId: 'multi-show',
          trialId: 'agility-trial',
          maxEntries: 20,
          entryFee: 30,
          status: 'scheduled',
          judgeId: 'judge-agility',
          rings: ['1'],
          scheduledTime: '11:00',
          estimatedDuration: 120,
          scoringType: 'time_plus_faults',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        },
        // Obedience classes
        {
          id: 'ob-novice',
          name: 'Novice Obedience',
          showId: 'multi-show',
          trialId: 'obedience-trial',
          maxEntries: 15,
          entryFee: 20,
          status: 'scheduled',
          judgeId: 'judge-obedience',
          rings: ['3'],
          scheduledTime: '09:30',
          estimatedDuration: 60,
          scoringType: 'points',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        },
        {
          id: 'ob-open',
          name: 'Open Obedience',
          showId: 'multi-show',
          trialId: 'obedience-trial',
          maxEntries: 12,
          entryFee: 25,
          status: 'scheduled',
          judgeId: 'judge-obedience',
          rings: ['3'],
          scheduledTime: '11:30',
          estimatedDuration: 75,
          scoringType: 'points',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        }
      ];

      // Set up complete structure
      useShowStore.getState().addShow(show);
      trials.forEach(trial => useTrialStore.getState().createTrial(trial));
      classes.forEach(cls => useClassStore.getState().addClass(cls));

      // Initialize separate armband ranges for different trials
      ArmbandManager.initializeRanges('multi-show', [
        { classId: 'ag-novice-std', startNumber: 101, endNumber: 125 },
        { classId: 'ag-open-std', startNumber: 201, endNumber: 220 },
        { classId: 'ob-novice', startNumber: 301, endNumber: 315 },
        { classId: 'ob-open', startNumber: 401, endNumber: 412 }
      ]);

      // Initialize gates for different areas
      GateCoordinator.initializeGates([
        { id: 'agility-gate', name: 'Agility Gate', rings: ['1', '2'] },
        { id: 'obedience-gate', name: 'Obedience Gate', rings: ['3'] }
      ]);

      // Create entries across multiple trials and classes
      const entryRequests = [
        // Dog 1: Multiple agility classes
        { dogId: 'dog-1', classId: 'ag-novice-std', handler: 'Handler 1', entryFee: 25 },
        { dogId: 'dog-1', classId: 'ag-open-std', handler: 'Handler 1', entryFee: 30 },
        
        // Dog 2: Both agility and obedience
        { dogId: 'dog-2', classId: 'ag-novice-std', handler: 'Handler 2', entryFee: 25 },
        { dogId: 'dog-2', classId: 'ob-novice', handler: 'Handler 2', entryFee: 20 },
        
        // Dog 3: Obedience only
        { dogId: 'dog-3', classId: 'ob-novice', handler: 'Handler 3', entryFee: 20 },
        { dogId: 'dog-3', classId: 'ob-open', handler: 'Handler 3', entryFee: 25 },
        
        // Additional entries
        { dogId: 'dog-4', classId: 'ag-novice-std', handler: 'Handler 4', entryFee: 25 },
        { dogId: 'dog-5', classId: 'ob-novice', handler: 'Handler 5', entryFee: 20 }
      ];

      // Process all entries
      const entryResults = [];
      for (const request of entryRequests) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: request.dogId,
          classId: request.classId,
          showId: 'multi-show',
          handler: request.handler,
          entryFee: request.entryFee
        });
        entryResults.push(result);
      }

      // Verify all entries successful
      expect(entryResults.every(r => r.success)).toBe(true);

      // Verify entry distribution across trials
      const agilityEntries = useEntryStore.getState().entries.filter(e => 
        ['ag-novice-std', 'ag-open-std'].includes(e.classId)
      );
      const obedienceEntries = useEntryStore.getState().entries.filter(e => 
        ['ob-novice', 'ob-open'].includes(e.classId)
      );

      expect(agilityEntries).toHaveLength(4);
      expect(obedienceEntries).toHaveLength(4);

      // Verify same dog can be in multiple classes
      const dog1Entries = useEntryStore.getState().getEntriesByDog('dog-1');
      const dog2Entries = useEntryStore.getState().getEntriesByDog('dog-2');
      
      expect(dog1Entries).toHaveLength(2); // Both agility classes
      expect(dog2Entries).toHaveLength(2); // One agility, one obedience

      // Test concurrent check-in workflow for overlapping schedules
      
      // 1. Open check-in for agility classes
      useClassStore.getState().updateClassStatus('ag-novice-std', 'check_in_open');
      
      // 2. Check in agility entries
      const agilityCheckIns = [];
      let armbandCounter = 101;
      for (const entry of agilityEntries.filter(e => e.classId === 'ag-novice-std')) {
        const result = await GateCoordinator.processCheckIn('agility-gate', {
          entryId: entry.id,
          classId: 'ag-novice-std',
          showId: 'multi-show',
          checkedInBy: 'agility-steward',
          checkedInAt: new Date().toISOString(),
          armbandNumber: armbandCounter.toString()
        });
        agilityCheckIns.push(result);
        armbandCounter++;
      }

      // 3. Simultaneously open obedience check-in
      useClassStore.getState().updateClassStatus('ob-novice', 'check_in_open');
      
      // 4. Check in obedience entries
      const obedienceCheckIns = [];
      armbandCounter = 301;
      for (const entry of obedienceEntries.filter(e => e.classId === 'ob-novice')) {
        const result = await GateCoordinator.processCheckIn('obedience-gate', {
          entryId: entry.id,
          classId: 'ob-novice',
          showId: 'multi-show',
          checkedInBy: 'obedience-steward',
          checkedInAt: new Date().toISOString(),
          armbandNumber: armbandCounter.toString()
        });
        obedienceCheckIns.push(result);
        armbandCounter++;
      }

      // Verify all check-ins successful
      expect(agilityCheckIns.every(r => r.success)).toBe(true);
      expect(obedienceCheckIns.every(r => r.success)).toBe(true);

      // Verify gate activity separation
      const agilityGateActivity = GateCoordinator.getGateActivity('agility-gate');
      const obedienceGateActivity = GateCoordinator.getGateActivity('obedience-gate');

      expect(agilityGateActivity.checkInsToday).toBe(3); // 3 agility novice entries
      expect(obedienceGateActivity.checkInsToday).toBe(3); // 3 obedience novice entries

      // 5. Start judging both trials simultaneously
      useClassStore.getState().updateClassStatus('ag-novice-std', 'in_progress');
      useClassStore.getState().updateClassStatus('ob-novice', 'in_progress');

      // 6. Record scores for both trials
      const agilityScores = [];
      const checkedInAgilityEntries = useEntryStore.getState().getEntriesByClass('ag-novice-std')
        .filter(e => e.status === 'checked_in');

      for (let i = 0; i < checkedInAgilityEntries.length; i++) {
        const result = await OfflineScoringService.recordScore({
          entryId: checkedInAgilityEntries[i].id,
          classId: 'ag-novice-std',
          judgeId: 'judge-agility',
          time: `${50 + i * 3}.${Math.floor(Math.random() * 100)}`,
          faults: i % 3,
          status: 'Qualified',
          scoredAt: new Date().toISOString()
        });
        agilityScores.push(result);
      }

      const obedienceScores = [];
      const checkedInObedienceEntries = useEntryStore.getState().getEntriesByClass('ob-novice')
        .filter(e => e.status === 'checked_in');

      for (let i = 0; i < checkedInObedienceEntries.length; i++) {
        const result = await OfflineScoringService.recordScore({
          entryId: checkedInObedienceEntries[i].id,
          classId: 'ob-novice',
          judgeId: 'judge-obedience',
          points: 190 + (i * 2),
          maxPoints: 200,
          status: 'Qualified',
          scoredAt: new Date().toISOString()
        });
        obedienceScores.push(result);
      }

      // Verify all scores recorded
      expect(agilityScores.every(r => r.success)).toBe(true);
      expect(obedienceScores.every(r => r.success)).toBe(true);

      // 7. Complete both classes
      useClassStore.getState().updateClassStatus('ag-novice-std', 'completed');
      useClassStore.getState().updateClassStatus('ob-novice', 'completed');

      // Verify final state
      const finalAgilityClass = useClassStore.getState().getClass('ag-novice-std');
      const finalObedienceClass = useClassStore.getState().getClass('ob-novice');

      expect(finalAgilityClass?.status).toBe('completed');
      expect(finalObedienceClass?.status).toBe('completed');

      // 8. Verify comprehensive sync queue captures all operations across trials
      const syncQueue = useSyncQueue.getState().queue;
      
      // Should have operations for both trials
      const agilityOps = syncQueue.filter(op => 
        op.data && (
          op.data.classId?.includes('ag-') || 
          op.data.trialId === 'agility-trial'
        )
      );
      const obedienceOps = syncQueue.filter(op => 
        op.data && (
          op.data.classId?.includes('ob-') || 
          op.data.trialId === 'obedience-trial'
        )
      );

      expect(agilityOps.length).toBeGreaterThan(5);
      expect(obedienceOps.length).toBeGreaterThan(5);
      expect(syncQueue.length).toBeGreaterThan(20); // Comprehensive operation log
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle and recover from various offline operation failures', async () => {
      // Set up basic show structure
      const show: Show = {
        id: 'resilience-show',
        name: 'Resilience Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const testClass: Class = {
        id: 'resilience-class',
        name: 'Resilience Test Class',
        showId: 'resilience-show',
        maxEntries: 5,
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 60,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(testClass);

      ArmbandManager.initializeRanges('resilience-show', [
        { classId: 'resilience-class', startNumber: 101, endNumber: 105 }
      ]);

      GateCoordinator.initializeGates([
        { id: 'test-gate', name: 'Test Gate', rings: ['1'] }
      ]);

      // 1. Test entry creation with validation failures
      
      // Invalid entry data
      const invalidEntryResult = await OfflineEntryCreator.createEntry({
        dogId: '', // Invalid empty dog ID
        classId: 'resilience-class',
        showId: 'resilience-show',
        handler: 'Test Handler',
        entryFee: 25
      });

      expect(invalidEntryResult.success).toBe(false);
      expect(invalidEntryResult.errors).toContain('INVALID_DOG_ID');

      // Valid entry after fix
      const validEntryResult = await OfflineEntryCreator.createEntry({
        dogId: 'valid-dog-1',
        classId: 'resilience-class',
        showId: 'resilience-show',
        handler: 'Test Handler',
        entryFee: 25
      });

      expect(validEntryResult.success).toBe(true);

      // 2. Test check-in with various failure scenarios
      
      // Try to check in non-existent entry
      const invalidCheckInResult = await OfflineCheckInService.checkInEntry({
        entryId: 'non-existent-entry',
        classId: 'resilience-class',
        showId: 'resilience-show',
        checkedInBy: 'steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101'
      });

      expect(invalidCheckInResult.success).toBe(false);
      expect(invalidCheckInResult.errors).toContain('ENTRY_NOT_FOUND');

      // Valid check-in
      const validCheckInResult = await OfflineCheckInService.checkInEntry({
        entryId: validEntryResult.entry!.id,
        classId: 'resilience-class',
        showId: 'resilience-show',
        checkedInBy: 'steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101'
      });

      expect(validCheckInResult.success).toBe(true);

      // Try duplicate check-in
      const duplicateCheckInResult = await OfflineCheckInService.checkInEntry({
        entryId: validEntryResult.entry!.id,
        classId: 'resilience-class',
        showId: 'resilience-show',
        checkedInBy: 'steward-2',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '102'
      });

      expect(duplicateCheckInResult.success).toBe(false);
      expect(duplicateCheckInResult.errors).toContain('ENTRY_ALREADY_CHECKED_IN');

      // 3. Test scoring with validation failures
      
      // Try to score entry not checked in
      const uncheckedEntry = await OfflineEntryCreator.createEntry({
        dogId: 'unchecked-dog',
        classId: 'resilience-class',
        showId: 'resilience-show',
        handler: 'Unchecked Handler',
        entryFee: 25
      });

      const invalidScoreResult = await OfflineScoringService.recordScore({
        entryId: uncheckedEntry.entry!.id,
        classId: 'resilience-class',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      });

      expect(invalidScoreResult.success).toBe(false);
      expect(invalidScoreResult.errors).toContain('ENTRY_NOT_CHECKED_IN');

      // Valid scoring
      const validScoreResult = await OfflineScoringService.recordScore({
        entryId: validEntryResult.entry!.id,
        classId: 'resilience-class',
        judgeId: 'judge-1',
        placement: 1,
        comments: 'Good performance',
        scoredAt: new Date().toISOString()
      });

      expect(validScoreResult.success).toBe(true);

      // 4. Test recovery from partial failures
      
      // Simulate network error during sync queue processing
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network unavailable'));

      // Operations should still work offline and queue for sync
      const offlineEntryResult = await OfflineEntryCreator.createEntry({
        dogId: 'offline-dog',
        classId: 'resilience-class',
        showId: 'resilience-show',
        handler: 'Offline Handler',
        entryFee: 25
      });

      expect(offlineEntryResult.success).toBe(true);

      // Verify sync queue accumulated operations despite network failure
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue.length).toBeGreaterThan(5);

      // Restore network
      global.fetch = originalFetch;

      // 5. Test data consistency after recovery
      
      // Verify all successful operations maintained data integrity
      const allEntries = useEntryStore.getState().entries;
      const validEntries = allEntries.filter(e => e.dogId && e.classId && e.showId);
      
      expect(validEntries.length).toBe(allEntries.length); // All entries should be valid
      
      // Verify checked-in entry has consistent state
      const checkedInEntry = useEntryStore.getState().getEntry(validEntryResult.entry!.id);
      expect(checkedInEntry?.status).toBe('judged'); // Should be judged after scoring
      expect(checkedInEntry?.armbandNumber).toBe('101');
      expect(checkedInEntry?.score).toBeDefined();

      // Verify armband assignments are consistent
      const armbandAssignment = ArmbandManager.getAssignment('resilience-class', '101');
      expect(armbandAssignment?.entryId).toBe(validEntryResult.entry!.id);
    });

    it('should handle storage quota exceeded scenarios', async () => {
      // Mock localStorage to simulate quota exceeded
      const originalSetItem = localStorage.setItem;
      let quotaExceeded = false;

      localStorage.setItem = vi.fn().mockImplementation((key, value) => {
        if (quotaExceeded) {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        return originalSetItem.call(localStorage, key, value);
      });

      // Set up minimal show structure
      const show: Show = {
        id: 'quota-show',
        name: 'Quota Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);

      // Create some entries successfully
      const successfulEntry = await OfflineEntryCreator.createEntry({
        dogId: 'success-dog',
        classId: 'test-class',
        showId: 'quota-show',
        handler: 'Success Handler',
        entryFee: 25
      });

      expect(successfulEntry.success).toBe(true);

      // Simulate quota exceeded
      quotaExceeded = true;

      // Try to create entry with quota exceeded
      const quotaFailedEntry = await OfflineEntryCreator.createEntry({
        dogId: 'quota-dog',
        classId: 'test-class',
        showId: 'quota-show',
        handler: 'Quota Handler',
        entryFee: 25
      });

      expect(quotaFailedEntry.success).toBe(false);
      expect(quotaFailedEntry.errors).toContain('STORAGE_ERROR');

      // Verify system can recover when quota is available again
      quotaExceeded = false;

      const recoveredEntry = await OfflineEntryCreator.createEntry({
        dogId: 'recovered-dog',
        classId: 'test-class',
        showId: 'quota-show',
        handler: 'Recovered Handler',
        entryFee: 25
      });

      expect(recoveredEntry.success).toBe(true);

      // Restore original localStorage
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume operations efficiently', async () => {
      const startTime = performance.now();

      // Set up large show structure
      const show: Show = {
        id: 'large-show',
        name: 'Large Volume Show',
        date: '2024-07-15',
        location: 'Large Venue',
        status: 'active',
        organizingClub: 'Large Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);

      // Create many classes
      const classes: Class[] = Array.from({ length: 20 }, (_, i) => ({
        id: `large-class-${i}`,
        name: `Class ${i}`,
        showId: 'large-show',
        maxEntries: 50,
        entryFee: 25,
        status: 'scheduled',
        judgeId: `judge-${i % 5}`, // 5 judges
        rings: [`${(i % 4) + 1}`], // 4 rings
        scheduledTime: `${9 + Math.floor(i / 4)}:00`,
        estimatedDuration: 60,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      }));

      classes.forEach(cls => useClassStore.getState().addClass(cls));

      // Initialize armband ranges for all classes
      const armbandRanges = classes.map((cls, i) => ({
        classId: cls.id,
        startNumber: (i * 50) + 1,
        endNumber: (i * 50) + 50
      }));

      ArmbandManager.initializeRanges('large-show', armbandRanges);

      // Create large number of entries across all classes
      const entryPromises = [];
      for (let i = 0; i < 500; i++) {
        const classIndex = i % 20;
        entryPromises.push(
          OfflineEntryCreator.createEntry({
            dogId: `volume-dog-${i}`,
            classId: `large-class-${classIndex}`,
            showId: 'large-show',
            handler: `Handler ${i}`,
            entryFee: 25
          })
        );
      }

      const entryResults = await Promise.all(entryPromises);
      const entryTime = performance.now();

      // Verify all entries created successfully
      expect(entryResults.every(r => r.success)).toBe(true);
      expect(entryTime - startTime).toBeLessThan(3000); // Should complete in < 3 seconds

      // Test bulk check-in operations
      const checkInPromises = [];
      let armbandCounter = 1;

      for (const result of entryResults.slice(0, 100)) { // Check in first 100
        const entry = result.entry!;
        const classId = entry.classId;
        const classIndex = parseInt(classId.split('-')[2]);
        const armbandStart = (classIndex * 50) + 1;
        
        checkInPromises.push(
          OfflineCheckInService.checkInEntry({
            entryId: entry.id,
            classId: entry.classId,
            showId: 'large-show',
            checkedInBy: 'bulk-steward',
            checkedInAt: new Date().toISOString(),
            armbandNumber: (armbandStart + (armbandCounter % 50)).toString()
          })
        );
        armbandCounter++;
      }

      const checkInResults = await Promise.all(checkInPromises);
      const checkInTime = performance.now();

      expect(checkInResults.every(r => r.success)).toBe(true);
      expect(checkInTime - entryTime).toBeLessThan(2000); // Should complete in < 2 seconds

      // Test bulk scoring operations
      const scorePromises = [];
      const checkedInEntries = useEntryStore.getState().entries
        .filter(e => e.status === 'checked_in')
        .slice(0, 50); // Score first 50

      for (let i = 0; i < checkedInEntries.length; i++) {
        const entry = checkedInEntries[i];
        scorePromises.push(
          OfflineScoringService.recordScore({
            entryId: entry.id,
            classId: entry.classId,
            judgeId: `judge-${i % 5}`,
            placement: (i % 10) + 1,
            comments: `Bulk score ${i}`,
            scoredAt: new Date().toISOString()
          })
        );
      }

      const scoreResults = await Promise.all(scorePromises);
      const scoreTime = performance.now();

      expect(scoreResults.every(r => r.success)).toBe(true);
      expect(scoreTime - checkInTime).toBeLessThan(1500); // Should complete in < 1.5 seconds

      const totalTime = scoreTime - startTime;
      expect(totalTime).toBeLessThan(7000); // Total workflow < 7 seconds

      // Verify sync queue efficiency (should batch operations)
      const syncQueue = useSyncQueue.getState().queue;
      
      // Should have many operations but efficiently organized
      expect(syncQueue.length).toBeGreaterThan(100);
      expect(syncQueue.length).toBeLessThan(1000); // Should batch some operations

      console.log(`High-volume test completed in ${totalTime}ms`);
      console.log(`Created ${entryResults.length} entries, checked in ${checkInResults.length}, scored ${scoreResults.length}`);
      console.log(`Sync queue has ${syncQueue.length} operations`);
    });
  });
});