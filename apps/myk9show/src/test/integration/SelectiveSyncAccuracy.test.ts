import { describe, it, expect, beforeEach } from 'vitest';

// Mock user profiles and roles
interface MockUser {
  id: string;
  role: 'NEW_USER' | 'EXHIBITOR' | 'JUDGE' | 'SECRETARY';
  preferences: {
    location: { state: string; radius: number };
    breeds: string[];
    showTypes: string[];
  };
}

// Mock sync scopes from the plan
const SYNC_SCOPES = {
  NEW_USER: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'none', limit: 0 },
    shows: { scope: 'upcoming-nearby', limit: 10 },
    entries: { scope: 'none', limit: 0 }
  },
  EXHIBITOR: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'own', limit: 50 },
    shows: { scope: 'upcoming-entered', limit: 20 },
    entries: { scope: 'own-active', limit: 100 }
  },
  JUDGE: {
    people: { scope: 'own', limit: 1 },
    dogs: { scope: 'by-assignment', limit: 500 },
    shows: { scope: 'assigned', limit: 10 },
    entries: { scope: 'assigned-classes', limit: 1000 }
  },
  SECRETARY: {
    people: { scope: 'show-participants', limit: 2000 },
    dogs: { scope: 'show-entered', limit: 2000 },
    shows: { scope: 'managing', limit: 5 },
    entries: { scope: 'show-all', limit: 5000 }
  }
};

// Mock data generators
const generateMockPeople = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `person-${i}`,
    firstName: `User${i}`,
    lastName: 'Test',
    email: `person${i}@example.com`,
    city: i % 2 === 0 ? 'LocalCity' : 'FarCity',
    state: i % 3 === 0 ? 'CA' : i % 3 === 1 ? 'NY' : 'TX',
    role: i % 10 === 0 ? 'judge' : 'exhibitor',
    _lastModified: new Date(Date.now() - i * 1000),
    _syncStatus: 'synced' as const
  }));
};

const generateMockDogs = (count: number, ownerIds: string[]) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `dog-${i}`,
    name: `Dog${i}`,
    breed: i % 3 === 0 ? 'Golden Retriever' : i % 3 === 1 ? 'Labrador' : 'German Shepherd',
    sex: i % 2 === 0 ? 'male' as const : 'female' as const,
    ownerId: ownerIds[i % ownerIds.length],
    dateOfBirth: `202${i % 4}-01-01`,
    isActive: i % 10 !== 0, // 90% active
    _lastModified: new Date(Date.now() - i * 1000),
    _syncStatus: 'synced' as const
  }));
};

const generateMockShows = (count: number, judgeIds: string[], secretaryIds: string[]) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `show-${i}`,
    name: `Test Show ${i}`,
    date: new Date(Date.now() + (i * 7 * 24 * 60 * 60 * 1000)).toISOString(), // Future shows
    location: {
      city: i % 2 === 0 ? 'LocalCity' : 'FarCity',
      state: i % 3 === 0 ? 'CA' : i % 3 === 1 ? 'NY' : 'TX'
    },
    showType: i % 2 === 0 ? 'All Breed' : 'Specialty',
    status: i % 5 === 0 ? 'draft' : 'open',
    secretaryId: secretaryIds[i % secretaryIds.length],
    judges: [judgeIds[i % judgeIds.length]],
    entryDeadline: new Date(Date.now() + ((i * 7 - 14) * 24 * 60 * 60 * 1000)).toISOString(),
    _lastModified: new Date(Date.now() - i * 1000),
    _syncStatus: 'synced' as const
  }));
};

const generateMockEntries = (count: number, dogIds: string[], showIds: string[]) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    dogId: dogIds[i % dogIds.length],
    showId: showIds[i % showIds.length],
    classId: `class-${i % 10}`,
    status: i % 5 === 0 ? 'pending' : 'confirmed',
    entryDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    isActive: i % 20 !== 0, // 95% active
    _lastModified: new Date(Date.now() - i * 1000),
    _syncStatus: 'synced' as const
  }));
};

// Mock selective sync service
class MockSelectiveSyncService {
  private allPeople: Array<Record<string, unknown>> = [];
  private allDogs: Array<Record<string, unknown>> = [];
  private allShows: Array<Record<string, unknown>> = [];
  private allEntries: Array<Record<string, unknown>> = [];

  constructor() {
    // Generate comprehensive test dataset
    this.allPeople = generateMockPeople(1000);
    this.allDogs = generateMockDogs(2000, this.allPeople.map(p => p.id));
    this.allShows = generateMockShows(100, 
      this.allPeople.filter(p => p.role === 'judge').map(p => p.id),
      this.allPeople.filter(p => p.role === 'secretary').map(p => p.id)
    );
    this.allEntries = generateMockEntries(5000, 
      this.allDogs.map(d => d.id), 
      this.allShows.map(s => s.id)
    );
  }

  async syncForUser(user: MockUser) {
    const scope = SYNC_SCOPES[user.role];
    const syncedData = {
      people: await this.syncPeople(user, scope.people),
      dogs: await this.syncDogs(user, scope.dogs),
      shows: await this.syncShows(user, scope.shows),
      entries: await this.syncEntries(user, scope.entries)
    };

    return {
      ...syncedData,
      totalSize: this.calculateSyncSize(syncedData),
      syncTime: Math.random() * 1000 + 500 // Simulate sync time
    };
  }

  private async syncPeople(user: MockUser, scope: { scope: string; limit: number }) {
    let filtered: Array<Record<string, unknown>> = [];

    switch (scope.scope) {
      case 'own':
        filtered = this.allPeople.filter(p => p.id === user.id);
        break;
      case 'show-participants': {
        // Users who have entered shows the secretary manages
        const managedShows = this.allShows.filter(s => s.secretaryId === user.id);
        const managedShowIds = managedShows.map(s => s.id);
        const entriesInManagedShows = this.allEntries.filter(e => managedShowIds.includes(e.showId));
        const dogIdsInManagedShows = entriesInManagedShows.map(e => e.dogId);
        const dogsInManagedShows = this.allDogs.filter(d => dogIdsInManagedShows.includes(d.id));
        const ownerIds = dogsInManagedShows.map(d => d.ownerId);
        filtered = this.allPeople.filter(p => ownerIds.includes(p.id));
        break;
      }
      case 'search-cache':
        // Recently searched people
        filtered = this.allPeople.slice(0, 50);
        break;
      case 'none':
      default:
        filtered = [];
        break;
    }

    return filtered.slice(0, scope.limit);
  }

  private async syncDogs(user: MockUser, scope: { scope: string; limit: number }) {
    let filtered: Array<Record<string, unknown>> = [];

    switch (scope.scope) {
      case 'own':
        filtered = this.allDogs.filter(d => d.ownerId === user.id);
        break;
      case 'by-assignment': {
        // Dogs in classes assigned to this judge
        const assignedShows = this.allShows.filter(s => s.judges.includes(user.id));
        const assignedShowIds = assignedShows.map(s => s.id);
        const entriesInAssignedShows = this.allEntries.filter(e => assignedShowIds.includes(e.showId));
        const dogIdsInAssignedShows = entriesInAssignedShows.map(e => e.dogId);
        filtered = this.allDogs.filter(d => dogIdsInAssignedShows.includes(d.id));
        break;
      }
      case 'show-entered': {
        // Dogs entered in shows managed by secretary
        const managedShows = this.allShows.filter(s => s.secretaryId === user.id);
        const managedShowIds = managedShows.map(s => s.id);
        const entriesInManagedShows = this.allEntries.filter(e => managedShowIds.includes(e.showId));
        const dogIdsInManagedShows = entriesInManagedShows.map(e => e.dogId);
        filtered = this.allDogs.filter(d => dogIdsInManagedShows.includes(d.id));
        break;
      }
      case 'search-cache':
        // Recently searched dogs
        filtered = this.allDogs.filter(d => 
          user.preferences.breeds.length === 0 || 
          user.preferences.breeds.includes(d.breed)
        ).slice(0, 100);
        break;
      case 'none':
      default:
        filtered = [];
        break;
    }

    return filtered.slice(0, scope.limit);
  }

  private async syncShows(user: MockUser, scope: { scope: string; limit: number }) {
    let filtered: Array<Record<string, unknown>> = [];
    const userLocation = user.preferences.location;

    switch (scope.scope) {
      case 'upcoming-nearby':
        filtered = this.allShows.filter(s => {
          const showDate = new Date(s.date);
          const isUpcoming = showDate > new Date();
          const isNearby = s.location.state === userLocation.state;
          return isUpcoming && isNearby;
        });
        break;
      case 'upcoming-entered': {
        // Shows user has entered dogs in
        const userDogs = this.allDogs.filter(d => d.ownerId === user.id);
        const userDogIds = userDogs.map(d => d.id);
        const userEntries = this.allEntries.filter(e => userDogIds.includes(e.dogId));
        const enteredShowIds = userEntries.map(e => e.showId);
        filtered = this.allShows.filter(s => {
          const isUpcoming = new Date(s.date) > new Date();
          const isEntered = enteredShowIds.includes(s.id);
          return isUpcoming && isEntered;
        });
        break;
      }
      case 'assigned':
        filtered = this.allShows.filter(s => s.judges.includes(user.id));
        break;
      case 'managing':
        filtered = this.allShows.filter(s => s.secretaryId === user.id);
        break;
      case 'none':
      default:
        filtered = [];
        break;
    }

    return filtered.slice(0, scope.limit);
  }

  private async syncEntries(user: MockUser, scope: { scope: string; limit: number }) {
    let filtered: Array<Record<string, unknown>> = [];

    switch (scope.scope) {
      case 'own-active': {
        const userDogs = this.allDogs.filter(d => d.ownerId === user.id);
        const userDogIds = userDogs.map(d => d.id);
        filtered = this.allEntries.filter(e => 
          userDogIds.includes(e.dogId) && e.isActive
        );
        break;
      }
      case 'assigned-classes': {
        const assignedShows = this.allShows.filter(s => s.judges.includes(user.id));
        const assignedShowIds = assignedShows.map(s => s.id);
        filtered = this.allEntries.filter(e => assignedShowIds.includes(e.showId));
        break;
      }
      case 'show-all': {
        const managedShows = this.allShows.filter(s => s.secretaryId === user.id);
        const managedShowIds = managedShows.map(s => s.id);
        filtered = this.allEntries.filter(e => managedShowIds.includes(e.showId));
        break;
      }
      case 'none':
      default:
        filtered = [];
        break;
    }

    return filtered.slice(0, scope.limit);
  }

  private calculateSyncSize(data: unknown) {
    return JSON.stringify(data).length;
  }

  // Helper methods for testing
  getTotalCounts() {
    return {
      people: this.allPeople.length,
      dogs: this.allDogs.length,
      shows: this.allShows.length,
      entries: this.allEntries.length
    };
  }

  getPeopleByRole(role: string) {
    return this.allPeople.filter(p => p.role === role);
  }

  getShowsByState(state: string) {
    return this.allShows.filter(s => s.location.state === state);
  }
}

describe('Selective Sync Accuracy Tests', () => {
  let syncService: MockSelectiveSyncService;

  beforeEach(() => {
    syncService = new MockSelectiveSyncService();
  });

  describe('Role-Based Sync Accuracy', () => {
    it('should sync only own data for NEW_USER', async () => {
      const newUser: MockUser = {
        id: 'person-1',
        role: 'NEW_USER',
        preferences: {
          location: { state: 'CA', radius: 50 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(newUser);

      // New user should only get their own person record
      expect(syncResult.people).toHaveLength(1);
      expect(syncResult.people[0].id).toBe(newUser.id);

      // No dogs for new user
      expect(syncResult.dogs).toHaveLength(0);

      // Limited nearby shows
      expect(syncResult.shows.length).toBeLessThanOrEqual(10);
      expect(syncResult.shows.length).toBeGreaterThan(0);

      // Verify shows are in correct state
      syncResult.shows.forEach(show => {
        expect(show.location.state).toBe('CA');
        expect(new Date(show.date)).toBeInstanceOf(Date);
        expect(new Date(show.date)).toBeAfter(new Date());
      });

      // No entries for new user
      expect(syncResult.entries).toHaveLength(0);

      // Total sync size should be small
      expect(syncResult.totalSize).toBeLessThan(100 * 1024); // Less than 100KB
    });

    it('should sync exhibitor data accurately', async () => {
      const exhibitorUser: MockUser = {
        id: 'person-5',
        role: 'EXHIBITOR',
        preferences: {
          location: { state: 'NY', radius: 100 },
          breeds: ['Golden Retriever', 'Labrador'],
          showTypes: ['All Breed']
        }
      };

      const syncResult = await syncService.syncForUser(exhibitorUser);

      // Should get own person record
      expect(syncResult.people).toHaveLength(1);
      expect(syncResult.people[0].id).toBe(exhibitorUser.id);

      // Should get own dogs (up to limit)
      expect(syncResult.dogs.length).toBeLessThanOrEqual(50);
      syncResult.dogs.forEach(dog => {
        expect(dog.ownerId).toBe(exhibitorUser.id);
      });

      // Should get shows they've entered
      expect(syncResult.shows.length).toBeLessThanOrEqual(20);
      
      // Should get own active entries
      expect(syncResult.entries.length).toBeLessThanOrEqual(100);
      if (syncResult.entries.length > 0) {
        const userDogIds = syncResult.dogs.map(d => d.id);
        syncResult.entries.forEach(entry => {
          expect(userDogIds).toContain(entry.dogId);
          expect(entry.isActive).toBe(true);
        });
      }
    });

    it('should sync judge data accurately', async () => {
      const judgeId = syncService.getPeopleByRole('judge')[0]?.id;
      expect(judgeId).toBeDefined();

      const judgeUser: MockUser = {
        id: judgeId,
        role: 'JUDGE',
        preferences: {
          location: { state: 'TX', radius: 200 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(judgeUser);

      // Should get own person record
      expect(syncResult.people).toHaveLength(1);
      expect(syncResult.people[0].id).toBe(judgeUser.id);

      // Should get dogs in assigned classes (up to limit)
      expect(syncResult.dogs.length).toBeLessThanOrEqual(500);

      // Should get shows they're judging
      expect(syncResult.shows.length).toBeLessThanOrEqual(10);
      syncResult.shows.forEach(show => {
        expect(show.judges).toContain(judgeUser.id);
      });

      // Should get entries for assigned shows
      expect(syncResult.entries.length).toBeLessThanOrEqual(1000);
      if (syncResult.entries.length > 0) {
        const assignedShowIds = syncResult.shows.map(s => s.id);
        syncResult.entries.forEach(entry => {
          expect(assignedShowIds).toContain(entry.showId);
        });
      }
    });

    it('should sync secretary data accurately', async () => {
      const secretaryId = syncService.getPeopleByRole('secretary')[0]?.id || 'person-10';
      
      const secretaryUser: MockUser = {
        id: secretaryId,
        role: 'SECRETARY',
        preferences: {
          location: { state: 'CA', radius: 300 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(secretaryUser);

      // Should get show participants (up to limit)
      expect(syncResult.people.length).toBeLessThanOrEqual(2000);

      // Should get dogs entered in managed shows (up to limit)
      expect(syncResult.dogs.length).toBeLessThanOrEqual(2000);

      // Should get shows they're managing
      expect(syncResult.shows.length).toBeLessThanOrEqual(5);
      syncResult.shows.forEach(show => {
        expect(show.secretaryId).toBe(secretaryUser.id);
      });

      // Should get all entries for managed shows
      expect(syncResult.entries.length).toBeLessThanOrEqual(5000);
      if (syncResult.entries.length > 0) {
        const managedShowIds = syncResult.shows.map(s => s.id);
        syncResult.entries.forEach(entry => {
          expect(managedShowIds).toContain(entry.showId);
        });
      }
    });
  });

  describe('Geographic Filtering Accuracy', () => {
    it('should filter shows by geographic proximity', async () => {
      const user: MockUser = {
        id: 'person-1',
        role: 'NEW_USER',
        preferences: {
          location: { state: 'CA', radius: 50 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      // All shows should be in California
      syncResult.shows.forEach(show => {
        expect(show.location.state).toBe('CA');
      });

      // Verify there are shows in other states that were filtered out
      const allCAShows = syncService.getShowsByState('CA');
      const allNYShows = syncService.getShowsByState('NY');
      
      expect(allCAShows.length).toBeGreaterThan(0);
      expect(allNYShows.length).toBeGreaterThan(0);
      expect(syncResult.shows.length).toBeLessThanOrEqual(allCAShows.length);
    });

    it('should respect different state preferences', async () => {
      const users = [
        { id: 'person-1', state: 'CA' },
        { id: 'person-2', state: 'NY' },
        { id: 'person-3', state: 'TX' }
      ];

      for (const userData of users) {
        const user: MockUser = {
          id: userData.id,
          role: 'NEW_USER',
          preferences: {
            location: { state: userData.state, radius: 50 },
            breeds: [],
            showTypes: []
          }
        };

        const syncResult = await syncService.syncForUser(user);

        syncResult.shows.forEach(show => {
          expect(show.location.state).toBe(userData.state);
        });
      }
    });
  });

  describe('Time-Based Filtering Accuracy', () => {
    it('should only sync upcoming shows for new users', async () => {
      const user: MockUser = {
        id: 'person-1',
        role: 'NEW_USER',
        preferences: {
          location: { state: 'CA', radius: 50 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      const now = new Date();
      syncResult.shows.forEach(show => {
        const showDate = new Date(show.date);
        expect(showDate).toBeAfter(now);
      });
    });

    it('should filter active entries correctly', async () => {
      const user: MockUser = {
        id: 'person-5',
        role: 'EXHIBITOR',
        preferences: {
          location: { state: 'NY', radius: 100 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      syncResult.entries.forEach(entry => {
        expect(entry.isActive).toBe(true);
      });
    });
  });

  describe('Relationship Integrity', () => {
    it('should maintain referential integrity across entities', async () => {
      const user: MockUser = {
        id: 'person-5',
        role: 'EXHIBITOR',
        preferences: {
          location: { state: 'NY', radius: 100 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      // All dogs should belong to synced people
      const syncedPersonIds = syncResult.people.map(p => p.id);
      syncResult.dogs.forEach(dog => {
        expect(syncedPersonIds).toContain(dog.ownerId);
      });

      // All entries should reference synced dogs and shows
      const syncedDogIds = syncResult.dogs.map(d => d.id);
      const syncedShowIds = syncResult.shows.map(s => s.id);
      
      syncResult.entries.forEach(entry => {
        expect(syncedDogIds).toContain(entry.dogId);
        expect(syncedShowIds).toContain(entry.showId);
      });
    });

    it('should maintain judge assignments across shows and entries', async () => {
      const judgeId = syncService.getPeopleByRole('judge')[0]?.id;
      if (!judgeId) return;

      const user: MockUser = {
        id: judgeId,
        role: 'JUDGE',
        preferences: {
          location: { state: 'TX', radius: 200 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      // All shows should have this judge assigned
      syncResult.shows.forEach(show => {
        expect(show.judges).toContain(user.id);
      });

      // All entries should be for shows this judge is assigned to
      const assignedShowIds = syncResult.shows.map(s => s.id);
      syncResult.entries.forEach(entry => {
        expect(assignedShowIds).toContain(entry.showId);
      });
    });
  });

  describe('Sync Size Limits', () => {
    it('should respect entity count limits per role', async () => {
      const testCases = [
        { role: 'NEW_USER' as const, userId: 'person-1' },
        { role: 'EXHIBITOR' as const, userId: 'person-5' },
        { role: 'JUDGE' as const, userId: syncService.getPeopleByRole('judge')[0]?.id || 'person-10' },
        { role: 'SECRETARY' as const, userId: 'person-15' }
      ];

      for (const testCase of testCases) {
        const user: MockUser = {
          id: testCase.userId,
          role: testCase.role,
          preferences: {
            location: { state: 'CA', radius: 100 },
            breeds: [],
            showTypes: []
          }
        };

        const syncResult = await syncService.syncForUser(user);
        const limits = SYNC_SCOPES[testCase.role];

        expect(syncResult.people.length).toBeLessThanOrEqual(limits.people.limit);
        expect(syncResult.dogs.length).toBeLessThanOrEqual(limits.dogs.limit);
        expect(syncResult.shows.length).toBeLessThanOrEqual(limits.shows.limit);
        expect(syncResult.entries.length).toBeLessThanOrEqual(limits.entries.limit);
      }
    });

    it('should maintain reasonable sync sizes for each role', async () => {
      const expectedMaxSizes = {
        NEW_USER: 50 * 1024,      // 50KB
        EXHIBITOR: 500 * 1024,    // 500KB
        JUDGE: 2 * 1024 * 1024,   // 2MB
        SECRETARY: 10 * 1024 * 1024 // 10MB
      };

      for (const [role, maxSize] of Object.entries(expectedMaxSizes)) {
        const user: MockUser = {
          id: 'person-1',
          role: role as MockUser['role'],
          preferences: {
            location: { state: 'CA', radius: 100 },
            breeds: [],
            showTypes: []
          }
        };

        const syncResult = await syncService.syncForUser(user);
        expect(syncResult.totalSize).toBeLessThan(maxSize);
      }
    });
  });

  describe('Sync Accuracy Metrics', () => {
    it('should provide accurate sync statistics', async () => {
      const totalCounts = syncService.getTotalCounts();
      
      // Verify test data is comprehensive
      expect(totalCounts.people).toBeGreaterThan(100);
      expect(totalCounts.dogs).toBeGreaterThan(500);
      expect(totalCounts.shows).toBeGreaterThan(20);
      expect(totalCounts.entries).toBeGreaterThan(1000);

      // Test sync accuracy for each role
      const roles: ('NEW_USER' | 'EXHIBITOR' | 'JUDGE' | 'SECRETARY')[] = 
        ['NEW_USER', 'EXHIBITOR', 'JUDGE', 'SECRETARY'];

      for (const role of roles) {
        const user: MockUser = {
          id: 'person-1',
          role,
          preferences: {
            location: { state: 'CA', radius: 100 },
            breeds: [],
            showTypes: []
          }
        };

        const syncResult = await syncService.syncForUser(user);

        // Calculate sync selectivity (what percentage of total data was synced)
        const selectivity = {
          people: syncResult.people.length / totalCounts.people,
          dogs: syncResult.dogs.length / totalCounts.dogs,
          shows: syncResult.shows.length / totalCounts.shows,
          entries: syncResult.entries.length / totalCounts.entries
        };

        // Verify selectivity makes sense for role
        switch (role) {
          case 'NEW_USER':
            expect(selectivity.people).toBeLessThan(0.01); // Less than 1%
            expect(selectivity.dogs).toBe(0); // No dogs
            expect(selectivity.shows).toBeLessThan(0.2); // Less than 20%
            expect(selectivity.entries).toBe(0); // No entries
            break;
          case 'SECRETARY':
            // Secretary should get more data
            expect(selectivity.people).toBeGreaterThan(selectivity.dogs);
            expect(selectivity.entries).toBeGreaterThan(0.1);
            break;
        }
      }
    });

    it('should measure sync performance consistency', async () => {
      const user: MockUser = {
        id: 'person-5',
        role: 'EXHIBITOR',
        preferences: {
          location: { state: 'CA', radius: 100 },
          breeds: ['Golden Retriever'],
          showTypes: ['All Breed']
        }
      };

      const syncTimes: number[] = [];
      const syncSizes: number[] = [];

      // Perform multiple syncs to test consistency
      for (let i = 0; i < 10; i++) {
        const syncResult = await syncService.syncForUser(user);
        syncTimes.push(syncResult.syncTime);
        syncSizes.push(syncResult.totalSize);
      }

      // Sync times should be consistent (within reasonable variance)
      const avgSyncTime = syncTimes.reduce((a, b) => a + b) / syncTimes.length;
      const maxVariance = avgSyncTime * 0.5; // 50% variance allowed

      syncTimes.forEach(time => {
        expect(Math.abs(time - avgSyncTime)).toBeLessThan(maxVariance);
      });

      // Sync sizes should be identical (deterministic)
      const firstSize = syncSizes[0];
      syncSizes.forEach(size => {
        expect(size).toBe(firstSize);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle users with no associated data', async () => {
      const user: MockUser = {
        id: 'non-existent-user',
        role: 'EXHIBITOR',
        preferences: {
          location: { state: 'CA', radius: 100 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      // Should return empty results gracefully
      expect(syncResult.people).toHaveLength(0);
      expect(syncResult.dogs).toHaveLength(0);
      expect(syncResult.entries).toHaveLength(0);
      expect(syncResult.totalSize).toBeGreaterThan(0); // Should at least have structure
    });

    it('should handle invalid geographic preferences', async () => {
      const user: MockUser = {
        id: 'person-1',
        role: 'NEW_USER',
        preferences: {
          location: { state: 'INVALID', radius: 100 },
          breeds: [],
          showTypes: []
        }
      };

      const syncResult = await syncService.syncForUser(user);

      // Should handle gracefully - no shows in invalid state
      expect(syncResult.shows).toHaveLength(0);
      expect(syncResult.people).toHaveLength(1); // Should still get own record
    });
  });
});