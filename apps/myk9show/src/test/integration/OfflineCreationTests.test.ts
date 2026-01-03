import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dogStore } from '@/store/dogStore';
import { userStore } from '@/store/userStore';
import { clubStore } from '@/store/clubStore';
import { showStore } from '@/store/showStore';

// Mock network detection
const mockNetworkStatus = { online: false };
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: false
});

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(),
  databases: vi.fn()
};

Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB
});

describe('Offline Creation Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    
    // Reset all stores
    dogStore.getState().clearDogs();
    userStore.getState().clearPeople();
    clubStore.getState().clearClubs();
    showStore.getState().clearShows();
    
    // Simulate offline state
    mockNetworkStatus.online = false;
    Object.defineProperty(navigator, 'onLine', { value: false });
  });

  afterEach(() => {
    // Reset to online state
    mockNetworkStatus.online = true;
    Object.defineProperty(navigator, 'onLine', { value: true });
  });

  describe('Offline Dog Creation', () => {
    it('should create dog with optimistic ID when offline', async () => {
      const dogData = {
        name: 'Rex',
        breed: 'Golden Retriever',
        sex: 'male' as const,
        dateOfBirth: '2022-01-15',
        ownerId: 'temp-owner-123',
        ownerName: 'John Doe'
      };

      const result = await dogStore.getState().addDog(dogData);

      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^temp-/); // Should have temp ID
      expect(result.data?._syncStatus).toBe('pending');
      
      const dogs = dogStore.getState().dogs;
      expect(dogs).toHaveLength(1);
      expect(dogs[0].name).toBe('Rex');
      expect(dogs[0]._syncStatus).toBe('pending');
    });

    it('should maintain dog data integrity offline', async () => {
      const dogData = {
        name: 'Bella',
        breed: 'Labrador',
        sex: 'female' as const,
        dateOfBirth: '2021-06-10',
        microchipNumber: '123456789012345',
        registrations: [
          {
            organization: 'AKC',
            number: 'NP12345678',
            status: 'active' as const
          }
        ],
        healthRecords: {
          vaccinations: [
            {
              vaccine: 'Rabies',
              dateGiven: '2023-01-15',
              veterinarian: 'Dr. Smith',
              expirationDate: '2024-01-15'
            }
          ],
          medications: [],
          allergies: ['Chicken']
        }
      };

      const result = await dogStore.getState().addDog(dogData);

      expect(result.success).toBe(true);
      expect(result.data?.microchipNumber).toBe('123456789012345');
      expect(result.data?.registrations).toHaveLength(1);
      expect(result.data?.healthRecords.vaccinations).toHaveLength(1);
      expect(result.data?.healthRecords.allergies).toEqual(['Chicken']);
    });

    it('should queue sync action for offline dog creation', async () => {
      const dogData = {
        name: 'Max',
        breed: 'German Shepherd',
        sex: 'male' as const,
        ownerId: 'temp-owner-456'
      };

      await dogStore.getState().addDog(dogData);

      // Should save to localStorage for sync queue
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      
      // Check that sync metadata is properly set
      const dogs = dogStore.getState().dogs;
      expect(dogs[0]._lastModified).toBeInstanceOf(Date);
      expect(dogs[0]._version).toBe(1);
      expect(dogs[0]._syncStatus).toBe('pending');
    });

    it('should handle concurrent offline dog creations', async () => {
      const dogPromises = Array.from({ length: 5 }, (_, i) => 
        dogStore.getState().addDog({
          name: `Dog ${i}`,
          breed: 'Mixed',
          sex: 'male' as const,
          ownerId: `temp-owner-${i}`
        })
      );

      const results = await Promise.all(dogPromises);

      expect(results).toHaveLength(5);
      results.forEach(result => expect(result.success).toBe(true));
      
      const dogs = dogStore.getState().dogs;
      expect(dogs).toHaveLength(5);
      
      // All should have unique temp IDs
      const ids = dogs.map(dog => dog.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('Offline User Creation', () => {
    it('should create person with optimistic ID when offline', async () => {
      const personData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '555-1234',
        address: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zipCode: '12345'
      };

      const result = await userStore.getState().addUser(personData);

      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^temp-/);
      expect(result.data?._syncStatus).toBe('pending');
      
      const people = userStore.getState().people;
      expect(people).toHaveLength(1);
      expect(people[0].firstName).toBe('Jane');
    });

    it('should maintain person relationships offline', async () => {
      const personData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        associatedDogs: ['temp-dog-123', 'temp-dog-456'],
        memberClubs: ['temp-club-789']
      };

      const result = await userStore.getState().addUser(personData);

      expect(result.success).toBe(true);
      expect(result.data?.associatedDogs).toEqual(['temp-dog-123', 'temp-dog-456']);
      expect(result.data?.memberClubs).toEqual(['temp-club-789']);
    });

    it('should handle duplicate email detection offline', async () => {
      const personData1 = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'duplicate@example.com'
      };

      const personData2 = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'duplicate@example.com'
      };

      await userStore.getState().addUser(personData1);
      const result2 = await userStore.getState().addUser(personData2);

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('email already exists');
      
      const people = userStore.getState().people;
      expect(people).toHaveLength(1); // Only first person added
    });
  });

  describe('Offline Club Creation', () => {
    it('should create club with optimistic ID when offline', async () => {
      const clubData = {
        name: 'Golden State Dog Club',
        contactEmail: 'info@gsdc.org',
        website: 'https://gsdc.org',
        address: '456 Club Ave',
        city: 'Sacramento',
        state: 'CA',
        zipCode: '95814'
      };

      const result = await clubStore.getState().addClub(clubData);

      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^temp-/);
      expect(result.data?._syncStatus).toBe('pending');
      
      const clubs = clubStore.getState().clubs;
      expect(clubs).toHaveLength(1);
      expect(clubs[0].name).toBe('Golden State Dog Club');
    });

    it('should maintain club structure offline', async () => {
      const clubData = {
        name: 'Test Club',
        members: ['temp-person-123', 'temp-person-456'],
        administrators: ['temp-person-123'],
        shows: ['temp-show-789']
      };

      const result = await clubStore.getState().addClub(clubData);

      expect(result.success).toBe(true);
      expect(result.data?.members).toEqual(['temp-person-123', 'temp-person-456']);
      expect(result.data?.administrators).toEqual(['temp-person-123']);
      expect(result.data?.shows).toEqual(['temp-show-789']);
    });
  });

  describe('Offline Show Creation', () => {
    it('should create show with optimistic ID when offline', async () => {
      const showData = {
        name: 'Annual Dog Show',
        date: '2024-06-15',
        location: 'Convention Center',
        hostClubId: 'temp-club-123',
        showType: 'All Breed' as const,
        entryDeadline: '2024-06-01'
      };

      const result = await showStore.getState().addShow(showData);

      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^temp-/);
      expect(result.data?._syncStatus).toBe('pending');
      
      const shows = showStore.getState().shows;
      expect(shows).toHaveLength(1);
      expect(shows[0].name).toBe('Annual Dog Show');
    });

    it('should maintain show trials and classes offline', async () => {
      const showData = {
        name: 'Test Show',
        date: '2024-07-01',
        trials: [
          {
            id: 'temp-trial-1',
            name: 'Conformation',
            startTime: '09:00',
            endTime: '17:00',
            judges: ['temp-judge-1'],
            classes: [
              {
                id: 'temp-class-1',
                name: 'Open Dogs',
                breed: 'All Breeds',
                ageGroup: 'Adult',
                gender: 'Male',
                maxEntries: 50
              }
            ]
          }
        ]
      };

      const result = await showStore.getState().addShow(showData);

      expect(result.success).toBe(true);
      expect(result.data?.trials).toHaveLength(1);
      expect(result.data?.trials[0].classes).toHaveLength(1);
      expect(result.data?.trials[0].classes[0].name).toBe('Open Dogs');
    });
  });

  describe('Cross-Entity Relationships Offline', () => {
    it('should maintain referential integrity offline', async () => {
      // Create person first
      const personResult = await userStore.getState().addUser({
        firstName: 'Owner',
        lastName: 'User',
        email: 'owner@example.com'
      });

      expect(personResult.success).toBe(true);
      const ownerId = personResult.data!.id;

      // Create dog with owner reference
      const dogResult = await dogStore.getState().addDog({
        name: 'Pet Dog',
        breed: 'Mixed',
        sex: 'female' as const,
        ownerId: ownerId,
        ownerName: 'Owner User'
      });

      expect(dogResult.success).toBe(true);
      expect(dogResult.data?.ownerId).toBe(ownerId);

      // Verify relationships are maintained
      const dogs = dogStore.getState().dogs;
      const people = userStore.getState().people;
      
      expect(dogs[0].ownerId).toBe(people[0].id);
      expect(dogs[0].ownerName).toBe('Owner User');
    });

    it('should handle orphaned references gracefully', async () => {
      // Create dog with non-existent owner ID
      const dogResult = await dogStore.getState().addDog({
        name: 'Orphan Dog',
        breed: 'Mixed',
        sex: 'male' as const,
        ownerId: 'non-existent-owner',
        ownerName: 'Unknown Owner'
      });

      expect(dogResult.success).toBe(true);
      expect(dogResult.data?.ownerId).toBe('non-existent-owner');
      
      // Should still create the dog with warning/flag for later resolution
      const dogs = dogStore.getState().dogs;
      expect(dogs).toHaveLength(1);
    });
  });

  describe('Storage Persistence Offline', () => {
    it('should persist all created entities to localStorage', async () => {
      await dogStore.getState().addDog({
        name: 'Test Dog',
        breed: 'Test',
        sex: 'male' as const
      });

      await userStore.getState().addUser({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      });

      await clubStore.getState().addClub({
        name: 'Test Club'
      });

      await showStore.getState().addShow({
        name: 'Test Show',
        date: '2024-06-01'
      });

      // Should have multiple localStorage calls for persistence
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(4);
    });

    it('should handle storage quota exceeded gracefully', async () => {
      // Mock localStorage.setItem to throw quota exceeded error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      const result = await dogStore.getState().addDog({
        name: 'Large Dog',
        breed: 'Test',
        sex: 'male' as const
      });

      // Should still succeed but warn about storage
      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^temp-/);
    });
  });

  describe('Sync Metadata Tracking', () => {
    it('should set proper sync metadata for all entities', async () => {
      const entities = [
        () => dogStore.getState().addDog({ name: 'Dog', breed: 'Test', sex: 'male' as const }),
        () => userStore.getState().addUser({ firstName: 'User', lastName: 'Test', email: 'test@example.com' }),
        () => clubStore.getState().addClub({ name: 'Club' }),
        () => showStore.getState().addShow({ name: 'Show', date: '2024-06-01' })
      ];

      for (const createEntity of entities) {
        const result = await createEntity();
        expect(result.success).toBe(true);
        
        const entity = result.data!;
        expect(entity._version).toBe(1);
        expect(entity._lastModified).toBeInstanceOf(Date);
        expect(entity._syncStatus).toBe('pending');
        expect(entity._localOnly).toBe(false);
      }
    });

    it('should increment version on updates', async () => {
      const dogResult = await dogStore.getState().addDog({
        name: 'Original Name',
        breed: 'Test',
        sex: 'male' as const
      });

      const dogId = dogResult.data!.id;
      
      const updateResult = await dogStore.getState().updateDog(dogId, {
        name: 'Updated Name'
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?._version).toBe(2);
      expect(updateResult.data?._syncStatus).toBe('pending');
    });
  });

  describe('Error Handling Offline', () => {
    it('should handle validation errors gracefully', async () => {
      const invalidDogData = {
        name: '', // Empty name should fail validation
        breed: 'Test',
        sex: 'invalid' as 'male' | 'female'
      };

      const result = await dogStore.getState().addDog(invalidDogData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      const dogs = dogStore.getState().dogs;
      expect(dogs).toHaveLength(0); // No dog should be created
    });

    it('should recover from transient errors', async () => {
      // Mock a transient error on first attempt
      let attemptCount = 0;
      const originalSetItem = mockLocalStorage.setItem;
      
      mockLocalStorage.setItem.mockImplementation((...args) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Transient error');
        }
        return originalSetItem(...args);
      });

      const result = await dogStore.getState().addDog({
        name: 'Resilient Dog',
        breed: 'Test',
        sex: 'male' as const
      });

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(2); // Should have retried
    });
  });
});