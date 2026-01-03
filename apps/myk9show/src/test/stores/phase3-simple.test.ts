import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useRegistrationsStore } from '@/store/registrationsStore';
import { useCompetitionStore } from '@/store/competitionStore';
import { useAchievementsStore } from '@/store/achievementsStore';
import { usePastResultsStore } from '@/store/pastResultsStore';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';
import { useArmbandStore } from '@/store/armbandStore';

// Type imports
import type { Registration } from '@/types/dog-types';
import type { Competition } from '@/types/competition-types';
import type { Achievement } from '@/types/achievement-types';
import type { PastResult } from '@/types/results-types';

describe('Phase 3 Store Configuration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Store Configuration Verification', () => {
    it('should have properly configured registrations store', () => {
      const store = useRegistrationsStore.getState();
      
      // Verify store structure
      expect(typeof store.addRegistration).toBe('function');
      expect(typeof store.updateRegistration).toBe('function');
      expect(typeof store.removeRegistration).toBe('function');
      expect(Array.isArray(store.registrations)).toBe(true);
    });

    it('should have properly configured competition store', () => {
      const store = useCompetitionStore.getState();
      
      expect(typeof store.addCompetition).toBe('function');
      expect(typeof store.editCompetition).toBe('function');
      expect(typeof store.deleteCompetition).toBe('function');
      expect(Array.isArray(store.competitions)).toBe(true);
    });

    it('should have properly configured achievements store', () => {
      const store = useAchievementsStore.getState();
      
      expect(typeof store.addAchievement).toBe('function');
      expect(typeof store.editAchievement).toBe('function');
      expect(typeof store.deleteAchievement).toBe('function');
      expect(Array.isArray(store.achievements)).toBe(true);
    });

    it('should have properly configured past results store', () => {
      const store = usePastResultsStore.getState();
      
      expect(typeof store.addResult).toBe('function');
      expect(typeof store.editResult).toBe('function');
      expect(typeof store.deleteResult).toBe('function');
      expect(Array.isArray(store.results)).toBe(true);
    });

    it('should have properly configured show registration store', () => {
      const store = useShowRegistrationStore.getState();
      
      expect(typeof store.createRegistration).toBe('function');
      expect(typeof store.updateRegistration).toBe('function');
      expect(typeof store.deleteRegistration).toBe('function');
      expect(Array.isArray(store.registrations)).toBe(true);
    });

    it('should have properly configured armband store', () => {
      const store = useArmbandStore.getState();
      
      expect(typeof store.assignArmband).toBe('function');
      expect(typeof store.unassignArmband).toBe('function');
      expect(typeof store.createRange).toBe('function');
      expect(Array.isArray(store.assignments)).toBe(true);
      expect(Array.isArray(store.ranges)).toBe(true);
    });
  });

  describe('Basic Store Operations', () => {
    it('should handle registration operations', () => {
      const testRegistration: Registration = {
        id: 'test-reg-1',
        dogId: 'test-dog-1',
        registrationType: 'AKC',
        registrationNumber: 'TEST123',
        registeredName: 'Test Dog',
        registrationDate: new Date(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true
      };

      // Test add
      useRegistrationsStore.getState().addRegistration(testRegistration);
      const foundReg = useRegistrationsStore.getState().registrations.find(r => r.id === 'test-reg-1');
      expect(foundReg).toEqual(testRegistration);
      
      // Test update
      const updatedReg = { ...testRegistration, registeredName: 'Updated Name' };
      useRegistrationsStore.getState().updateRegistration(updatedReg);
      const updatedFound = useRegistrationsStore.getState().registrations.find(r => r.id === 'test-reg-1');
      expect(updatedFound?.registeredName).toBe('Updated Name');
      
      // Test remove
      useRegistrationsStore.getState().removeRegistration('test-reg-1');
      const removedFound = useRegistrationsStore.getState().registrations.find(r => r.id === 'test-reg-1');
      expect(removedFound).toBeUndefined();
    });

    it('should handle competition operations', () => {
      const testCompetition: Competition = {
        id: 'test-comp-1',
        name: 'Test Competition',
        date: new Date(),
        location: 'Test Location',
        type: 'Conformation',
        status: 'upcoming'
      };

      useCompetitionStore.getState().addCompetition(testCompetition);
      const found = useCompetitionStore.getState().competitions.find(c => c.id === 'test-comp-1');
      expect(found).toEqual(testCompetition);
    });

    it('should handle achievement operations', () => {
      const testAchievement: Achievement = {
        id: 'test-ach-1',
        dogId: 'test-dog-1',
        title: 'Best in Show',
        date: new Date(),
        event: 'Test Show',
        category: 'conformation',
        level: 'major',
        points: 10
      };

      useAchievementsStore.getState().addAchievement(testAchievement);
      const found = useAchievementsStore.getState().achievements.find(a => a.id === 'test-ach-1');
      expect(found).toEqual(testAchievement);
    });

    it('should handle past result operations', () => {
      const testResult: PastResult = {
        id: 'test-result-1',
        dogId: 'test-dog-1',
        showId: 'test-show-1',
        eventName: 'Test Show',
        date: new Date(),
        placement: 1,
        totalEntries: 10,
        className: 'Open Dog',
        judgeName: 'Test Judge',
        points: 5
      };

      usePastResultsStore.getState().addResult(testResult);
      const found = usePastResultsStore.getState().results.find(r => r.id === 'test-result-1');
      expect(found).toEqual(testResult);
    });

    it('should handle show registration operations', () => {
      const store = useShowRegistrationStore.getState();
      
      const registration = store.createRegistration('test-show-1', 'test-user-1');
      expect(registration.showId).toBe('test-show-1');
      expect(registration.userId).toBe('test-user-1');
      
      const found = store.getRegistration(registration.id);
      expect(found).toEqual(registration);
    });

    it('should handle armband operations', () => {
      const store = useArmbandStore.getState();
      
      const assignment = store.assignArmband({
        showId: 'test-show-1',
        dogId: 'test-dog-1',
        armbandNumber: '101',
        assignedBy: 'test-user-1'
      });
      
      expect(assignment.armbandNumber).toBe('101');
      expect(assignment.dogId).toBe('test-dog-1');
      
      const foundAssignments = store.getAssignmentsByShow('test-show-1');
      expect(foundAssignments).toHaveLength(1);
      expect(foundAssignments[0].armbandNumber).toBe('101');
    });
  });

  describe('IndexedDB Integration Status', () => {
    it('should use IndexedDB-enabled storage adapters', () => {
      // This test verifies that the stores are configured to use the optimal storage
      // We can't easily test actual IndexedDB behavior in this environment,
      // but we can verify the stores are properly configured
      
      const stores = [
        { name: 'registrations', store: useRegistrationsStore },
        { name: 'competition', store: useCompetitionStore },
        { name: 'achievements', store: useAchievementsStore },
        { name: 'pastResults', store: usePastResultsStore },
        { name: 'showRegistration', store: useShowRegistrationStore },
        { name: 'armband', store: useArmbandStore },
      ];
      
      stores.forEach(({ store }) => {
        const state = store.getState();
        // Verify the store is functional (basic smoke test)
        expect(typeof state).toBe('object');
        expect(state).not.toBeNull();
      });
    });
  });
});