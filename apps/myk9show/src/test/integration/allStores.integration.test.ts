// Comprehensive Zustand Store Integration Tests
// Tests all stores in src/store/ directory for database integration, persistence, and state management

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Store hooks and compatibility layers
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTemplateStore } from '@/store/templateStore';
import { useClassTemplateStore } from '@/store/classTemplateStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUserStoreCompat } from '@/hooks/useUserStoreCompat';
// import { useShowStoreCompat } from '@/hooks/useShowStoreCompat'; // Unused in this test
// import { useClubStoreCompat } from '@/hooks/useClubStoreCompat'; // Unused in this test
// import { useClassStoreCompat } from '@/hooks/useClassStoreCompat'; // Unused in this test

// Types
// import type { Dog } from '@/types/dog-types'; // Unused in this test
import type { User } from '@/types/user-types';
// import type { Show } from '@/types/show-types'; // Unused in this test
// import type { Club } from '@/types/club-types'; // Unused in this test
import type { Template } from '@/types/template.types';
import type { ClassTemplate } from '@/types/class-template-types';
import type { DogInput } from '@/store/dogStore';
import type { UserInput } from '@/store/userStore';

// Test database object interfaces
interface DatabaseDogRecord {
  id: string;
  name: string;
  breed: string;
  sex: string;
  date_of_birth: string;
  owner_id: string;
  owner?: {
    first_name: string;
    last_name: string;
  };
}

interface DatabaseUserRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
}

interface DatabaseShowRecord {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
}

interface DatabaseClubRecord {
  id: string;
  name: string;
  description?: string;
  website?: string;
}

interface DatabaseClassRecord {
  id: string;
  name: string;
  description?: string;
}

interface DatabaseEntryRecord {
  id: string;
  dog_id: string;
  class_id: string;
  status: string;
}
import type { ShowInput } from '@/store/showStore';

// Mock database queries for all entities
vi.mock('@/services/database/queries/dogQueries', () => ({
  getAllDogs: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'dog-1',
        name: 'Max',
        breed: 'Golden Retriever',
        sex: 'male',
        date_of_birth: '2020-01-15',
        owner_id: 'user-1',
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z',
        owner: { first_name: 'John', last_name: 'Smith' }
      }
    ],
    error: null
  }),
  getDogById: vi.fn(),
  getDogsByOwner: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: vi.fn(),
  searchDogs: vi.fn(),
  getDogStatistics: vi.fn().mockResolvedValue({
    data: { total: 1, by_breed: { 'Golden Retriever': 1 } },
    error: null
  })
}));

vi.mock('@/services/database/queries/userQueries', () => ({
  getAllUsers: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'user-1',
        first_name: 'John',
        last_name: 'Smith',
        email: 'john@example.com',
        phone: '555-0123',
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z'
      }
    ],
    error: null
  }),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  searchUsers: vi.fn(),
  getUserStatistics: vi.fn().mockResolvedValue({
    data: { total: 1 },
    error: null
  })
}));

vi.mock('@/services/database/queries/showQueries', () => ({
  getAllShows: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'show-1',
        name: 'Spring Classic',
        type: 'Conformation',
        start_date: '2025-03-15',
        end_date: '2025-03-15',
        location: 'Park Convention Center',
        status: 'Scheduled',
        club_id: 'club-1',
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z',
        club: { name: 'Metro Dog Club' }
      }
    ],
    error: null
  }),
  getShowById: vi.fn(),
  getShowsByClub: vi.fn(),
  createShow: vi.fn(),
  updateShow: vi.fn(),
  deleteShow: vi.fn(),
  getShowStatistics: vi.fn().mockResolvedValue({
    data: { total: 1, upcoming: 1, past: 0 },
    error: null
  })
}));

vi.mock('@/services/database/queries/clubQueries', () => ({
  getAllClubs: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'club-1',
        name: 'Metro Dog Club',
        contact_email: 'info@metrodogclub.org',
        phone: '555-0456',
        website: 'https://metrodogclub.org',
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z'
      }
    ],
    error: null
  }),
  getClubById: vi.fn(),
  createClub: vi.fn(),
  updateClub: vi.fn(),
  deleteClub: vi.fn(),
  getClubStatistics: vi.fn().mockResolvedValue({
    data: { total: 1 },
    error: null
  })
}));

vi.mock('@/services/database/queries/classQueries', () => ({
  getAllClasses: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'class-1',
        name: 'Novice A',
        level: 'Novice',
        trial_id: 'trial-1',
        entry_fee: 25,
        max_entries: 40,
        created_at: '2025-01-26T00:00:00Z',
        updated_at: '2025-01-26T00:00:00Z',
        trial: { name: 'Spring Trial', date: '2025-03-15' },
        entry: []
      }
    ],
    error: null
  }),
  getAllEntries: vi.fn().mockResolvedValue({
    data: [],
    error: null
  }),
  getClassStatistics: vi.fn().mockResolvedValue({
    data: { total: 1 },
    error: null
  }),
  createClass: vi.fn(),
  updateClass: vi.fn(),
  deleteClass: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn()
}));

// Mock auth helpers
vi.mock('@/utils/authHelpers', () => ({
  getLastModifiedBy: vi.fn().mockReturnValue('test-user'),
}));

// Mock ID generation
vi.mock('@/utils/idUtils', () => ({
  generateId: vi.fn(() => `test-id-${Date.now()}-${Math.random()}`),
}));

// Mock sync service
vi.mock('@/services/sync/syncService', () => ({
  syncService: {
    addToQueue: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock storage adapter
vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })),
}));

// Mock mappers
vi.mock('@/services/mappers/dogMappers', () => ({
  mapDogInputToInsert: vi.fn((input) => input),
  mapDogInputToUpdate: vi.fn((input) => input),
  mapDatabaseToDog: vi.fn((data) => ({
    id: data.id,
    name: data.name,
    breed: data.breed,
    sex: data.sex,
    birthDate: data.date_of_birth,
    ownerId: data.owner_id,
    ownerName: data.owner ? `${data.owner.first_name} ${data.owner.last_name}` : undefined,
  })),
  mapDatabaseDogsArray: vi.fn((data) => data.map((item: DatabaseDogRecord) => ({
    id: item.id,
    name: item.name,
    breed: item.breed,
    sex: item.sex,
    birthDate: item.date_of_birth,
    ownerId: item.owner_id,
    ownerName: item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : undefined,
  }))),
}));

vi.mock('@/services/mappers/userMappers', () => ({
  mapUserInputToInsert: vi.fn((input) => input),
  mapUserInputToUpdate: vi.fn((input) => input),
  mapDatabaseToUser: vi.fn((data) => ({
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
  })),
  mapDatabaseUsersArray: vi.fn((data) => data.map((item: DatabaseUserRecord) => ({
    id: item.id,
    firstName: item.first_name,
    lastName: item.last_name,
    email: item.email,
    phone: item.phone,
  }))),
}));

vi.mock('@/services/mappers/showMappers', () => ({
  mapShowInputToInsert: vi.fn((input) => input),
  mapShowInputToUpdate: vi.fn((input) => input),
  mapDatabaseToShow: vi.fn((data) => ({
    id: data.id,
    name: data.name,
    type: data.type,
    startDate: data.start_date,
    endDate: data.end_date,
    location: data.location,
    status: data.status,
    clubId: data.club_id,
    clubName: data.club?.name,
  })),
  mapDatabaseShowsArray: vi.fn((data) => data.map((item: DatabaseShowRecord) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    startDate: item.start_date,
    endDate: item.end_date,
    location: item.location,
    status: item.status,
    clubId: item.club_id,
    clubName: item.club?.name,
  }))),
}));

vi.mock('@/services/mappers/clubMappers', () => ({
  mapClubInputToInsert: vi.fn((input) => input),
  mapClubInputToUpdate: vi.fn((input) => input),
  mapDatabaseToClub: vi.fn((data) => ({
    id: data.id,
    name: data.name,
    contactEmail: data.contact_email,
    phone: data.phone,
    website: data.website,
  })),
  mapDatabaseClubsArray: vi.fn((data) => data.map((item: DatabaseClubRecord) => ({
    id: item.id,
    name: item.name,
    contactEmail: item.contact_email,
    phone: item.phone,
    website: item.website,
  }))),
}));

vi.mock('@/services/mappers/classMappers', () => ({
  mapClassInputToInsert: vi.fn((input) => input),
  mapClassInputToUpdate: vi.fn((input) => input),
  mapEntryInputToInsert: vi.fn((input) => input),
  mapEntryInputToUpdate: vi.fn((input) => input),
  mapDatabaseToClass: vi.fn((data) => ({
    id: data.id,
    className: data.name,
    level: data.level,
    trialId: data.trial_id,
    trial: data.trial?.name,
    entryFee: data.entry_fee,
    maxEntries: data.max_entries,
  })),
  mapDatabaseToEntry: vi.fn((data) => ({
    id: data.id,
    classId: data.class_id,
    armband: data.armband_number,
    handler: data.handler_name,
    status: data.status,
    score: data.score?.toString(),
    time: data.time,
    placement: data.placement?.toString(),
  })),
  mapDatabaseClassesArray: vi.fn((data) => data.map((item: DatabaseClassRecord) => ({
    id: item.id,
    className: item.name,
    level: item.level,
    trialId: item.trial_id,
    trial: item.trial?.name,
    entryFee: item.entry_fee,
    maxEntries: item.max_entries,
  }))),
  mapDatabaseEntriesArray: vi.fn((data) => data.map((item: DatabaseEntryRecord) => ({
    id: item.id,
    classId: item.class_id,
    armband: item.armband_number,
    handler: item.handler_name,
    status: item.status,
    score: item.score?.toString(),
    time: item.time,
    placement: item.placement?.toString(),
  }))),
}));

// Create wrapper component for React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { 
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('Zustand Stores Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Dog Store Integration', () => {
    it('should integrate with database layer through useDogStoreCompat', async () => {
      const wrapper = createWrapper();
      
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify data loaded correctly
      expect(result.current.dogs).toHaveLength(1);
      expect(result.current.dogs[0]).toMatchObject({
        id: 'dog-1',
        name: 'Max',
        breed: 'Golden Retriever',
        sex: 'male',
        ownerId: 'user-1',
      });

      // Test database integration flags
      expect(result.current._usingDatabase).toBe(true);
      expect(result.current._reactQueryIntegrated).toBe(true);
    });

    it('should handle dog store persistence correctly', async () => {
      const { result } = renderHook(() => useDogStore());

      // Test UI state persistence
      act(() => {
        result.current.selectDog('dog-123');
      });

      expect(result.current.selectedDogId).toBe('dog-123');

      // Test migration flags
      expect(result.current._migratedToReactQuery).toBe(true);
      expect(result.current._useReactQuery).toBe(true);
    });

    it('should warn about deprecated methods in dog store', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() => useDogStore());

      // Test deprecated methods show warnings
      await expect(result.current.addDog({} as DogInput)).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dogStore.addDog is deprecated')
      );

      consoleSpy.mockRestore();
    });

    it('should provide lookup functions through compatibility layer', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test getDogById
      const dog = result.current.getDogById('dog-1');
      expect(dog).toBeTruthy();
      expect(dog?.name).toBe('Max');

      // Test getDogsByOwner
      const ownerDogs = result.current.getDogsByOwner('user-1');
      expect(ownerDogs).toHaveLength(1);
      expect(ownerDogs[0].name).toBe('Max');

      // Test sync status
      const syncStatus = result.current.getSyncStatus();
      expect(syncStatus).toBe('synced');
    });
  });

  describe('User Store Integration', () => {
    it('should handle user operations with sync metadata', async () => {
      const { result } = renderHook(() => useUserStore());

      const userData: UserInput = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '555-0789',
      };

      await act(async () => {
        const newUser = await result.current.addUser(userData);
        expect(newUser).toMatchObject({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          _syncStatus: 'pending',
          _version: 1,
        });
      });

      // Verify user was added to store
      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].firstName).toBe('Jane');
    });

    it('should handle user updates with version increments', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user first
      await act(async () => {
        await result.current.addUser({
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        });
      });

      const userId = result.current.users[0].id;

      // Update the user
      await act(async () => {
        const updatedUser = await result.current.updateUser(userId, {
          firstName: 'Jonathan',
        });
        
        expect(updatedUser).toMatchObject({
          firstName: 'Jonathan',
          lastName: 'Smith',
          _version: 2,
        });
      });

      // Verify update in store
      const user = result.current.getUserById(userId);
      expect(user?.firstName).toBe('Jonathan');
      expect(user?._version).toBe(2);
    });

    it('should handle user deletion optimistically', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user first
      await act(async () => {
        await result.current.addUser({
          firstName: 'Delete',
          lastName: 'Me',
          email: 'delete@example.com',
        });
      });

      const userId = result.current.users[0].id;
      expect(result.current.users).toHaveLength(1);

      // Delete the user
      await act(async () => {
        await result.current.deleteUser(userId);
      });

      // Verify user was removed
      expect(result.current.users).toHaveLength(0);
      expect(result.current.getUserById(userId)).toBeNull();
    });

    it('should provide backward compatibility for people methods', async () => {
      const { result } = renderHook(() => useUserStore());

      // Test people property alias
      expect(result.current.people).toBe(result.current.users);

      // Test legacy method aliases
      const user: User = {
        id: 'legacy-user',
        firstName: 'Legacy',
        lastName: 'User',
        email: 'legacy@example.com',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'test-user',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      act(() => {
        result.current.addPersonLegacy(user);
      });

      expect(result.current.people).toHaveLength(1);
      expect(result.current.getPersonById('legacy-user')).toBeTruthy();
    });
  });

  describe('Show Store Integration', () => {
    it('should handle show creation with club relationship updates', async () => {
      const { result: showResult } = renderHook(() => useShowStore());
      const { result: clubResult } = renderHook(() => useClubStore());

      // Add a club first
      await act(async () => {
        await clubResult.current.addClub({
          name: 'Test Club',
          contactEmail: 'test@club.org',
          phone: '555-0123',
          website: 'https://testclub.org',
        });
      });

      const clubId = clubResult.current.clubs[0].id;

      const showData: ShowInput = {
        name: 'Test Show',
        type: 'Conformation',
        startDate: '2025-04-01',
        endDate: '2025-04-01',
        location: 'Test Venue',
        status: 'Scheduled',
        events: ['Group 1', 'Group 2'],
        source: 'myK9Show' as const,
        entryOpenDate: '2025-03-01',
        entryCloseDate: '2025-03-25',
        preEntryFee: '30',
        clubId,
        clubName: 'Test Club',
        clubAddress: '123 Test St',
        clubEmail: 'test@club.org',
        chairman: 'John Chairman',
        secretary: 'Jane Secretary',
        chiefSteward: 'Bob Steward',
      };

      await act(async () => {
        const newShow = await showResult.current.addShow(showData);
        expect(newShow).toMatchObject({
          name: 'Test Show',
          type: 'Conformation',
          clubId,
          _syncStatus: 'pending',
        });
      });

      expect(showResult.current.shows).toHaveLength(1);
    });

    it('should handle show deletion with cascading options', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show first
      await act(async () => {
        await result.current.addShow({
          name: 'Delete Me Show',
          type: 'Agility',
          startDate: '2025-05-01',
          endDate: '2025-05-01',
          location: 'Delete Venue',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-04-01',
          entryCloseDate: '2025-04-25',
          preEntryFee: '25',
          clubId: 'club-123',
          clubName: 'Delete Club',
          clubAddress: '456 Delete St',
          clubEmail: 'delete@club.org',
          chairman: 'Delete Chairman',
          secretary: 'Delete Secretary',
          chiefSteward: 'Delete Steward',
        });
      });

      const showId = result.current.shows[0].id;
      expect(result.current.shows).toHaveLength(1);

      // Test regular delete
      await act(async () => {
        await result.current.deleteShow(showId);
      });

      expect(result.current.shows).toHaveLength(0);
    });

    it('should provide show lookup functions', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show
      await act(async () => {
        await result.current.addShow({
          name: 'Lookup Show',
          type: 'Rally',
          startDate: '2025-06-01',
          endDate: '2025-06-01',
          location: 'Lookup Venue',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-05-01',
          entryCloseDate: '2025-05-25',
          preEntryFee: '20',
          clubId: 'lookup-club',
          clubName: 'Lookup Club',
          clubAddress: '789 Lookup St',
          clubEmail: 'lookup@club.org',
          chairman: 'Lookup Chairman',
          secretary: 'Lookup Secretary',
          chiefSteward: 'Lookup Steward',
        });
      });

      const showId = result.current.shows[0].id;

      // Test getShowById
      const show = result.current.getShowById(showId);
      expect(show).toBeTruthy();
      expect(show?.name).toBe('Lookup Show');

      // Test getShowsByClub
      const clubShows = result.current.getShowsByClub('lookup-club');
      expect(clubShows).toHaveLength(1);
      expect(clubShows[0].name).toBe('Lookup Show');
    });
  });

  describe('Club Store Integration', () => {
    it('should handle club operations with proper state management', async () => {
      const { result } = renderHook(() => useClubStore());

      const clubData = {
        name: 'Integration Test Club',
        contactEmail: 'integration@testclub.org',
        phone: '555-9999',
        website: 'https://integrationclub.org',
        address: '123 Integration Ave',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        officers: {
          president: 'Test President',
          secretary: 'Test Secretary',
          treasurer: 'Test Treasurer',
        },
      };

      await act(async () => {
        const newClub = await result.current.addClub(clubData);
        expect(newClub).toMatchObject({
          name: 'Integration Test Club',
          contactEmail: 'integration@testclub.org',
          _syncStatus: 'pending',
        });
      });

      expect(result.current.clubs).toHaveLength(1);
      expect(result.current.clubs[0].name).toBe('Integration Test Club');
    });

    it('should track upcoming and past shows correctly', async () => {
      const { result } = renderHook(() => useClubStore());

      // Add a club
      await act(async () => {
        await result.current.addClub({
          name: 'Shows Club',
          contactEmail: 'shows@club.org',
          phone: '555-7777',
          website: 'https://showsclub.org',
        });
      });

      const club = result.current.clubs[0];
      expect(club.upcomingShows).toEqual([]);
      expect(club.pastShows).toEqual([]);

      // Test that show creation updates club shows (this would be tested via show store)
      const updatedClubData = {
        ...club,
        upcomingShows: [
          {
            id: 'show-1',
            name: 'Test Show',
            date: '2025-07-01',
            location: 'Test Location',
            description: 'Test show description',
          },
        ],
      };

      await act(async () => {
        await result.current.updateClub(club.id, updatedClubData);
      });

      const updatedClub = result.current.getClubById(club.id);
      expect(updatedClub?.upcomingShows).toHaveLength(1);
      expect(updatedClub?.upcomingShows[0].name).toBe('Test Show');
    });
  });

  describe('Template Store Integration', () => {
    it('should handle template operations and persistence', async () => {
      const { result } = renderHook(() => useTemplateStore());

      const templateData: Partial<Template> = {
        name: 'Test Template',
        description: 'A test template for integration testing',
        organization: 'AKC',
        category: 'Conformation',
        isPublic: true,
        tags: ['test', 'integration'],
      };

      act(() => {
        result.current.addTemplate(templateData as Template);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].name).toBe('Test Template');
    });

    it('should handle template search and filtering', async () => {
      const { result } = renderHook(() => useTemplateStore());

      // Add multiple templates
      const templates = [
        { name: 'AKC Conformation', organization: 'AKC', category: 'Conformation' },
        { name: 'UKC Agility', organization: 'UKC', category: 'Agility' },
        { name: 'AKC Rally', organization: 'AKC', category: 'Rally' },
      ];

      act(() => {
        templates.forEach(template => {
          result.current.addTemplate(template as Template);
        });
      });

      // Test filtering
      act(() => {
        result.current.setFilters({ organization: 'AKC' });
      });

      expect(result.current.filteredTemplates).toHaveLength(2);
      expect(result.current.filteredTemplates.every(t => t.organization === 'AKC')).toBe(true);
    });
  });

  describe('Class Template Store Integration', () => {
    it('should handle class template operations', async () => {
      const { result } = renderHook(() => useClassTemplateStore());

      const classTemplateData: Partial<ClassTemplate> = {
        name: 'Novice A Template',
        description: 'Template for Novice A classes',
        level: 'Novice',
        organization: 'AKC',
        fields: [
          {
            id: 'field-1',
            name: 'Entry Fee',
            type: 'number',
            defaultValue: 25,
            required: true,
          },
        ],
        rules: [
          {
            id: 'rule-1',
            type: 'validation',
            field: 'Entry Fee',
            condition: 'greaterThan',
            value: 0,
            message: 'Entry fee must be greater than 0',
          },
        ],
      };

      act(() => {
        result.current.addTemplate(classTemplateData as ClassTemplate);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].name).toBe('Novice A Template');
    });

    it('should handle template validation and preview', async () => {
      const { result } = renderHook(() => useClassTemplateStore());

      // Add a template
      const template: ClassTemplate = {
        id: 'template-1',
        name: 'Validation Template',
        description: 'Template for validation testing',
        level: 'Open',
        organization: 'AKC',
        fields: [
          {
            id: 'field-1',
            name: 'Max Entries',
            type: 'number',
            defaultValue: 40,
            required: true,
          },
        ],
        rules: [
          {
            id: 'rule-1',
            type: 'validation',
            field: 'Max Entries',
            condition: 'between',
            value: [1, 100],
            message: 'Max entries must be between 1 and 100',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        isPublic: true,
        tags: ['test'],
        stats: { usageCount: 0, lastUsed: null },
      };

      act(() => {
        result.current.addTemplate(template);
      });

      // Test template selection and preview
      act(() => {
        result.current.setSelectedTemplate(template.id);
      });

      expect(result.current.selectedTemplate).toBeTruthy();
      expect(result.current.selectedTemplate?.id).toBe('template-1');

      // Test validation
      const validationResult = result.current.validateTemplate(template);
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
    });
  });

  describe('Cross-Store Integration', () => {
    it('should handle relationships between stores correctly', async () => {
      const wrapper = createWrapper();
      const { result: dogResult } = renderHook(() => useDogStoreCompat(), { wrapper });
      const { result: userResult } = renderHook(() => useUserStoreCompat(), { wrapper });

      // Wait for initial loads
      await waitFor(() => {
        expect(dogResult.current.isLoading).toBe(false);
        expect(userResult.current.isLoading).toBe(false);
      });

      // Verify relationship data is loaded
      expect(dogResult.current.dogs).toHaveLength(1);
      expect(userResult.current.users).toHaveLength(1);

      const dog = dogResult.current.dogs[0];
      const user = userResult.current.users[0];

      // Verify dog-owner relationship
      expect(dog.ownerId).toBe(user.id);
      expect(dog.ownerName).toBe(`${user.firstName} ${user.lastName}`);
    });

    it('should handle store resets and cleanup correctly', async () => {
      const { result: userResult } = renderHook(() => useUserStore());
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { result: showResult } = renderHook(() => useShowStore());

      // Add data to stores
      await act(async () => {
        await userResult.current.addUser({
          firstName: 'Reset',
          lastName: 'Test',
          email: 'reset@test.com',
        });
      });

      expect(userResult.current.users).toHaveLength(1);

      // Test store reset
      act(() => {
        userResult.current.reset?.();
      });

      expect(userResult.current.users).toHaveLength(0);
      expect(userResult.current.selectedUser).toBeNull();
      expect(userResult.current.error).toBeNull();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database errors gracefully', async () => {
      const wrapper = createWrapper();
      
      // Mock a database error
      const mockError = new Error('Database connection failed');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      vi.mocked(require('@/services/database/queries/dogQueries').getAllDogs)
        .mockRejectedValueOnce({ error: mockError });

      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.dogs).toHaveLength(0);
    });

    it('should handle optimistic update rollbacks', async () => {
      const { result } = renderHook(() => useUserStore());

      // Mock a failed create operation
      const mockError = new Error('Create failed');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      vi.spyOn(require('@/services/sync/syncService').syncService, 'addToQueue')
        .mockRejectedValueOnce(mockError);

      const userData: UserInput = {
        firstName: 'Fail',
        lastName: 'Test',
        email: 'fail@test.com',
      };

      await act(async () => {
        try {
          await result.current.addUser(userData);
        } catch {
          // Expected to fail
        }
      });

      // Despite sync failure, optimistic update should still work
      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].firstName).toBe('Fail');
    });
  });

  describe('Performance and Caching', () => {
    it('should handle caching correctly in compatibility layers', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Test that data is cached and doesn't refetch unnecessarily
      const initialDogs = result.current.dogs;
      
      // Re-render should use cached data
      const { result: result2 } = renderHook(() => useDogStoreCompat(), { wrapper });
      
      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      expect(result2.current.dogs).toEqual(initialDogs);
    });

    it('should provide proper loading and stale states', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDogStoreCompat(), { wrapper });

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isFetching).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // After load, should have proper states
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.dogs).toHaveLength(1);

      // Test refetch functionality
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.dogs).toHaveLength(1);
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should persist UI state correctly in dog store', async () => {
      const { result } = renderHook(() => useDogStore());

      // Set UI state
      act(() => {
        result.current.selectDog('persistent-dog-id');
      });

      expect(result.current.selectedDogId).toBe('persistent-dog-id');

      // Simulate page reload by creating new instance
      const { result: result2 } = renderHook(() => useDogStore());

      // UI state should be persisted
      expect(result2.current.selectedDogId).toBe('persistent-dog-id');
    });

    it('should handle localStorage migration correctly', async () => {
      // Simulate old localStorage data
      const oldData = {
        dogs: [{ id: 'old-1', name: 'Old Dog' }],
        selectedDogId: 'old-1',
      };
      
      localStorage.setItem('myk9show-dogs-ui-storage', JSON.stringify({
        state: oldData,
        version: 1,
      }));

      const { result } = renderHook(() => useDogStore());

      // Should migrate correctly and clear old data but keep UI state
      expect(result.current._migratedToReactQuery).toBe(true);
      expect(result.current.dogs).toEqual([]); // Data should be empty after migration
    });
  });

  describe('Sync Status and Metadata', () => {
    it('should track sync status correctly', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user
      await act(async () => {
        await result.current.addUser({
          firstName: 'Sync',
          lastName: 'Test',
          email: 'sync@test.com',
        });
      });

      const user = result.current.users[0];
      
      // Check sync metadata
      expect(user._syncStatus).toBe('pending');
      expect(user._version).toBe(1);
      expect(user._lastModified).toBeInstanceOf(Date);
      expect(user._lastModifiedBy).toBe('test-user');

      // Test sync status function
      const syncStatus = result.current.getSyncStatus(user.id);
      expect(syncStatus).toBe('pending');
    });

    it('should increment version on updates', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user
      await act(async () => {
        await result.current.addUser({
          firstName: 'Version',
          lastName: 'Test',
          email: 'version@test.com',
        });
      });

      const userId = result.current.users[0].id;
      const initialVersion = result.current.users[0]._version;

      // Update the user
      await act(async () => {
        await result.current.updateUser(userId, {
          firstName: 'Updated Version',
        });
      });

      const updatedUser = result.current.getUserById(userId);
      expect(updatedUser?._version).toBe(initialVersion + 1);
      expect(updatedUser?.firstName).toBe('Updated Version');
    });
  });
});