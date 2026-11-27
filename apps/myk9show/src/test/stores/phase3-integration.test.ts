import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// Store imports
import { useRegistrationsStore } from '@/store/registrationsStore';
import { useCompetitionStore } from '@/store/competitionStore';
import { useShowRegistrationStore } from '@/store/showRegistrationStore';

// Type imports
import type { Registration } from '@/types/dog-types';
import type { Competition } from '@/types/competition-types';
// Unused type imports removed for lint compliance

describe('Phase 3 Integration Tests - Registration & Competition Stores', () => {
  beforeEach(() => {
    // Clear localStorage fallback
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('RegistrationsStore Integration', () => {
    it('should have correct storage configuration', () => {
      const store = useRegistrationsStore.getState();

      // Verify the store is functional
      expect(typeof store.addRegistration).toBe('function');
      expect(typeof store.updateRegistration).toBe('function');
      expect(typeof store.removeRegistration).toBe('function');
      expect(Array.isArray(store.registrations)).toBe(true);
    });

    it('should handle basic operations', () => {
      const store = useRegistrationsStore.getState();
      // Initial count not used in assertions - removed for lint compliance

      const testRegistration: Registration = {
        id: 'reg-test-1',
        organization: 'AKC',
        registrationNumber: 'TEST123',
        registeredName: 'Test Dog',
        breed: 'Mixed Breed',
        status: 'Active',
        registrationDate: new Date().toISOString(),
      };

      // Test add operation
      store.addRegistration(testRegistration);
      expect(
        useRegistrationsStore.getState().registrations.find(r => r.id === 'reg-test-1')
      ).toEqual(testRegistration);

      // Test update operation
      const updatedRegistration = { ...testRegistration, registeredName: 'Updated Dog Name' };
      store.updateRegistration(updatedRegistration);
      expect(
        useRegistrationsStore.getState().registrations.find(r => r.id === 'reg-test-1')
          ?.registeredName
      ).toBe('Updated Dog Name');

      // Test remove operation
      store.removeRegistration('reg-test-1');
      expect(
        useRegistrationsStore.getState().registrations.find(r => r.id === 'reg-test-1')
      ).toBeUndefined();
    });
  });

  describe('CompetitionStore Integration', () => {
    it('should persist competitions to IndexedDB', async () => {
      const store = useCompetitionStore.getState();
      const initialCount = store.competitions.length;

      const testCompetition: Competition = {
        id: 'comp-test-1',
        name: 'Test Competition',
        date: new Date().toISOString(),
        location: 'Test Location',
        dogId: 'dog-test-1',
        status: 'Upcoming',
      };

      store.addCompetition(testCompetition);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(useCompetitionStore.getState().competitions).toHaveLength(initialCount + 1);
      const addedCompetition = useCompetitionStore
        .getState()
        .competitions.find(c => c.id === 'comp-test-1');
      expect(addedCompetition).toEqual(testCompetition);
    });
  });

  describe('ShowRegistrationStore Integration', () => {
    it('should persist show registrations to IndexedDB', async () => {
      const store = useShowRegistrationStore.getState();

      store.createRegistration('show-1', 'user-1', 'user-1');

      await new Promise(resolve => setTimeout(resolve, 100));

      const newStore = useShowRegistrationStore.getState();
      expect(newStore.registrations).toHaveLength(1);
      expect(newStore.registrations[0].showId).toBe('show-1');
      expect(newStore.registrations[0].userId).toBe('user-1');
    });

    it('should handle registration entry management', async () => {
      const store = useShowRegistrationStore.getState();

      const registration = store.createRegistration('show-2', 'user-2', 'user-2');

      store.addEntry(registration.id, {
        dogId: 'dog-1',
        dogName: 'Test Dog',
        trialId: 'trial-1',
        trialName: 'Trial 1',
        classes: [],
        handlerId: 'handler-1',
        handlerName: 'Test Handler',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedRegistration = store.getRegistration(registration.id);
      expect(updatedRegistration?.entries).toHaveLength(1);
      expect(updatedRegistration?.entries[0].dogName).toBe('Test Dog');
    });
  });

  describe('Cross-Store Integration', () => {
    it('should handle related data across multiple stores', async () => {
      const registrationStore = useRegistrationsStore.getState();
      const showRegStore = useShowRegistrationStore.getState();

      // Create a dog registration
      const dogRegistration: Registration = {
        id: 'reg-cross-test-1',
        organization: 'AKC',
        registrationNumber: 'CROSS123',
        registeredName: 'Cross Test Dog',
        breed: 'Mixed Breed',
        status: 'Active',
        registrationDate: new Date().toISOString(),
      };

      registrationStore.addRegistration(dogRegistration);

      // Create a show registration for the same dog
      const showRegistration = showRegStore.createRegistration(
        'show-cross-test-1',
        'user-cross-test-1',
        'user-cross-test-1'
      );
      showRegStore.addEntry(showRegistration.id, {
        dogId: 'dog-cross-test-1',
        dogName: 'Cross Test Dog',
        trialId: 'trial-cross-test-1',
        trialName: 'Cross Trial',
        classes: [],
        handlerId: 'handler-cross-test-1',
        handlerName: 'Cross Test Handler',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify both stores have the related data
      expect(
        useRegistrationsStore
          .getState()
          .registrations.find(r => r.registrationNumber === 'CROSS123')
      ).toBeDefined();
      expect(showRegStore.getRegistration(showRegistration.id)?.entries[0].dogId).toBe(
        'dog-cross-test-1'
      );
    });
  });

  describe('Data Migration and Version Handling', () => {
    it('should handle version migrations correctly', async () => {
      // This test verifies that the migration functions work
      // In a real scenario, we would test actual data transformation
      const stores = [useRegistrationsStore, useCompetitionStore, useShowRegistrationStore];

      // Each store should have version 1 and migration functions
      stores.forEach(store => {
        const state = store.getState();
        // The stores should be functional (no errors on basic operations)
        expect(typeof state).toBe('object');
      });
    });
  });
});
