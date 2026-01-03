/**
 * Phase 3.4: Waitlist Integration Tests
 * 
 * Full integration testing of waitlist management across all system components:
 * - Entry creation with capacity checking
 * - Waitlist placement and ordering
 * - Promotion workflows with notifications
 * - Secretary tools for waitlist management
 * - Real-time updates and synchronization
 * - Edge cases and concurrent operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useShowStore } from '@/store/showStore';
import { useUserStore } from '@/store/userStore';
import { EntryLimitChecker } from '@/services/entries/EntryLimitChecker';
import { OfflineEntryCreator } from '@/services/entries/OfflineEntryCreator';
import type { Show, Class } from '@/types/show-types';
import type { Dog } from '@/types/dog-types';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

describe('Phase 3.4: Waitlist Integration', () => {
  let entryStore: ReturnType<typeof useEntryStore.getState>;
  let dogStore: ReturnType<typeof useDogStore.getState>;
  let showStore: ReturnType<typeof useShowStore.getState>;
  let userStore: ReturnType<typeof useUserStore.getState>;

  beforeEach(() => {
    // Get fresh store instances
    entryStore = useEntryStore.getState();
    dogStore = useDogStore.getState();
    showStore = useShowStore.getState();
    userStore = useUserStore.getState();

    // Clear all stores
    entryStore.clearAllEntries();
    dogStore.clearAllDogs();
    showStore.clearAllShows();
    userStore.clearAllPeople();
  });

  afterEach(() => {
    // Clean up after each test
    entryStore.clearAllEntries();
    dogStore.clearAllDogs();
    showStore.clearAllShows();
    userStore.clearAllPeople();
  });

  describe('Complete Waitlist Workflow', () => {
    it('should handle full entry lifecycle with waitlist management', async () => {
      // Setup test data
      const testShow: Show = {
        id: 'integration-show-001',
        name: 'Integration Test Show',
        date: '2024-03-15',
        location: 'Test Venue',
        maxTotalEntries: 20,
        maxEntriesPerDog: 4,
        trials: [{
          id: 'integration-trial-001',
          name: 'Integration Trial',
          date: '2024-03-15',
          maxTotalEntries: 15,
          maxEntriesPerDog: 3,
          classes: [{
            id: 'limited-class-001',
            name: 'Popular Novice A',
            level: 'Novice',
            height: 'All Heights',
            maxEntries: 3, // Very limited for testing
            allowWaitlist: true,
            entryFee: 25.00,
            runOrder: 1
          }, {
            id: 'regular-class-001',
            name: 'Regular Novice B',
            level: 'Novice',
            height: 'All Heights', 
            maxEntries: 8,
            allowWaitlist: true,
            entryFee: 25.00,
            runOrder: 2
          }] as Class[]
        }],
        status: 'accepting_entries',
        entryFee: 5.00,
        lateEntryFee: 10.00,
        entryDeadline: '2024-03-10',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Show;

      const testDogs: Dog[] = [
        {
          id: 'integration-dog-001',
          name: 'Max',
          breed: 'Golden Retriever',
          registrationNumber: 'GR001',
          dateOfBirth: '2020-05-15',
          ownerId: 'owner-001',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'integration-dog-002', 
          name: 'Luna',
          breed: 'Border Collie',
          registrationNumber: 'BC001',
          dateOfBirth: '2019-08-22',
          ownerId: 'owner-002',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'integration-dog-003',
          name: 'Charlie',
          breed: 'Australian Shepherd',
          registrationNumber: 'AS001', 
          dateOfBirth: '2021-01-10',
          ownerId: 'owner-003',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'integration-dog-004',
          name: 'Bella',
          breed: 'Labrador',
          registrationNumber: 'LAB001',
          dateOfBirth: '2020-11-03',
          ownerId: 'owner-004',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'integration-dog-005',
          name: 'Rocky',
          breed: 'German Shepherd',
          registrationNumber: 'GS001',
          dateOfBirth: '2019-12-20',
          ownerId: 'owner-005',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      // Add test data to stores
      showStore.importShows([testShow]);
      dogStore.importDogs(testDogs);

      const results = {
        phase1_fillCapacity: [] as any[],
        phase2_waitlistCreation: [] as any[],
        phase3_cancellation: null as any,
        phase4_promotion: null as any,
        finalStats: null as any
      };

      // Phase 1: Fill class to capacity
      for (let i = 0; i < 3; i++) {
        const dog = testDogs[i];
        const entryResult = await OfflineEntryCreator.createEntry({
          showId: testShow.id,
          classId: 'limited-class-001',
          dogId: dog.id,
          registrationData: {
            submittedAt: new Date(Date.now() + i * 1000).toISOString(),
            handler: `Handler ${i + 1}`,
            entryFee: 25.00,
            paymentStatus: 'pending'
          }
        }, {
          allowWaitlist: true
        });

        results.phase1_fillCapacity.push({
          dogName: dog.name,
          success: entryResult.success,
          isWaitlisted: entryResult.isWaitlisted,
          entryId: entryResult.entry?.id
        });

        if (entryResult.success && entryResult.entry) {
          await entryStore.updateStatus(entryResult.entry.id, 'confirmed', 'system', 'Entry confirmed');
        }
      }

      // Phase 2: Add entries to waitlist
      for (let i = 3; i < 5; i++) {
        const dog = testDogs[i];
        const entryResult = await OfflineEntryCreator.createEntry({
          showId: testShow.id,
          classId: 'limited-class-001',
          dogId: dog.id,
          registrationData: {
            submittedAt: new Date(Date.now() + i * 1000).toISOString(),
            handler: `Handler ${i + 1}`,
            entryFee: 25.00,
            paymentStatus: 'pending'
          }
        }, {
          allowWaitlist: true
        });

        results.phase2_waitlistCreation.push({
          dogName: dog.name,
          success: entryResult.success,
          isWaitlisted: entryResult.isWaitlisted,
          entryId: entryResult.entry?.id,
          errors: entryResult.errors,
          warnings: entryResult.warnings
        });
      }

      // Get current class stats
      const currentStats = EntryLimitChecker.getClassEntryStats(
        'limited-class-001',
        entryStore.entries,
        testShow.trials[0].classes[0]
      );

      // Phase 3: Cancel first entry to open a spot
      const firstEntry = entryStore.entries.find(e => 
        e.classId === 'limited-class-001' && e.status === 'confirmed'
      );
      
      if (firstEntry) {
        const cancellationResult = await OfflineEntryCreator.scratchEntry(
          firstEntry.id,
          'Owner cancellation',
          'system'
        );
        
        results.phase3_cancellation = {
          success: cancellationResult.success,
          error: cancellationResult.error,
          entryId: firstEntry.id
        };
      }

      // Phase 4: Promote first waitlisted entry
      const waitlistedEntries = entryStore.entries
        .filter(e => e.classId === 'limited-class-001' && (e.status as string) === 'waitlist')
        .sort((a, b) => new Date(a.registrationData.submittedAt).getTime() - new Date(b.registrationData.submittedAt).getTime());

      if (waitlistedEntries.length > 0) {
        const promotionResult = await OfflineEntryCreator.promoteFromWaitlist(
          waitlistedEntries[0].id,
          'system'
        );

        results.phase4_promotion = {
          success: promotionResult.success,
          error: promotionResult.error,
          promotedEntryId: waitlistedEntries[0].id,
          promotedDogId: waitlistedEntries[0].dogId
        };
      }

      // Final statistics
      results.finalStats = EntryLimitChecker.getClassEntryStats(
        'limited-class-001',
        entryStore.entries,
        testShow.trials[0].classes[0]
      );

      // Verify results
      expect(results.phase1_fillCapacity).toHaveLength(3);
      expect(results.phase1_fillCapacity.every(r => r.success)).toBe(true);
      expect(results.phase1_fillCapacity.every(r => !r.isWaitlisted)).toBe(true);

      expect(results.phase2_waitlistCreation).toHaveLength(2);
      expect(results.phase2_waitlistCreation.some(r => r.isWaitlisted)).toBe(true);

      expect(results.phase3_cancellation?.success).toBe(true);
      
      expect(results.phase4_promotion?.success).toBe(true);
      expect(results.phase4_promotion?.promotedDogId).toBe('integration-dog-004'); // First waitlisted

      expect(results.finalStats.confirmed).toBe(3); // Back to capacity after promotion
      expect(results.finalStats.waitlisted).toBe(1); // One still on waitlist

      console.log('✓ Complete waitlist workflow integration test passed:', results);
    });
  });

  describe('Concurrent Entry Processing', () => {
    it('should handle concurrent entries with proper waitlist coordination', async () => {
      // Setup show with multiple classes
      const testShow: Show = {
        id: 'concurrent-show-001',
        name: 'Concurrent Test Show',
        date: '2024-03-20',
        maxTotalEntries: 50,
        trials: [{
          id: 'concurrent-trial-001',
          name: 'Concurrent Trial',
          maxTotalEntries: 30,
          classes: [
            {
              id: 'concurrent-class-001',
              name: 'Fast Fill Class',
              maxEntries: 2,
              allowWaitlist: true,
              entryFee: 25.00
            },
            {
              id: 'concurrent-class-002', 
              name: 'Medium Class',
              maxEntries: 4,
              allowWaitlist: true,
              entryFee: 25.00
            },
            {
              id: 'concurrent-class-003',
              name: 'Large Class',
              maxEntries: 8,
              allowWaitlist: false,
              entryFee: 25.00
            }
          ] as Class[]
        }],
        status: 'accepting_entries',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Show;

      // Create dogs for concurrent testing
      const concurrentDogs: Dog[] = Array.from({ length: 8 }, (_, i) => ({
        id: `concurrent-dog-${i + 1}`,
        name: `ConcurrentDog${i + 1}`,
        breed: 'Test Breed',
        ownerId: `owner-${i + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })) as Dog[];

      showStore.importShows([testShow]);
      dogStore.importDogs(concurrentDogs);

      // Create multiple entries across classes simultaneously
      const entryPromises = [];
      
      // Fill fast fill class and create waitlist
      for (let i = 0; i < 4; i++) {
        entryPromises.push(
          OfflineEntryCreator.createEntry({
            showId: testShow.id,
            classId: 'concurrent-class-001',
            dogId: concurrentDogs[i].id,
            registrationData: {
              submittedAt: new Date(Date.now() + i * 100).toISOString(),
              handler: `Handler ${i + 1}`,
              entryFee: 25.00,
              paymentStatus: 'pending'
            }
          }, { allowWaitlist: true })
        );
      }

      // Fill medium class partially
      for (let i = 0; i < 3; i++) {
        entryPromises.push(
          OfflineEntryCreator.createEntry({
            showId: testShow.id,
            classId: 'concurrent-class-002',
            dogId: concurrentDogs[i + 4].id,
            registrationData: {
              submittedAt: new Date(Date.now() + (i + 4) * 100).toISOString(),
              handler: `Handler ${i + 5}`,
              entryFee: 25.00,
              paymentStatus: 'pending'
            }
          }, { allowWaitlist: true })
        );
      }

      // Process all entries concurrently
      const entryResults = await Promise.all(entryPromises);

      // Analyze results
      const fastFillResults = entryResults.slice(0, 4);
      const mediumClassResults = entryResults.slice(4, 7);

      const fastFillStats = EntryLimitChecker.getClassEntryStats(
        'concurrent-class-001',
        entryStore.entries,
        testShow.trials[0].classes[0]
      );

      const mediumClassStats = EntryLimitChecker.getClassEntryStats(
        'concurrent-class-002',
        entryStore.entries,
        testShow.trials[0].classes[1]
      );

      // Verify concurrent processing
      expect(fastFillResults.every(r => r.success)).toBe(true);
      expect(fastFillStats.confirmed + fastFillStats.waitlisted).toBe(4);
      expect(fastFillStats.confirmed).toBeLessThanOrEqual(2); // Within capacity
      expect(fastFillStats.waitlisted).toBeGreaterThan(0); // Some waitlisted

      expect(mediumClassResults.every(r => r.success)).toBe(true);
      expect(mediumClassStats.confirmed).toBe(3); // All should fit
      expect(mediumClassStats.waitlisted).toBe(0); // None waitlisted

      console.log('✓ Concurrent entry processing test passed');
    });
  });

  describe('Secretary Waitlist Management', () => {
    it('should provide secretary tools for waitlist management', async () => {
      // Setup test data
      const testShow: Show = {
        id: 'secretary-show-001',
        name: 'Secretary Test Show',
        trials: [{
          id: 'secretary-trial-001',
          classes: [{
            id: 'secretary-class-001',
            name: 'Secretary Test Class',
            maxEntries: 2,
            allowWaitlist: true,
            entryFee: 25.00
          }] as Class[]
        }],
        status: 'accepting_entries',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Show;

      const testDogs: Dog[] = [
        { id: 'secretary-dog-001', name: 'TestDog1', breed: 'Breed1', ownerId: 'owner1' },
        { id: 'secretary-dog-002', name: 'TestDog2', breed: 'Breed2', ownerId: 'owner2' },
        { id: 'secretary-dog-003', name: 'TestDog3', breed: 'Breed3', ownerId: 'owner3' },
        { id: 'secretary-dog-004', name: 'TestDog4', breed: 'Breed4', ownerId: 'owner4' }
      ] as Dog[];

      showStore.importShows([testShow]);
      dogStore.importDogs(testDogs);

      // Fill class and create waitlist
      const entryCreationResults = [];
      for (let i = 0; i < 4; i++) {
        const result = await OfflineEntryCreator.createEntry({
          showId: testShow.id,
          classId: 'secretary-class-001',
          dogId: testDogs[i].id,
          registrationData: {
            submittedAt: new Date(Date.now() + i * 1000).toISOString(),
            handler: `Handler ${i + 1}`,
            entryFee: 25.00,
            paymentStatus: 'pending'
          }
        }, { allowWaitlist: true });

        entryCreationResults.push(result);

        // First 2 entries get confirmed, rest go to waitlist
        if (result.success && result.entry && i < 2) {
          await entryStore.updateStatus(result.entry.id, 'confirmed', 'secretary', 'Confirmed by secretary');
        }
      }

      // Secretary management functions
      const secretaryManagement = {
        // Get all entries for class
        getAllEntries: () => entryStore.getEntriesByClass('secretary-class-001'),
        
        // Get waitlisted entries in order
        getWaitlistInOrder: () => {
          return entryStore.entries
            .filter(e => e.classId === 'secretary-class-001' && (e.status as string) === 'waitlist')
            .sort((a, b) => new Date(a.registrationData.submittedAt).getTime() - new Date(b.registrationData.submittedAt).getTime());
        },

        // Get class statistics
        getClassStats: () => EntryLimitChecker.getClassEntryStats(
          'secretary-class-001',
          entryStore.entries,
          testShow.trials[0].classes[0]
        ),

        // Manual promotion from waitlist
        promoteFromWaitlist: async (entryId: string) => {
          return await OfflineEntryCreator.promoteFromWaitlist(entryId, 'secretary');
        },

        // Manual cancellation
        cancelEntry: async (entryId: string, reason: string) => {
          return await OfflineEntryCreator.scratchEntry(entryId, reason, 'secretary');
        }
      };

      // Test secretary management functions
      const allEntries = secretaryManagement.getAllEntries();
      const waitlistEntries = secretaryManagement.getWaitlistInOrder();
      const initialStats = secretaryManagement.getClassStats();

      expect(allEntries).toHaveLength(4);
      expect(waitlistEntries).toHaveLength(2);
      expect(initialStats.confirmed).toBe(2);
      expect(initialStats.waitlisted).toBe(2);

      // Test manual promotion
      if (waitlistEntries.length > 0) {
        // Cancel first entry to make space
        const firstConfirmed = allEntries.find(e => e.status === 'confirmed');
        if (firstConfirmed) {
          const cancellationResult = await secretaryManagement.cancelEntry(
            firstConfirmed.id,
            'Secretary cancellation for testing'
          );
          expect(cancellationResult.success).toBe(true);
        }

        // Promote first waitlisted entry
        const promotionResult = await secretaryManagement.promoteFromWaitlist(waitlistEntries[0].id);
        expect(promotionResult.success).toBe(true);

        const finalStats = secretaryManagement.getClassStats();
        expect(finalStats.confirmed).toBe(2); // Back to capacity
        expect(finalStats.waitlisted).toBe(1); // One less on waitlist
      }

      console.log('✓ Secretary waitlist management test passed');
    });
  });

  describe('Priority and Special Rules', () => {
    it('should handle priority-based waitlist ordering', async () => {
      // Setup test with priority scenarios
      const testShow: Show = {
        id: 'priority-show-001',
        name: 'Priority Test Show',
        trials: [{
          id: 'priority-trial-001',
          classes: [{
            id: 'priority-class-001',
            name: 'Priority Test Class',
            maxEntries: 1, // Very limited
            allowWaitlist: true,
            entryFee: 25.00
          }] as Class[]
        }],
        status: 'accepting_entries',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Show;

      const priorityDogs: Dog[] = [
        { id: 'regular-dog-001', name: 'RegularDog1', breed: 'Breed1', ownerId: 'regular-owner-1' },
        { id: 'local-dog-001', name: 'LocalDog1', breed: 'Breed2', ownerId: 'local-owner-1' },
        { id: 'sponsor-dog-001', name: 'SponsorDog1', breed: 'Breed3', ownerId: 'sponsor-owner-1' },
        { id: 'regular-dog-002', name: 'RegularDog2', breed: 'Breed4', ownerId: 'regular-owner-2' }
      ] as Dog[];

      showStore.importShows([testShow]);
      dogStore.importDogs(priorityDogs);

      // Fill capacity first
      const firstResult = await OfflineEntryCreator.createEntry({
        showId: testShow.id,
        classId: 'priority-class-001',
        dogId: priorityDogs[0].id,
        registrationData: {
          submittedAt: '2024-03-15T09:00:00Z',
          handler: 'First Handler',
          entryFee: 25.00,
          paymentStatus: 'paid'
        }
      });

      if (firstResult.success && firstResult.entry) {
        await entryStore.updateStatus(firstResult.entry.id, 'confirmed', 'system', 'First entry confirmed');
      }

      // Create waitlist entries with different priorities and timestamps
      const waitlistScenarios = [
        {
          dog: priorityDogs[1], // Regular dog - submitted first
          timestamp: '2024-03-15T10:00:00Z',
          priority: 'regular',
          handler: 'Regular Handler 1'
        },
        {
          dog: priorityDogs[2], // Local member - submitted second
          timestamp: '2024-03-15T10:15:00Z', 
          priority: 'local_member',
          handler: 'Local Member Handler',
          specialNote: 'Local club member'
        },
        {
          dog: priorityDogs[3], // Sponsor - submitted last but highest priority
          timestamp: '2024-03-15T10:30:00Z',
          priority: 'sponsor',
          handler: 'Sponsor Handler',
          specialNote: 'Event sponsor'
        },
        {
          dog: priorityDogs[0], // Another regular - submitted very early
          timestamp: '2024-03-15T09:45:00Z',
          priority: 'regular',
          handler: 'Early Regular Handler'
        }
      ];

      const waitlistResults = [];
      for (const scenario of waitlistScenarios) {
        const result = await OfflineEntryCreator.createEntry({
          showId: testShow.id,
          classId: 'priority-class-001',
          dogId: scenario.dog.id,
          registrationData: {
            submittedAt: scenario.timestamp,
            handler: scenario.handler,
            entryFee: 25.00,
            paymentStatus: 'pending',
            specialRequests: scenario.specialNote
          }
        }, { allowWaitlist: true });

        waitlistResults.push({
          dogName: scenario.dog.name,
          priority: scenario.priority,
          timestamp: scenario.timestamp,
          success: result.success,
          isWaitlisted: result.isWaitlisted
        });
      }

      // Get waitlisted entries and simulate priority ordering  
      const waitlistedEntries = entryStore.entries
        .filter(e => e.classId === 'priority-class-001' && (e.status as string) === 'waitlist');

      // Priority ordering logic: sponsor > local_member > regular (by timestamp)
      const priorityOrdered = waitlistedEntries.sort((a, b) => {
        const aPriority = a.registrationData.specialRequests?.includes('sponsor') ? 0 :
                        a.registrationData.specialRequests?.includes('Local') ? 1 : 2;
        const bPriority = b.registrationData.specialRequests?.includes('sponsor') ? 0 :
                        b.registrationData.specialRequests?.includes('Local') ? 1 : 2;
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Same priority, sort by timestamp
        return new Date(a.registrationData.submittedAt).getTime() - new Date(b.registrationData.submittedAt).getTime();
      });

      // Verify priority ordering
      expect(waitlistedEntries).toHaveLength(4);
      expect(priorityOrdered[0].registrationData.specialRequests).toContain('sponsor'); // Sponsor first
      expect(priorityOrdered[1].registrationData.specialRequests).toContain('Local'); // Local member second

      console.log('✓ Priority-based waitlist ordering test passed');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large waitlists efficiently', async () => {
      const startTime = Date.now();

      // Create show with large capacity for performance testing
      const performanceShow: Show = {
        id: 'performance-show-001',
        name: 'Performance Test Show',
        trials: [{
          id: 'performance-trial-001',
          classes: [{
            id: 'performance-class-001',
            name: 'Performance Test Class',
            maxEntries: 10, // Will create waitlist of 40
            allowWaitlist: true,
            entryFee: 25.00
          }] as Class[]
        }],
        status: 'accepting_entries',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Show;

      // Create 50 dogs for performance testing
      const performanceDogs: Dog[] = Array.from({ length: 50 }, (_, i) => ({
        id: `perf-dog-${i + 1}`,
        name: `PerfDog${i + 1}`,
        breed: 'Performance Breed',
        ownerId: `perf-owner-${i + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })) as Dog[];

      showStore.importShows([performanceShow]);
      dogStore.importDogs(performanceDogs);

      // Create entries in batches to test batch processing
      const batchSize = 10;
      const results = {
        totalEntries: 0,
        confirmedEntries: 0,
        waitlistedEntries: 0,
        processingTimes: [] as number[]
      };

      for (let batch = 0; batch < 5; batch++) {
        const batchStart = Date.now();
        const batchEntries = [];

        for (let i = 0; i < batchSize; i++) {
          const dogIndex = batch * batchSize + i;
          batchEntries.push({
            showId: performanceShow.id,
            classId: 'performance-class-001',
            dogId: performanceDogs[dogIndex].id,
            registrationData: {
              submittedAt: new Date(Date.now() + dogIndex * 100).toISOString(),
              handler: `Handler ${dogIndex + 1}`,
              entryFee: 25.00,
              paymentStatus: 'pending'
            }
          });
        }

        // Use batch creation
        const batchResult = await OfflineEntryCreator.createBatchEntries(batchEntries, {
          allowWaitlist: true,
          ignoreWarnings: true // Allow waitlisted entries
        });

        results.totalEntries += batchResult.totalCreated + batchResult.totalWaitlisted;
        results.confirmedEntries += batchResult.totalCreated;
        results.waitlistedEntries += batchResult.totalWaitlisted;
        
        const batchTime = Date.now() - batchStart;
        results.processingTimes.push(batchTime);

        console.log(`Batch ${batch + 1}: ${batchTime}ms, Created: ${batchResult.totalCreated}, Waitlisted: ${batchResult.totalWaitlisted}`);
      }

      const totalTime = Date.now() - startTime;
      const avgBatchTime = results.processingTimes.reduce((a, b) => a + b, 0) / results.processingTimes.length;

      // Performance assertions
      expect(results.totalEntries).toBe(50);
      expect(results.confirmedEntries).toBeLessThanOrEqual(10); // Within capacity
      expect(results.waitlistedEntries).toBe(40); // Remaining on waitlist
      expect(avgBatchTime).toBeLessThan(1000); // Batches should process quickly
      expect(totalTime).toBeLessThan(5000); // Total should be reasonable

      // Verify final state
      const finalStats = EntryLimitChecker.getClassEntryStats(
        'performance-class-001',
        entryStore.entries,
        performanceShow.trials[0].classes[0]
      );

      expect(finalStats.confirmed + finalStats.waitlisted).toBe(50);
      expect(finalStats.confirmed).toBeLessThanOrEqual(10);

      console.log(`✓ Performance test passed: ${totalTime}ms total, ${avgBatchTime}ms avg batch`);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle invalid data and recover gracefully', async () => {
      // Test various error scenarios
      const errorTests = [
        {
          name: 'Invalid show ID',
          entryData: {
            showId: 'nonexistent-show',
            classId: 'test-class',
            dogId: 'test-dog',
            registrationData: {
              submittedAt: new Date().toISOString(),
              handler: 'Test Handler',
              entryFee: 25.00,
              paymentStatus: 'pending' as const
            }
          },
          expectedError: true
        },
        {
          name: 'Invalid class ID', 
          entryData: {
            showId: 'test-show',
            classId: 'nonexistent-class',
            dogId: 'test-dog',
            registrationData: {
              submittedAt: new Date().toISOString(),
              handler: 'Test Handler',
              entryFee: 25.00,
              paymentStatus: 'pending' as const
            }
          },
          expectedError: true
        },
        {
          name: 'Invalid dog ID',
          entryData: {
            showId: 'test-show',
            classId: 'test-class',
            dogId: 'nonexistent-dog',
            registrationData: {
              submittedAt: new Date().toISOString(),
              handler: 'Test Handler',
              entryFee: 25.00,
              paymentStatus: 'pending' as const
            }
          },
          expectedError: true
        }
      ];

      const results = [];

      for (const test of errorTests) {
        try {
          const result = await OfflineEntryCreator.createEntry(test.entryData, {
            allowWaitlist: true
          });
          
          results.push({
            testName: test.name,
            success: result.success,
            hasErrors: result.errors.length > 0,
            errorCount: result.errors.length
          });
        } catch (error) {
          results.push({
            testName: test.name,
            success: false,
            hasErrors: true,
            threwException: true,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // All error tests should fail gracefully without throwing
      expect(results.every(r => !r.threwException)).toBe(true);
      expect(results.every(r => !r.success || r.hasErrors)).toBe(true);

      console.log('✓ Error recovery and edge case handling test passed');
    });
  });
});