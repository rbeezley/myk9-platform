/**
 * EntryLimitChecker Unit Tests
 *
 * Comprehensive testing of capacity management and waitlist functionality:
 * - Class capacity enforcement
 * - Waitlist position calculation
 * - Entry limit validation
 * - Show and trial level limits
 * - Handler limits and restrictions
 * - Edge cases and concurrent scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntryLimitChecker, type LimitCheckContext } from '@/services/entries/EntryLimitChecker';
import { EntryStatus } from '@/types/show-registration-types';
import type { ShowEntry, ShowEntryInput } from '@/store/entryStore';
import type { Show, Trial, Class } from '@/types/show-types';
import type { Dog } from '@/types/dog-types';

describe('EntryLimitChecker', () => {
  let mockShow: Show;
  let mockTrial: Trial;
  let mockClass: Class;
  let mockDog: Dog;
  let mockEntries: ShowEntry[];
  let testContext: LimitCheckContext;

  beforeEach(() => {
    // Reset test data before each test
    mockShow = {
      id: 'test-show-001',
      name: 'Test Show',
      maxTotalEntries: 100,
      maxEntriesPerDog: 5,
      trials: [],
    } as Show;

    mockTrial = {
      id: 'test-trial-001',
      name: 'Test Trial',
      maxTotalEntries: 50,
      maxEntriesPerDog: 3,
      maxEntriesPerHandler: 10,
      classes: [],
    } as Trial;

    mockClass = {
      id: 'test-class-001',
      name: 'Test Class',
      maxEntries: 5,
      allowWaitlist: true,
      maxDogsPerHandler: 2,
    } as Class;

    mockDog = {
      id: 'test-dog-001',
      name: 'Test Dog',
      breed: 'Test Breed',
    } as Dog;

    mockEntries = [];

    testContext = {
      show: mockShow,
      trial: mockTrial,
      class: mockClass,
      dog: mockDog,
      existingEntries: mockEntries,
    };
  });

  describe('Class Capacity Enforcement', () => {
    it('should allow entry when class has available capacity', () => {
      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      // Class is empty, should allow entry
      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(true);
      expect(result.isWaitlisted).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.currentCount).toBe(0);
      expect(result.maxAllowed).toBe(5);
    });

    it('should reject entry when class is full and waitlist not allowed', () => {
      // Fill class to capacity
      mockEntries = Array.from({ length: 5 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      mockClass.allowWaitlist = false;
      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.isWaitlisted).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CLASS_FULL');
      expect(result.errors[0].message).toContain('Class is full (5/5 entries)');
    });

    it('should allow waitlist when class is full but waitlist enabled', () => {
      // Fill class to capacity
      mockEntries = Array.from({ length: 5 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'waitlist-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Waitlist Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      // Source returns isAllowed=true (no errors) with a CLASS_FULL_WAITLIST warning
      expect(result.isAllowed).toBe(true);
      expect(result.isWaitlisted).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('CLASS_FULL_WAITLIST');
      expect(result.waitlistPosition).toBe(1);
    });

    it('should calculate correct waitlist position', () => {
      // Fill class to capacity with some waitlisted entries
      mockEntries = [
        ...(Array.from({ length: 5 }, (_, i) => ({
          id: `confirmed-${i}`,
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: `confirmed-dog-${i}`,
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: `Handler ${i}`,
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as ShowEntry[]),
        ...(Array.from({ length: 3 }, (_, i) => ({
          id: `waitlist-${i}`,
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: `waitlist-dog-${i}`,
          status: EntryStatus.WAITLIST,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: `Waitlist Handler ${i}`,
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as ShowEntry[]),
      ];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-waitlist-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Waitlist Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.waitlistPosition).toBe(4); // Should be 4th in waitlist
    });
  });

  describe('Duplicate Entry Prevention', () => {
    it('should prevent duplicate entries for same dog in same class', () => {
      mockEntries = [
        {
          id: 'existing-entry',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: mockDog.id,
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Existing Handler',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id, // Same dog
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Different Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('DUPLICATE_ENTRY');
      expect(result.errors[0].message).toContain('already entered');
    });

    it('should allow entry for same dog in different class', () => {
      mockEntries = [
        {
          id: 'existing-entry',
          showId: mockShow.id,
          classId: 'different-class-001',
          dogId: mockDog.id,
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Existing Handler',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id, // Different class
        dogId: mockDog.id,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow entry when previous entry was withdrawn', () => {
      mockEntries = [
        {
          id: 'withdrawn-entry',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: mockDog.id,
          status: 'withdrawn', // Entry was withdrawn
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Previous Handler',
            entryFee: 25.0,
            paymentStatus: 'refunded',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id, // Same dog, but previous entry withdrawn
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Per-Dog Entry Limits', () => {
    it('should enforce trial-level per-dog limits', () => {
      mockTrial.maxEntriesPerDog = 2;
      // Populate trial.classes so isEntryInTrial can match
      mockTrial.classes = [
        { id: 'class-0', name: 'Class 0' } as Class,
        { id: 'class-1', name: 'Class 1' } as Class,
        { id: mockClass.id, name: mockClass.name } as Class,
      ];

      // Dog already has 2 entries in this trial's classes
      mockEntries = Array.from({ length: 2 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: `class-${i}`,
        dogId: mockDog.id,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'DOG_TRIAL_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should enforce show-level per-dog limits', () => {
      mockShow.maxEntriesPerDog = 3;

      // Dog already has 3 entries in this show
      mockEntries = Array.from({ length: 3 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: `class-${i}`,
        dogId: mockDog.id,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'DOG_SHOW_LIMIT_EXCEEDED')).toBe(true);
    });
  });

  describe('Show and Trial Level Limits', () => {
    it('should enforce trial total entry limits', () => {
      mockTrial.maxTotalEntries = 3;
      // Populate trial.classes so isEntryInTrial can match
      mockTrial.classes = [{ id: mockClass.id, name: mockClass.name } as Class];

      // Trial already has 3 entries
      mockEntries = Array.from({ length: 3 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'TRIAL_FULL')).toBe(true);
    });

    it('should enforce show total entry limits', () => {
      mockShow.maxTotalEntries = 5;

      // Show already has 5 entries
      mockEntries = Array.from({ length: 5 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: `class-${i % 2}`, // Split between 2 classes
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'SHOW_FULL')).toBe(true);
    });
  });

  describe('Handler Limits', () => {
    it('should enforce per-handler per-class limits', () => {
      mockClass.maxDogsPerHandler = 1;

      // Handler already has 1 dog in this class
      mockEntries = [
        {
          id: 'existing-entry',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'existing-dog',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            handlerId: 'handler-001',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          handlerId: 'handler-001', // Same handler
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'HANDLER_CLASS_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should warn about trial-level handler limits when approaching max', () => {
      mockTrial.maxEntriesPerHandler = 2;
      // Populate trial.classes so isEntryInTrial can match
      mockTrial.classes = [
        { id: 'other-class', name: 'Other Class' } as Class,
        { id: mockClass.id, name: mockClass.name } as Class,
      ];

      // Handler already has 2 entries in trial classes (at limit)
      mockEntries = [
        {
          id: 'existing-entry-1',
          showId: mockShow.id,
          classId: 'other-class',
          dogId: 'existing-dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            handlerId: 'handler-001',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'existing-entry-2',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'existing-dog-2',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Test Handler',
            handlerId: 'handler-001',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Test Handler',
          handlerId: 'handler-001',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.warnings.some(w => w.code === 'HANDLER_TRIAL_LIMIT_APPROACHING')).toBe(true);
    });
  });

  describe('Waitlist Promotion', () => {
    it('should check waitlist promotion availability', () => {
      mockClass.maxEntries = 3;

      const entries: ShowEntry[] = [
        {
          id: 'confirmed-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'confirmed-2',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-2',
          status: 'paid',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      const result = EntryLimitChecker.checkWaitlistPromotion(mockClass.id, entries, mockClass);

      expect(result.canPromote).toBe(true);
      expect(result.spotsAvailable).toBe(1); // 3 capacity - 2 confirmed = 1 spot
    });

    it('should return no promotion when class is full', () => {
      mockClass.maxEntries = 2;

      const entries: ShowEntry[] = [
        {
          id: 'confirmed-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'confirmed-2',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-2',
          status: 'paid',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      const result = EntryLimitChecker.checkWaitlistPromotion(mockClass.id, entries, mockClass);

      expect(result.canPromote).toBe(false);
      expect(result.spotsAvailable).toBe(0);
    });
  });

  describe('Entry Statistics', () => {
    it('should calculate correct class entry statistics', () => {
      const entries: ShowEntry[] = [
        {
          id: 'confirmed-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'paid-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-2',
          status: 'paid',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 2',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'waitlist-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-3',
          status: EntryStatus.WAITLIST,
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 3',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      const stats = EntryLimitChecker.getClassEntryStats(mockClass.id, entries, mockClass);

      expect(stats.confirmed).toBe(2); // confirmed + paid
      expect(stats.waitlisted).toBe(1);
      expect(stats.total).toBe(3);
      expect(stats.capacity).toBe(5);
      expect(stats.availableSpots).toBe(3); // 5 - 2 confirmed
      expect(stats.isFull).toBe(false);
    });

    it('should handle unlimited capacity classes', () => {
      const unlimitedClass = { ...mockClass, maxEntries: undefined } as Class;

      const entries: ShowEntry[] = [
        {
          id: 'entry-1',
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'dog-1',
          status: 'confirmed',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Handler 1',
            entryFee: 25.0,
            paymentStatus: 'paid',
          },
          statusHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as ShowEntry[];

      const stats = EntryLimitChecker.getClassEntryStats(mockClass.id, entries, unlimitedClass);

      expect(stats.capacity).toBeNull();
      expect(stats.availableSpots).toBeNull();
      expect(stats.isFull).toBe(false);
    });
  });

  describe('Warnings and Notifications', () => {
    it('should warn when class is nearly full', () => {
      mockClass.maxEntries = 10;

      // Fill class to 90% capacity (9 entries)
      mockEntries = Array.from({ length: 9 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(true);
      expect(result.warnings.some(w => w.code === 'CLASS_NEARLY_FULL')).toBe(true);
    });

    it('should warn when trial is nearly full', () => {
      mockTrial.maxTotalEntries = 10;
      // Populate trial.classes so isEntryInTrial can match
      mockTrial.classes = [{ id: mockClass.id, name: mockClass.name } as Class];

      // Fill trial to 90% capacity (9 entries)
      mockEntries = Array.from({ length: 9 }, (_, i) => ({
        id: `entry-${i}`,
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: `dog-${i}`,
        status: 'confirmed',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: `Handler ${i}`,
          entryFee: 25.0,
          paymentStatus: 'paid',
        },
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ShowEntry[];

      testContext.existingEntries = mockEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.warnings.some(w => w.code === 'TRIAL_NEARLY_FULL')).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing class capacity gracefully', () => {
      const unlimitedClass = { ...mockClass, maxEntries: undefined } as Class;
      testContext.class = unlimitedClass;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(true);
      expect(result.maxAllowed).toBeUndefined();
    });

    it('should handle pending entries in batch operations', () => {
      const pendingEntries: ShowEntryInput[] = [
        {
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: 'pending-dog',
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Pending Handler',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
      ];

      testContext.pendingEntries = pendingEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: 'new-dog',
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'New Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.currentCount).toBe(1); // Should include pending entry in count
    });

    it('should prevent duplicate pending entries in batch', () => {
      const pendingEntries: ShowEntryInput[] = [
        {
          showId: mockShow.id,
          classId: mockClass.id,
          dogId: mockDog.id, // Same dog
          registrationData: {
            submittedAt: new Date().toISOString(),
            handler: 'Pending Handler',
            entryFee: 25.0,
            paymentStatus: 'pending',
          },
        },
      ];

      testContext.pendingEntries = pendingEntries;

      const entryData: ShowEntryInput = {
        showId: mockShow.id,
        classId: mockClass.id,
        dogId: mockDog.id, // Same dog as pending
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: 'Another Handler',
          entryFee: 25.0,
          paymentStatus: 'pending',
        },
      };

      const result = EntryLimitChecker.checkEntryLimits(entryData, testContext);

      expect(result.isAllowed).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_PENDING_ENTRY')).toBe(true);
    });
  });
});
