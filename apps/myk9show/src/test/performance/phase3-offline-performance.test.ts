/**
 * Performance tests for Phase 3 Offline Show Operations
 * Tests performance characteristics of offline entry, scoring, and check-in systems
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Service imports
import { OfflineEntryCreator } from '@/services/entries/OfflineEntryCreator';
import { OfflineScoringService } from '@/services/scoring/OfflineScoringService';
import { OfflineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { ArmbandManager } from '@/services/offline-checkin/ArmbandManager';
import { PlacementCalculatorService } from '@/services/scoring/PlacementCalculatorService';

// Store imports
import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useEntryStore } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';

// Type imports
import type { Show } from '@/types/show-types';
import type { Class } from '@/types/class-types';
import type { Entry } from '@/types/entry-types';
import type { Score } from '@/types/scoring-types';

describe('Phase 3 Offline Performance Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    
    // Reset all stores
    useShowStore.getState().clearShows();
    useTrialStore.getState().clearTrials();
    useClassStore.getState().clearClasses();
    useEntryStore.getState().clearEntries();
    
    ArmbandManager.reset();
  });

  describe('Entry Creation Performance', () => {
    it('should create entries efficiently at scale', async () => {
      // Set up show structure
      const show: Show = {
        id: 'perf-show',
        name: 'Performance Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const testClass: Class = {
        id: 'perf-class',
        name: 'Performance Class',
        showId: 'perf-show',
        maxEntries: 5000, // Large capacity
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 300,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(testClass);

      // Performance test: Create 1000 entries
      const entryCount = 1000;
      const startTime = performance.now();

      const entryPromises = Array.from({ length: entryCount }, (_, i) =>
        OfflineEntryCreator.createEntry({
          dogId: `perf-dog-${i}`,
          classId: 'perf-class',
          showId: 'perf-show',
          handler: `Handler ${i}`,
          entryFee: 25
        })
      );

      const results = await Promise.all(entryPromises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const entriesPerSecond = (entryCount / duration) * 1000;

      // Performance assertions
      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
      expect(entriesPerSecond).toBeGreaterThan(500); // At least 500 entries/second

      console.log(`Created ${entryCount} entries in ${duration.toFixed(2)}ms`);
      console.log(`Performance: ${entriesPerSecond.toFixed(2)} entries/second`);
    });

    it('should handle concurrent entry creation efficiently', async () => {
      // Set up multiple classes
      const show: Show = {
        id: 'concurrent-show',
        name: 'Concurrent Test Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const classes: Class[] = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-class-${i}`,
        name: `Class ${i}`,
        showId: 'concurrent-show',
        maxEntries: 100,
        entryFee: 25,
        status: 'scheduled',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 60,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      }));

      useShowStore.getState().addShow(show);
      classes.forEach(cls => useClassStore.getState().addClass(cls));

      // Create entries concurrently across all classes
      const startTime = performance.now();
      
      const concurrentPromises = [];
      for (let dogIndex = 0; dogIndex < 100; dogIndex++) {
        for (let classIndex = 0; classIndex < 10; classIndex++) {
          concurrentPromises.push(
            OfflineEntryCreator.createEntry({
              dogId: `concurrent-dog-${dogIndex}`,
              classId: `concurrent-class-${classIndex}`,
              showId: 'concurrent-show',
              handler: `Handler ${dogIndex}`,
              entryFee: 25
            })
          );
        }
      }

      const results = await Promise.all(concurrentPromises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const totalEntries = results.length;

      expect(results.every(r => r.success)).toBe(true);
      expect(totalEntries).toBe(1000); // 100 dogs × 10 classes
      expect(duration).toBeLessThan(3000); // Should complete in under 3 seconds

      // Verify distribution across classes
      const allEntries = useEntryStore.getState().entries;
      classes.forEach(cls => {
        const classEntries = allEntries.filter(e => e.classId === cls.id);
        expect(classEntries).toHaveLength(100);
      });

      console.log(`Created ${totalEntries} concurrent entries in ${duration.toFixed(2)}ms`);
    });

    it('should efficiently handle entry validation at scale', async () => {
      // Create large dataset for validation testing
      const validationCount = 10000;
      const startTime = performance.now();

      const validationPromises = Array.from({ length: validationCount }, (_, i) => {
        // Mix of valid and invalid entries
        const isValid = i % 10 !== 0; // Every 10th entry is invalid
        
        return OfflineEntryCreator.createEntry({
          dogId: isValid ? `valid-dog-${i}` : '', // Invalid empty dog ID
          classId: 'test-class',
          showId: 'test-show',
          handler: `Handler ${i}`,
          entryFee: isValid ? 25 : -1 // Invalid negative fee
        });
      });

      const results = await Promise.all(validationPromises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const validationsPerSecond = (validationCount / duration) * 1000;

      // Verify validation results
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      expect(successCount).toBe(9000); // 90% should succeed
      expect(failureCount).toBe(1000); // 10% should fail
      expect(validationsPerSecond).toBeGreaterThan(1000); // At least 1000 validations/second

      console.log(`Validated ${validationCount} entries in ${duration.toFixed(2)}ms`);
      console.log(`Performance: ${validationsPerSecond.toFixed(2)} validations/second`);
    });
  });

  describe('Check-in Performance', () => {
    it('should handle high-volume check-ins efficiently', async () => {
      // Set up show and entries
      const show: Show = {
        id: 'checkin-show',
        name: 'Check-in Performance Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const checkInClass: Class = {
        id: 'checkin-class',
        name: 'Check-in Class',
        showId: 'checkin-show',
        maxEntries: 2000,
        entryFee: 25,
        status: 'check_in_open',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 120,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(checkInClass);

      // Initialize large armband range
      ArmbandManager.initializeRanges('checkin-show', [
        { classId: 'checkin-class', startNumber: 1, endNumber: 2000 }
      ]);

      // Create entries first
      const entryCount = 1000;
      const entries: Entry[] = [];

      for (let i = 0; i < entryCount; i++) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: `checkin-dog-${i}`,
          classId: 'checkin-class',
          showId: 'checkin-show',
          handler: `Handler ${i}`,
          entryFee: 25
        });
        entries.push(result.entry!);
      }

      // Performance test: Check in all entries
      const checkInStartTime = performance.now();

      const checkInPromises = entries.map((entry, i) =>
        OfflineCheckInService.checkInEntry({
          entryId: entry.id,
          classId: 'checkin-class',
          showId: 'checkin-show',
          checkedInBy: 'perf-steward',
          checkedInAt: new Date().toISOString(),
          armbandNumber: (i + 1).toString()
        })
      );

      const checkInResults = await Promise.all(checkInPromises);
      const checkInEndTime = performance.now();

      const checkInDuration = checkInEndTime - checkInStartTime;
      const checkInsPerSecond = (entryCount / checkInDuration) * 1000;

      expect(checkInResults.every(r => r.success)).toBe(true);
      expect(checkInDuration).toBeLessThan(3000); // Should complete in under 3 seconds
      expect(checkInsPerSecond).toBeGreaterThan(300); // At least 300 check-ins/second

      console.log(`Checked in ${entryCount} entries in ${checkInDuration.toFixed(2)}ms`);
      console.log(`Performance: ${checkInsPerSecond.toFixed(2)} check-ins/second`);
    });

    it('should efficiently manage armband assignments at scale', async () => {
      // Initialize very large armband range
      const armbandCount = 10000;
      const startTime = performance.now();

      ArmbandManager.initializeRanges('armband-show', [
        { classId: 'armband-class', startNumber: 1, endNumber: armbandCount }
      ]);

      const initTime = performance.now();

      // Assign armbands sequentially
      const assignments = [];
      for (let i = 1; i <= 5000; i++) {
        const assignment = ArmbandManager.assignNextArmband('armband-class', `entry-${i}`);
        assignments.push(assignment);
      }

      const assignTime = performance.now();

      // Check availability calculation performance
      const availability = ArmbandManager.getAvailability('armband-class');
      const availabilityTime = performance.now();

      const initDuration = initTime - startTime;
      const assignDuration = assignTime - initTime;
      const availabilityDuration = availabilityTime - assignTime;

      expect(assignments.every(a => a.success)).toBe(true);
      expect(availability.assignedArmbands).toBe(5000);
      expect(availability.availableArmbands).toBe(5000);

      // Performance assertions
      expect(initDuration).toBeLessThan(100); // Initialization should be very fast
      expect(assignDuration).toBeLessThan(500); // 5000 assignments in under 500ms
      expect(availabilityDuration).toBeLessThan(50); // Availability calculation very fast

      console.log(`Armband initialization: ${initDuration.toFixed(2)}ms`);
      console.log(`5000 assignments: ${assignDuration.toFixed(2)}ms`);
      console.log(`Availability calculation: ${availabilityDuration.toFixed(2)}ms`);
    });

    it('should handle concurrent check-in conflicts efficiently', async () => {
      // Set up show structure
      const show: Show = {
        id: 'conflict-show',
        name: 'Conflict Performance Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const conflictClass: Class = {
        id: 'conflict-class',
        name: 'Conflict Class',
        showId: 'conflict-show',
        maxEntries: 500,
        entryFee: 25,
        status: 'check_in_open',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 120,
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(conflictClass);

      ArmbandManager.initializeRanges('conflict-show', [
        { classId: 'conflict-class', startNumber: 1, endNumber: 500 }
      ]);

      // Create entries
      const entries: Entry[] = [];
      for (let i = 0; i < 200; i++) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: `conflict-dog-${i}`,
          classId: 'conflict-class',
          showId: 'conflict-show',
          handler: `Handler ${i}`,
          entryFee: 25
        });
        entries.push(result.entry!);
      }

      // Simulate high-conflict scenario: many entries trying for same armbands
      const startTime = performance.now();
      
      const conflictPromises = [];
      
      // Create intentional conflicts
      for (let i = 0; i < entries.length; i++) {
        const preferredArmband = (i % 50) + 1; // 200 entries competing for 50 armbands
        
        conflictPromises.push(
          OfflineCheckInService.checkInEntry({
            entryId: entries[i].id,
            classId: 'conflict-class',
            showId: 'conflict-show',
            checkedInBy: 'conflict-steward',
            checkedInAt: new Date().toISOString(),
            armbandNumber: preferredArmband.toString()
          })
        );
      }

      const results = await Promise.all(conflictPromises);
      const endTime = performance.now();

      const duration = endTime - startTime;
      const successCount = results.filter(r => r.success).length;
      const conflictCount = results.filter(r => !r.success).length;

      // Should handle conflicts efficiently
      expect(successCount).toBe(50); // Only 50 should succeed (one per armband)
      expect(conflictCount).toBe(150); // 150 should fail due to conflicts
      expect(duration).toBeLessThan(1000); // Should resolve conflicts quickly

      console.log(`Resolved ${results.length} concurrent conflicts in ${duration.toFixed(2)}ms`);
      console.log(`${successCount} successful, ${conflictCount} conflicts detected`);
    });
  });

  describe('Scoring Performance', () => {
    it('should handle high-volume scoring efficiently', async () => {
      // Set up show with many checked-in entries
      const show: Show = {
        id: 'scoring-show',
        name: 'Scoring Performance Show',
        date: '2024-07-15',
        location: 'Test Venue',
        status: 'active',
        organizingClub: 'Test Club',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      const scoringClass: Class = {
        id: 'scoring-class',
        name: 'Scoring Class',
        showId: 'scoring-show',
        maxEntries: 2000,
        entryFee: 25,
        status: 'in_progress',
        judgeId: 'judge-1',
        rings: ['1'],
        scheduledTime: '09:00',
        estimatedDuration: 180,
        scoringType: 'time_plus_faults',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      };

      useShowStore.getState().addShow(show);
      useClassStore.getState().addClass(scoringClass);

      // Create and check in entries
      const entryCount = 1000;
      const entries: Entry[] = [];

      for (let i = 0; i < entryCount; i++) {
        // Create entry
        const entryResult = await OfflineEntryCreator.createEntry({
          dogId: `scoring-dog-${i}`,
          classId: 'scoring-class',
          showId: 'scoring-show',
          handler: `Handler ${i}`,
          entryFee: 25
        });

        // Check in entry
        await OfflineCheckInService.checkInEntry({
          entryId: entryResult.entry!.id,
          classId: 'scoring-class',
          showId: 'scoring-show',
          checkedInBy: 'scoring-steward',
          checkedInAt: new Date().toISOString(),
          armbandNumber: (i + 1).toString()
        });

        entries.push(entryResult.entry!);
      }

      // Performance test: Score all entries
      const scoringStartTime = performance.now();

      const scorePromises = entries.map((entry, i) =>
        OfflineScoringService.recordScore({
          entryId: entry.id,
          classId: 'scoring-class',
          judgeId: 'judge-1',
          time: `${40 + (i % 30)}.${Math.floor(Math.random() * 100)}`,
          faults: i % 5,
          status: i % 20 === 0 ? 'Not Qualified' : 'Qualified', // 5% NQ rate
          scoredAt: new Date().toISOString()
        })
      );

      const scoreResults = await Promise.all(scorePromises);
      const scoringEndTime = performance.now();

      const scoringDuration = scoringEndTime - scoringStartTime;
      const scoresPerSecond = (entryCount / scoringDuration) * 1000;

      expect(scoreResults.every(r => r.success)).toBe(true);
      expect(scoringDuration).toBeLessThan(2500); // Should complete in under 2.5 seconds
      expect(scoresPerSecond).toBeGreaterThan(400); // At least 400 scores/second

      console.log(`Scored ${entryCount} entries in ${scoringDuration.toFixed(2)}ms`);
      console.log(`Performance: ${scoresPerSecond.toFixed(2)} scores/second`);
    });

    it('should efficiently calculate placements for large result sets', async () => {
      // Create large set of scores for placement calculation
      const scoreCount = 5000;
      const scores: Score[] = Array.from({ length: scoreCount }, (_, i) => ({
        id: `score-${i}`,
        entryId: `entry-${i}`,
        classId: 'placement-class',
        judgeId: 'judge-1',
        time: `${30 + Math.random() * 60}.${Math.floor(Math.random() * 100)}`,
        faults: Math.floor(Math.random() * 8),
        status: Math.random() > 0.1 ? 'Qualified' : 'Not Qualified', // 90% qualified
        scoredAt: '2024-07-15T10:00:00Z'
      }));

      // Test time-based placement calculation
      const timeStartTime = performance.now();
      const timePlacements = PlacementCalculatorService.calculateTimePlacements(scores);
      const timeEndTime = performance.now();

      const timeDuration = timeEndTime - timeStartTime;

      expect(timePlacements.size).toBeGreaterThan(0);
      expect(timeDuration).toBeLessThan(200); // Should complete in under 200ms

      // Test point-based placement calculation
      const pointScores: Score[] = scores.map(score => ({
        ...score,
        points: 180 + Math.random() * 20, // Random scores 180-200
        maxPoints: 200,
        time: undefined,
        faults: undefined
      }));

      const pointStartTime = performance.now();
      const pointPlacements = PlacementCalculatorService.calculatePointPlacements(pointScores);
      const pointEndTime = performance.now();

      const pointDuration = pointEndTime - pointStartTime;

      expect(pointPlacements.size).toBeGreaterThan(0);
      expect(pointDuration).toBeLessThan(200); // Should complete in under 200ms

      console.log(`Time placements for ${scoreCount} scores: ${timeDuration.toFixed(2)}ms`);
      console.log(`Point placements for ${scoreCount} scores: ${pointDuration.toFixed(2)}ms`);
    });

    it('should handle complex scoring scenarios efficiently', async () => {
      // Test scoring with multiple judges and mixed scoring types
      const judgeCount = 10;
      const entriesPerJudge = 100;
      const totalEntries = judgeCount * entriesPerJudge;

      // Set up multiple classes with different scoring types
      const classes: Class[] = Array.from({ length: judgeCount }, (_, i) => ({
        id: `multi-class-${i}`,
        name: `Class ${i}`,
        showId: 'multi-scoring-show',
        maxEntries: entriesPerJudge,
        entryFee: 25,
        status: 'in_progress',
        judgeId: `judge-${i}`,
        rings: [`${i + 1}`],
        scheduledTime: '09:00',
        estimatedDuration: 90,
        scoringType: i % 3 === 0 ? 'placement' : i % 3 === 1 ? 'time_plus_faults' : 'points',
        createdAt: '2024-07-01T08:00:00Z',
        updatedAt: '2024-07-01T08:00:00Z'
      }));

      classes.forEach(cls => useClassStore.getState().addClass(cls));

      // Create entries for all classes
      const allEntries: Entry[] = [];
      for (let classIndex = 0; classIndex < judgeCount; classIndex++) {
        for (let entryIndex = 0; entryIndex < entriesPerJudge; entryIndex++) {
          const entryResult = await OfflineEntryCreator.createEntry({
            dogId: `multi-dog-${classIndex}-${entryIndex}`,
            classId: `multi-class-${classIndex}`,
            showId: 'multi-scoring-show',
            handler: `Handler ${classIndex}-${entryIndex}`,
            entryFee: 25
          });

          // Check in entry
          await OfflineCheckInService.checkInEntry({
            entryId: entryResult.entry!.id,
            classId: `multi-class-${classIndex}`,
            showId: 'multi-scoring-show',
            checkedInBy: 'multi-steward',
            checkedInAt: new Date().toISOString(),
            armbandNumber: `${(classIndex * 100) + entryIndex + 1}`
          });

          allEntries.push(entryResult.entry!);
        }
      }

      // Score all entries with different scoring methods
      const multiScoringStartTime = performance.now();

      const multiScorePromises = allEntries.map((entry, i) => {
        const classIndex = Math.floor(i / entriesPerJudge);
        const scoringType = classIndex % 3;

        if (scoringType === 0) {
          // Placement scoring
          return OfflineScoringService.recordScore({
            entryId: entry.id,
            classId: entry.classId,
            judgeId: `judge-${classIndex}`,
            placement: (i % entriesPerJudge) + 1,
            comments: `Placement score ${i}`,
            scoredAt: new Date().toISOString()
          });
        } else if (scoringType === 1) {
          // Time + faults scoring
          return OfflineScoringService.recordScore({
            entryId: entry.id,
            classId: entry.classId,
            judgeId: `judge-${classIndex}`,
            time: `${40 + (i % 30)}.${Math.floor(Math.random() * 100)}`,
            faults: i % 6,
            status: i % 10 === 0 ? 'Not Qualified' : 'Qualified',
            scoredAt: new Date().toISOString()
          });
        } else {
          // Points scoring
          return OfflineScoringService.recordScore({
            entryId: entry.id,
            classId: entry.classId,
            judgeId: `judge-${classIndex}`,
            points: 170 + (i % 30),
            maxPoints: 200,
            status: (170 + (i % 30)) >= 170 ? 'Qualified' : 'Not Qualified',
            scoredAt: new Date().toISOString()
          });
        }
      });

      const multiScoreResults = await Promise.all(multiScorePromises);
      const multiScoringEndTime = performance.now();

      const multiScoringDuration = multiScoringEndTime - multiScoringStartTime;
      const multiScoresPerSecond = (totalEntries / multiScoringDuration) * 1000;

      expect(multiScoreResults.every(r => r.success)).toBe(true);
      expect(multiScoringDuration).toBeLessThan(4000); // Should complete in under 4 seconds
      expect(multiScoresPerSecond).toBeGreaterThan(250); // At least 250 scores/second

      console.log(`Multi-judge scoring: ${totalEntries} entries in ${multiScoringDuration.toFixed(2)}ms`);
      console.log(`Performance: ${multiScoresPerSecond.toFixed(2)} scores/second`);
    });
  });

  describe('Data Query Performance', () => {
    it('should efficiently query large datasets', async () => {
      // Set up large dataset
      const showCount = 5;
      const classesPerShow = 20;
      const entriesPerClass = 50;
      const totalEntries = showCount * classesPerShow * entriesPerClass;

      // Create shows, classes, and entries
      for (let showIndex = 0; showIndex < showCount; showIndex++) {
        const show: Show = {
          id: `query-show-${showIndex}`,
          name: `Query Show ${showIndex}`,
          date: '2024-07-15',
          location: 'Test Venue',
          status: 'active',
          organizingClub: 'Test Club',
          createdAt: '2024-07-01T08:00:00Z',
          updatedAt: '2024-07-01T08:00:00Z'
        };

        useShowStore.getState().addShow(show);

        for (let classIndex = 0; classIndex < classesPerShow; classIndex++) {
          const testClass: Class = {
            id: `query-class-${showIndex}-${classIndex}`,
            name: `Class ${showIndex}-${classIndex}`,
            showId: `query-show-${showIndex}`,
            maxEntries: entriesPerClass,
            entryFee: 25,
            status: 'scheduled',
            judgeId: `judge-${classIndex % 5}`,
            rings: [`${(classIndex % 4) + 1}`],
            scheduledTime: '09:00',
            estimatedDuration: 60,
            createdAt: '2024-07-01T08:00:00Z',
            updatedAt: '2024-07-01T08:00:00Z'
          };

          useClassStore.getState().addClass(testClass);

          for (let entryIndex = 0; entryIndex < entriesPerClass; entryIndex++) {
            await OfflineEntryCreator.createEntry({
              dogId: `query-dog-${showIndex}-${classIndex}-${entryIndex}`,
              classId: `query-class-${showIndex}-${classIndex}`,
              showId: `query-show-${showIndex}`,
              handler: `Handler ${showIndex}-${classIndex}-${entryIndex}`,
              entryFee: 25
            });
          }
        }
      }

      // Test various query performance
      const entryStore = useEntryStore.getState();
      const classStore = useClassStore.getState();

      // Query 1: Get entries by show
      const showQueryStart = performance.now();
      const showEntries = entryStore.getEntriesByShow('query-show-0');
      const showQueryEnd = performance.now();

      expect(showEntries).toHaveLength(classesPerShow * entriesPerClass);
      expect(showQueryEnd - showQueryStart).toBeLessThan(50); // Should be very fast

      // Query 2: Get entries by class
      const classQueryStart = performance.now();
      const classEntries = entryStore.getEntriesByClass('query-class-0-0');
      const classQueryEnd = performance.now();

      expect(classEntries).toHaveLength(entriesPerClass);
      expect(classQueryEnd - classQueryStart).toBeLessThan(20); // Should be very fast

      // Query 3: Get entries by status
      const statusQueryStart = performance.now();
      const confirmedEntries = entryStore.getEntriesByStatus('confirmed');
      const statusQueryEnd = performance.now();

      expect(confirmedEntries).toHaveLength(totalEntries);
      expect(statusQueryEnd - statusQueryStart).toBeLessThan(100); // Should be fast

      // Query 4: Get classes by show
      const classesQueryStart = performance.now();
      const classesInShow = classStore.getClassesByShow('query-show-0');
      const classesQueryEnd = performance.now();

      expect(classesInShow).toHaveLength(classesPerShow);
      expect(classesQueryEnd - classesQueryStart).toBeLessThan(30); // Should be very fast

      console.log(`Dataset: ${totalEntries} entries across ${showCount * classesPerShow} classes`);
      console.log(`Show query: ${(showQueryEnd - showQueryStart).toFixed(2)}ms`);
      console.log(`Class query: ${(classQueryEnd - classQueryStart).toFixed(2)}ms`);
      console.log(`Status query: ${(statusQueryEnd - statusQueryStart).toFixed(2)}ms`);
      console.log(`Classes query: ${(classesQueryEnd - classesQueryStart).toFixed(2)}ms`);
    });

    it('should efficiently handle complex filtered queries', async () => {
      // Create diverse dataset for filtering
      const entryCount = 2000;
      
      // Create entries with various characteristics
      for (let i = 0; i < entryCount; i++) {
        const result = await OfflineEntryCreator.createEntry({
          dogId: `filter-dog-${i}`,
          classId: `filter-class-${i % 10}`,
          showId: `filter-show-${i % 5}`,
          handler: `Handler ${i % 100}`,
          entryFee: 25
        });

        // Randomly check in some entries
        if (i % 3 === 0) {
          await OfflineCheckInService.checkInEntry({
            entryId: result.entry!.id,
            classId: `filter-class-${i % 10}`,
            showId: `filter-show-${i % 5}`,
            checkedInBy: 'filter-steward',
            checkedInAt: new Date().toISOString(),
            armbandNumber: (i + 1).toString()
          });
        }

        // Randomly score some checked-in entries
        if (i % 9 === 0) {
          await OfflineScoringService.recordScore({
            entryId: result.entry!.id,
            classId: `filter-class-${i % 10}`,
            judgeId: 'filter-judge',
            placement: (i % 10) + 1,
            scoredAt: new Date().toISOString()
          });
        }
      }

      const entryStore = useEntryStore.getState();

      // Complex filtering tests
      const complexFilterStart = performance.now();

      // Filter 1: Multi-criteria filter
      const multiCriteriaEntries = entryStore.entries.filter(entry =>
        entry.showId === 'filter-show-0' &&
        entry.status === 'checked_in' &&
        entry.armbandNumber &&
        parseInt(entry.armbandNumber) < 500
      );

      // Filter 2: Handler-based grouping
      const handlerGroups = entryStore.entries.reduce((groups, entry) => {
        const handler = entry.registrationData.handler;
        if (!groups[handler]) groups[handler] = [];
        groups[handler].push(entry);
        return groups;
      }, {} as Record<string, Entry[]>);

      // Filter 3: Status distribution
      const statusDistribution = entryStore.entries.reduce((dist, entry) => {
        dist[entry.status] = (dist[entry.status] || 0) + 1;
        return dist;
      }, {} as Record<string, number>);

      const complexFilterEnd = performance.now();

      const filterDuration = complexFilterEnd - complexFilterStart;

      expect(multiCriteriaEntries.length).toBeGreaterThan(0);
      expect(Object.keys(handlerGroups)).toHaveLength(100); // 100 unique handlers
      expect(Object.keys(statusDistribution).length).toBeGreaterThan(2); // Multiple statuses
      expect(filterDuration).toBeLessThan(100); // Should complete quickly

      console.log(`Complex filtering on ${entryCount} entries: ${filterDuration.toFixed(2)}ms`);
      console.log(`Multi-criteria results: ${multiCriteriaEntries.length}`);
      console.log(`Handler groups: ${Object.keys(handlerGroups).length}`);
      console.log(`Status distribution: ${JSON.stringify(statusDistribution)}`);
    });
  });

  describe('Memory Usage and Cleanup', () => {
    it('should manage memory efficiently during large operations', async () => {
      // Monitor memory usage during large dataset operations
      const initialMemory = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

      // Create large dataset
      const largeDatasetSize = 5000;
      
      for (let i = 0; i < largeDatasetSize; i++) {
        await OfflineEntryCreator.createEntry({
          dogId: `memory-dog-${i}`,
          classId: `memory-class-${i % 50}`,
          showId: `memory-show-${i % 10}`,
          handler: `Handler ${i}`,
          entryFee: 25
        });

        // Periodic cleanup test
        if (i % 1000 === 0) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }
      }

      const afterCreationMemory = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

      // Perform operations on dataset
      const entryStore = useEntryStore.getState();
      const allEntries = entryStore.entries;

      // Check memory after operations
      const afterOperationsMemory = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

      // Clear stores
      entryStore.clearEntries();
      useClassStore.getState().clearClasses();
      useShowStore.getState().clearShows();

      // Force cleanup
      if (global.gc) {
        global.gc();
      }

      const afterCleanupMemory = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0;

      // Memory should not grow excessively
      if (initialMemory > 0) {
        const growthRatio = afterCreationMemory / initialMemory;
        expect(growthRatio).toBeLessThan(10); // Should not grow more than 10x

        console.log(`Memory usage:`);
        console.log(`Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`After creation: ${(afterCreationMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`After operations: ${(afterOperationsMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`After cleanup: ${(afterCleanupMemory / 1024 / 1024).toFixed(2)} MB`);
      }

      expect(allEntries).toHaveLength(largeDatasetSize);
    });
  });
});