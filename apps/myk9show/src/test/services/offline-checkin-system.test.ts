/**
 * Comprehensive tests for Phase 3 Offline Check-in System
 * Tests offline check-in, armband management, and gate coordination
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Service imports
import { OfflineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { ArmbandManager } from '@/services/offline-checkin/ArmbandManager';
import { CheckInValidator } from '@/services/offline-checkin/CheckInValidator';
import { GateCoordinator } from '@/services/offline-checkin/GateCoordinator';

// Store imports
import { useEntryStore } from '@/store/entryStore';
import { useClassStore } from '@/store/classStore';
import { useShowStore } from '@/store/showStore';
import { useSyncQueue } from '@/store/syncQueue';

// Type imports
import type { Entry, EntryStatus } from '@/types/entry-types';
import type { Class } from '@/types/class-types';
import type { Show } from '@/types/show-types';
import type { CheckInData } from '@/types/check-in-types';

// TODO: fix - useSyncQueue store was a stub (not implemented); tests need real store behavior
describe.skip('Phase 3 Offline Check-in System', () => {
  beforeEach(() => {
    localStorage.clear();

    // Reset stores
    useEntryStore.getState().clearEntries();
    useClassStore.getState().clearClasses();
    useShowStore.getState().clearShows();
    useSyncQueue.getState().clearQueue();
  });

  describe('OfflineCheckInService - Core Functionality', () => {
    const mockShow: Show = {
      id: 'show-1',
      name: 'Test Dog Show',
      date: '2024-07-15',
      location: 'Test Venue',
      status: 'active',
      organizingClub: 'Test Club',
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z',
    };

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
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z',
    };

    const mockEntries: Entry[] = [
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

    beforeEach(() => {
      useShowStore.getState().addShow(mockShow);
      useClassStore.getState().addClass(mockClass);
      mockEntries.forEach(entry => useEntryStore.getState().addEntry(entry));
    });

    it('should check in entry offline with armband assignment', async () => {
      const checkInData: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
        notes: 'On time arrival',
      };

      const result = await OfflineCheckInService.checkInEntry(checkInData);

      expect(result.success).toBe(true);
      expect(result.checkIn).toBeDefined();
      expect(result.checkIn?.armbandNumber).toBe('101');

      // Verify entry status updated
      const updatedEntry = useEntryStore.getState().getEntry('entry-1');
      expect(updatedEntry?.status).toBe('checked_in');
      expect(updatedEntry?.armbandNumber).toBe('101');

      // Verify sync queue entry
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('CHECK_IN_ENTRY');
    });

    it('should handle late check-in', async () => {
      const lateCheckInData: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
        isLate: true,
        notes: 'Arrived 15 minutes late',
      };

      const result = await OfflineCheckInService.checkInEntry(lateCheckInData);

      expect(result.success).toBe(true);
      expect(result.checkIn?.isLate).toBe(true);
      expect(result.warnings).toContain('LATE_CHECK_IN');
    });

    it('should handle check-in conflicts (armband already assigned)', async () => {
      // Check in first entry
      await OfflineCheckInService.checkInEntry({
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      // Try to check in second entry with same armband
      const conflictCheckIn: CheckInData = {
        entryId: 'entry-2',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101', // Conflict!
      };

      const result = await OfflineCheckInService.checkInEntry(conflictCheckIn);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ARMBAND_ALREADY_ASSIGNED');
    });

    it('should handle entry already checked in', async () => {
      // Check in entry first time
      await OfflineCheckInService.checkInEntry({
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      // Try to check in same entry again
      const duplicateCheckIn: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-2',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '102',
      };

      const result = await OfflineCheckInService.checkInEntry(duplicateCheckIn);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ENTRY_ALREADY_CHECKED_IN');
    });

    it('should handle check-out/undo check-in', async () => {
      // Check in entry
      const checkInResult = await OfflineCheckInService.checkInEntry({
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      expect(checkInResult.success).toBe(true);

      // Check out entry
      const checkOutResult = await OfflineCheckInService.checkOutEntry(
        'entry-1',
        'gate-steward-1',
        'Handler needed to leave'
      );

      expect(checkOutResult.success).toBe(true);

      // Verify entry status reverted
      const updatedEntry = useEntryStore.getState().getEntry('entry-1');
      expect(updatedEntry?.status).toBe('confirmed');
      expect(updatedEntry?.armbandNumber).toBeUndefined();

      // Verify sync queue has checkout operation
      const syncQueue = useSyncQueue.getState().queue;
      const checkOutOperation = syncQueue.find(op => op.operation === 'CHECK_OUT_ENTRY');
      expect(checkOutOperation).toBeDefined();
    });

    it('should validate payment status before check-in', async () => {
      // Create entry with unpaid status
      const unpaidEntry: Entry = {
        id: 'entry-unpaid',
        dogId: 'dog-unpaid',
        classId: 'class-1',
        showId: 'show-1',
        status: 'confirmed',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler Unpaid',
          entryFee: 25,
          paymentStatus: 'pending',
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z',
      };

      useEntryStore.getState().addEntry(unpaidEntry);

      const checkInData: CheckInData = {
        entryId: 'entry-unpaid',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '102',
      };

      const result = await OfflineCheckInService.checkInEntry(checkInData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('PAYMENT_NOT_CONFIRMED');
    });
  });

  describe('ArmbandManager - Armband Assignment Logic', () => {
    beforeEach(() => {
      // Initialize armband ranges
      ArmbandManager.initializeRanges('show-1', [
        { classId: 'class-1', startNumber: 101, endNumber: 120 },
        { classId: 'class-2', startNumber: 201, endNumber: 220 },
      ]);
    });

    it('should assign next available armband', () => {
      const assignment1 = ArmbandManager.assignNextArmband('class-1', 'entry-1');
      expect(assignment1.success).toBe(true);
      expect(assignment1.armbandNumber).toBe('101');

      const assignment2 = ArmbandManager.assignNextArmband('class-1', 'entry-2');
      expect(assignment2.success).toBe(true);
      expect(assignment2.armbandNumber).toBe('102');
    });

    it('should assign specific armband number', () => {
      const assignment = ArmbandManager.assignSpecificArmband('class-1', 'entry-1', '105');
      expect(assignment.success).toBe(true);
      expect(assignment.armbandNumber).toBe('105');

      // Verify armband is marked as used
      const nextAssignment = ArmbandManager.assignNextArmband('class-1', 'entry-2');
      expect(nextAssignment.armbandNumber).toBe('101'); // Skips 105
    });

    it('should handle armband conflicts', () => {
      // Assign armband
      ArmbandManager.assignSpecificArmband('class-1', 'entry-1', '101');

      // Try to assign same armband
      const conflictAssignment = ArmbandManager.assignSpecificArmband('class-1', 'entry-2', '101');
      expect(conflictAssignment.success).toBe(false);
      expect(conflictAssignment.errors).toContain('ARMBAND_ALREADY_ASSIGNED');
    });

    it('should release armband when entry is checked out', () => {
      // Assign armband
      const assignment = ArmbandManager.assignSpecificArmband('class-1', 'entry-1', '101');
      expect(assignment.success).toBe(true);

      // Release armband
      const release = ArmbandManager.releaseArmband('class-1', '101');
      expect(release.success).toBe(true);

      // Should be able to assign same armband again
      const reassignment = ArmbandManager.assignSpecificArmband('class-1', 'entry-2', '101');
      expect(reassignment.success).toBe(true);
    });

    it('should handle out-of-range armband numbers', () => {
      const outOfRange = ArmbandManager.assignSpecificArmband('class-1', 'entry-1', '301');
      expect(outOfRange.success).toBe(false);
      expect(outOfRange.errors).toContain('ARMBAND_OUT_OF_RANGE');
    });

    it('should handle exhausted armband ranges', () => {
      // Use up all armbands in range (101-120 = 20 armbands)
      for (let i = 0; i < 20; i++) {
        ArmbandManager.assignNextArmband('class-1', `entry-${i}`);
      }

      // Try to assign one more
      const exhaustedResult = ArmbandManager.assignNextArmband('class-1', 'entry-21');
      expect(exhaustedResult.success).toBe(false);
      expect(exhaustedResult.errors).toContain('NO_ARMBANDS_AVAILABLE');
    });

    it('should get armband availability status', () => {
      // Assign some armbands
      ArmbandManager.assignNextArmband('class-1', 'entry-1');
      ArmbandManager.assignNextArmband('class-1', 'entry-2');
      ArmbandManager.assignNextArmband('class-1', 'entry-3');

      const availability = ArmbandManager.getAvailability('class-1');
      expect(availability.totalArmbands).toBe(20);
      expect(availability.assignedArmbands).toBe(3);
      expect(availability.availableArmbands).toBe(17);
      expect(availability.nextAvailable).toBe('104');
    });
  });

  describe('CheckInValidator - Validation Logic', () => {
    it('should validate check-in eligibility', () => {
      const validEntry: Entry = {
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

      const result = CheckInValidator.validateCheckInEligibility(validEntry);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject check-in for withdrawn entries', () => {
      const withdrawnEntry: Entry = {
        id: 'entry-1',
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        status: 'withdrawn',
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

      const result = CheckInValidator.validateCheckInEligibility(withdrawnEntry);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'ENTRY_WITHDRAWN')).toBe(true);
    });

    it('should reject check-in for unpaid entries', () => {
      const unpaidEntry: Entry = {
        id: 'entry-1',
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        status: 'confirmed',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler 1',
          entryFee: 25,
          paymentStatus: 'pending',
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z',
      };

      const result = CheckInValidator.validateCheckInEligibility(unpaidEntry);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PAYMENT_PENDING')).toBe(true);
    });

    it('should validate armband format', () => {
      const validFormats = ['101', '1A', 'A1', '999'];
      const invalidFormats = ['', 'ABCD', '10000', 'special!'];

      validFormats.forEach(format => {
        const result = CheckInValidator.validateArmbandFormat(format);
        expect(result.isValid).toBe(true);
      });

      invalidFormats.forEach(format => {
        const result = CheckInValidator.validateArmbandFormat(format);
        expect(result.isValid).toBe(false);
      });
    });

    it('should validate check-in timing', () => {
      const classTime = '09:00';
      const earlyCheckIn = '08:30'; // 30 minutes early - should be valid
      const veryEarlyCheckIn = '07:00'; // 2 hours early - should warn
      const lateCheckIn = '09:15'; // 15 minutes late - should warn

      const earlyResult = CheckInValidator.validateCheckInTiming(earlyCheckIn, classTime);
      expect(earlyResult.isValid).toBe(true);
      expect(earlyResult.warnings).toHaveLength(0);

      const veryEarlyResult = CheckInValidator.validateCheckInTiming(veryEarlyCheckIn, classTime);
      expect(veryEarlyResult.isValid).toBe(true);
      expect(veryEarlyResult.warnings).toContain('VERY_EARLY_CHECK_IN');

      const lateResult = CheckInValidator.validateCheckInTiming(lateCheckIn, classTime);
      expect(lateResult.isValid).toBe(true);
      expect(lateResult.warnings).toContain('LATE_CHECK_IN');
    });
  });

  describe('GateCoordinator - Multi-Gate Management', () => {
    beforeEach(() => {
      // Initialize multiple gates
      GateCoordinator.initializeGates([
        { id: 'gate-1', name: 'Main Gate', rings: ['1', '2'] },
        { id: 'gate-2', name: 'Ring 3 Gate', rings: ['3'] },
        { id: 'gate-3', name: 'Agility Gate', rings: ['A1', 'A2'] },
      ]);
    });

    it('should coordinate check-ins across multiple gates', async () => {
      const gate1CheckIn = await GateCoordinator.processCheckIn('gate-1', {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      const gate2CheckIn = await GateCoordinator.processCheckIn('gate-2', {
        entryId: 'entry-2',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-2',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '102',
      });

      expect(gate1CheckIn.success).toBe(true);
      expect(gate2CheckIn.success).toBe(true);

      // Verify gate assignment tracking
      const gate1Activity = GateCoordinator.getGateActivity('gate-1');
      const gate2Activity = GateCoordinator.getGateActivity('gate-2');

      expect(gate1Activity.checkInsToday).toBe(1);
      expect(gate2Activity.checkInsToday).toBe(1);
    });

    it('should handle gate conflicts and synchronization', async () => {
      // Simulate simultaneous check-in attempts for same armband from different gates
      const promises = [
        GateCoordinator.processCheckIn('gate-1', {
          entryId: 'entry-1',
          classId: 'class-1',
          showId: 'show-1',
          checkedInBy: 'gate-steward-1',
          checkedInAt: new Date().toISOString(),
          armbandNumber: '101',
        }),
        GateCoordinator.processCheckIn('gate-2', {
          entryId: 'entry-2',
          classId: 'class-1',
          showId: 'show-1',
          checkedInBy: 'gate-steward-2',
          checkedInAt: new Date().toISOString(),
          armbandNumber: '101', // Same armband!
        }),
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should fail due to conflict
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
    });

    it('should track gate performance metrics', () => {
      // Process several check-ins
      const checkInPromises = Array.from({ length: 10 }, (_, i) =>
        GateCoordinator.processCheckIn('gate-1', {
          entryId: `entry-${i}`,
          classId: 'class-1',
          showId: 'show-1',
          checkedInBy: 'gate-steward-1',
          checkedInAt: new Date().toISOString(),
          armbandNumber: `${101 + i}`,
        })
      );

      Promise.all(checkInPromises);

      const metrics = GateCoordinator.getGateMetrics('gate-1');
      expect(metrics.totalCheckIns).toBe(10);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
      expect(metrics.successRate).toBe(100);
    });

    it('should handle gate offline/online status', () => {
      // Take gate offline
      GateCoordinator.setGateStatus('gate-1', 'offline');

      // Try to process check-in at offline gate
      const offlineResult = GateCoordinator.processCheckIn('gate-1', {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      expect(offlineResult).rejects.toThrow('GATE_OFFLINE');

      // Bring gate back online
      GateCoordinator.setGateStatus('gate-1', 'online');

      const onlineResult = GateCoordinator.processCheckIn('gate-1', {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      expect(onlineResult).resolves.toMatchObject({ success: true });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing entry data', async () => {
      const invalidCheckIn: CheckInData = {
        entryId: 'non-existent-entry',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      };

      const result = await OfflineCheckInService.checkInEntry(invalidCheckIn);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ENTRY_NOT_FOUND');
    });

    it('should handle storage errors during check-in', async () => {
      // Mock storage failure
      vi.spyOn(useEntryStore.getState(), 'updateEntry').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const checkInData: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      };

      const result = await OfflineCheckInService.checkInEntry(checkInData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('STORAGE_ERROR');
    });

    it('should handle invalid class status for check-in', async () => {
      // Update class to completed status
      const completedClass = {
        id: 'class-1',
        name: 'Open Dogs',
        showId: 'show-1',
        status: 'completed',
      };
      useClassStore.getState().updateClass(completedClass);

      const checkInData: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      };

      const result = await OfflineCheckInService.checkInEntry(checkInData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CLASS_NOT_ACCEPTING_CHECKINS');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-volume check-ins efficiently', async () => {
      // Create many entries
      const manyEntries = Array.from({ length: 200 }, (_, i) => ({
        id: `entry-${i}`,
        dogId: `dog-${i}`,
        classId: 'class-1',
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

      manyEntries.forEach(entry => useEntryStore.getState().addEntry(entry));

      const startTime = performance.now();

      // Process many check-ins
      const promises = manyEntries.map((entry, i) =>
        OfflineCheckInService.checkInEntry({
          entryId: entry.id,
          classId: 'class-1',
          showId: 'show-1',
          checkedInBy: 'gate-steward-1',
          checkedInAt: new Date().toISOString(),
          armbandNumber: `${101 + i}`,
        })
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(200);

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds max
    });

    it('should efficiently manage large armband ranges', () => {
      // Initialize large armband range
      ArmbandManager.initializeRanges('show-1', [
        { classId: 'class-1', startNumber: 1, endNumber: 10000 },
      ]);

      const startTime = performance.now();

      // Assign many armbands
      for (let i = 0; i < 1000; i++) {
        ArmbandManager.assignNextArmband('class-1', `entry-${i}`);
      }

      const endTime = performance.now();

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(500); // 0.5 seconds max

      // Verify availability calculation is fast
      const availabilityStart = performance.now();
      const availability = ArmbandManager.getAvailability('class-1');
      const availabilityEnd = performance.now();

      expect(availability.assignedArmbands).toBe(1000);
      expect(availabilityEnd - availabilityStart).toBeLessThan(10); // Very fast
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain check-in data consistency', async () => {
      const checkInData: CheckInData = {
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: '2024-07-15T09:00:00Z',
        armbandNumber: '101',
        notes: 'Regular check-in',
      };

      // Check in entry
      const result = await OfflineCheckInService.checkInEntry(checkInData);
      expect(result.success).toBe(true);

      // Verify all data is consistent
      const entry = useEntryStore.getState().getEntry('entry-1');
      expect(entry?.status).toBe('checked_in');
      expect(entry?.armbandNumber).toBe('101');
      expect(entry?.checkInData?.checkedInBy).toBe('gate-steward-1');
      expect(entry?.checkInData?.notes).toBe('Regular check-in');

      // Verify armband assignment
      const assignment = ArmbandManager.getAssignment('class-1', '101');
      expect(assignment?.entryId).toBe('entry-1');
    });

    it('should maintain referential integrity between entries and armbands', async () => {
      // Check in entry
      await OfflineCheckInService.checkInEntry({
        entryId: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        checkedInBy: 'gate-steward-1',
        checkedInAt: new Date().toISOString(),
        armbandNumber: '101',
      });

      // Check out entry
      await OfflineCheckInService.checkOutEntry('entry-1', 'gate-steward-1', 'Test checkout');

      // Verify armband is released and entry is updated consistently
      const entry = useEntryStore.getState().getEntry('entry-1');
      expect(entry?.status).toBe('confirmed');
      expect(entry?.armbandNumber).toBeUndefined();

      const assignment = ArmbandManager.getAssignment('class-1', '101');
      expect(assignment).toBeUndefined();
    });
  });
});
