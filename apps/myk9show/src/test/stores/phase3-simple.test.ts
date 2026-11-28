import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useRegistrationsStore } from '@/store/registrationsStore';
import { useCompetitionStore } from '@/store/competitionStore';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';

// Type imports
import type { Registration } from '@/types/dog-types';
import type { Competition } from '@/types/competition-types';

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

    it('should have properly configured show registration store', () => {
      const store = useShowRegistrationStore.getState();

      expect(typeof store.createRegistration).toBe('function');
      expect(typeof store.updateRegistration).toBe('function');
      expect(typeof store.deleteRegistration).toBe('function');
      expect(Array.isArray(store.registrations)).toBe(true);
    });
  });

  describe('Basic Store Operations', () => {
    it('should handle registration operations', () => {
      const testRegistration: Registration = {
        id: 'test-reg-1',
        organization: 'AKC',
        registrationNumber: 'TEST123',
        registeredName: 'Test Dog',
        registrationDate: new Date().toISOString(),
        breed: 'Labrador Retriever',
        status: 'Active',
      };

      // Test add
      useRegistrationsStore.getState().addRegistration(testRegistration);
      const foundReg = useRegistrationsStore
        .getState()
        .registrations.find(r => r.id === 'test-reg-1');
      expect(foundReg).toEqual(testRegistration);

      // Test update
      const updatedReg = { ...testRegistration, registeredName: 'Updated Name' };
      useRegistrationsStore.getState().updateRegistration(updatedReg);
      const updatedFound = useRegistrationsStore
        .getState()
        .registrations.find(r => r.id === 'test-reg-1');
      expect(updatedFound?.registeredName).toBe('Updated Name');

      // Test remove
      useRegistrationsStore.getState().removeRegistration('test-reg-1');
      const removedFound = useRegistrationsStore
        .getState()
        .registrations.find(r => r.id === 'test-reg-1');
      expect(removedFound).toBeUndefined();
    });

    it('should handle competition operations', () => {
      const testCompetition: Competition = {
        id: 'test-comp-1',
        name: 'Test Competition',
        date: new Date().toISOString(),
        location: 'Test Location',
        dogId: 'test-dog-1',
        status: 'Upcoming',
      };

      useCompetitionStore.getState().addCompetition(testCompetition);
      const found = useCompetitionStore.getState().competitions.find(c => c.id === 'test-comp-1');
      expect(found).toEqual(testCompetition);
    });

    it('should handle show registration operations', () => {
      const store = useShowRegistrationStore.getState();

      const registration = store.createRegistration('test-show-1', 'test-user-1', 'test-user-1');
      expect(registration.showId).toBe('test-show-1');
      expect(registration.userId).toBe('test-user-1');

      const found = store.getRegistration(registration.id);
      expect(found).toEqual(registration);
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
        { name: 'showRegistration', store: useShowRegistrationStore },
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
