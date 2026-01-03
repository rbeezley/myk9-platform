// Integration Test Configuration
// Shared configuration and utilities for all integration tests

import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Global test configuration
export const testConfig = {
  queryClient: {
    defaultOptions: {
      queries: { 
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  },
  timeouts: {
    default: 5000,
    database: 10000,
    integration: 15000,
  },
  mockData: {
    maxItems: 100,
    defaultPageSize: 20,
  },
};

// Common mock factories
export const createMockUser = (overrides = {}) => ({
  id: `user-${Date.now()}-${Math.random()}`,
  first_name: 'Test',
  last_name: 'User',
  email: 'test@example.com',
  phone: '555-0123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

export const createMockDog = (overrides = {}) => ({
  id: `dog-${Date.now()}-${Math.random()}`,
  name: 'Test Dog',
  breed: 'Test Breed',
  sex: 'male',
  date_of_birth: '2020-01-01',
  owner_id: 'user-1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  owner: { first_name: 'Test', last_name: 'Owner' },
  ...overrides,
});

export const createMockShow = (overrides = {}) => ({
  id: `show-${Date.now()}-${Math.random()}`,
  name: 'Test Show',
  type: 'Conformation',
  start_date: '2025-12-01',
  end_date: '2025-12-01',
  location: 'Test Location',
  status: 'Scheduled',
  club_id: 'club-1',
  events: [],
  source: 'myK9Show',
  entry_open_date: '2025-11-01',
  entry_close_date: '2025-11-25',
  pre_entry_fee: '30',
  club_name: 'Test Club',
  club_address: 'Test Address',
  club_email: 'test@club.org',
  chairman: 'Test Chairman',
  secretary: 'Test Secretary',
  chief_steward: 'Test Steward',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  club: { name: 'Test Club', contact_email: 'test@club.org' },
  assigned_judges: [],
  trials: [],
  ...overrides,
});

export const createMockClub = (overrides = {}) => ({
  id: `club-${Date.now()}-${Math.random()}`,
  name: 'Test Club',
  contact_email: 'test@club.org',
  phone: '555-0456',
  website: 'https://testclub.org',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zip_code: '12345',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

export const createMockClass = (overrides = {}) => ({
  id: `class-${Date.now()}-${Math.random()}`,
  name: 'Test Class',
  level: 'Novice',
  trial_id: 'trial-1',
  entry_fee: 25,
  max_entries: 40,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  trial: { name: 'Test Trial', date: '2025-12-01', trial_number: 'T-001' },
  entry: [],
  ...overrides,
});

// Common mock implementations
export const createMockQueries = () => ({
  // Dog queries
  getAllDogs: vi.fn().mockResolvedValue({
    data: [createMockDog()],
    error: null
  }),
  getDogById: vi.fn((id: string) => 
    Promise.resolve({
      data: createMockDog({ id }),
      error: null
    })
  ),
  createDog: vi.fn((data: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockDog(data),
      error: null
    })
  ),
  updateDog: vi.fn((id: string, updates: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockDog({ id, ...updates }),
      error: null
    })
  ),
  deleteDog: vi.fn((id: string) => 
    Promise.resolve({
      data: { id },
      error: null
    })
  ),

  // User queries
  getAllUsers: vi.fn().mockResolvedValue({
    data: [createMockUser()],
    error: null
  }),
  getUserById: vi.fn((id: string) => 
    Promise.resolve({
      data: createMockUser({ id }),
      error: null
    })
  ),
  createUser: vi.fn((data: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockUser(data),
      error: null
    })
  ),
  updateUser: vi.fn((id: string, updates: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockUser({ id, ...updates }),
      error: null
    })
  ),
  deleteUser: vi.fn((id: string) => 
    Promise.resolve({
      data: { id },
      error: null
    })
  ),

  // Show queries
  getAllShows: vi.fn().mockResolvedValue({
    data: [createMockShow()],
    error: null
  }),
  getShowById: vi.fn((id: string) => 
    Promise.resolve({
      data: createMockShow({ id }),
      error: null
    })
  ),
  createShow: vi.fn((data: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockShow(data),
      error: null
    })
  ),
  updateShow: vi.fn((id: string, updates: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockShow({ id, ...updates }),
      error: null
    })
  ),
  deleteShow: vi.fn((id: string) => 
    Promise.resolve({
      data: { id },
      error: null
    })
  ),

  // Club queries
  getAllClubs: vi.fn().mockResolvedValue({
    data: [createMockClub()],
    error: null
  }),
  getClubById: vi.fn((id: string) => 
    Promise.resolve({
      data: createMockClub({ id }),
      error: null
    })
  ),
  createClub: vi.fn((data: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockClub(data),
      error: null
    })
  ),
  updateClub: vi.fn((id: string, updates: Record<string, unknown>) => 
    Promise.resolve({
      data: createMockClub({ id, ...updates }),
      error: null
    })
  ),
  deleteClub: vi.fn((id: string) => 
    Promise.resolve({
      data: { id },
      error: null
    })
  ),

  // Class queries
  getAllClasses: vi.fn().mockResolvedValue({
    data: [createMockClass()],
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
});

// Common mock mappers
export const createMockMappers = () => ({
  // Dog mappers
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
  mapDatabaseDogsArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    breed: item.breed,
    sex: item.sex,
    birthDate: item.date_of_birth,
    ownerId: item.owner_id,
    ownerName: item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : undefined,
  }))),

  // User mappers
  mapUserInputToInsert: vi.fn((input) => input),
  mapUserInputToUpdate: vi.fn((input) => input),
  mapDatabaseToUser: vi.fn((data) => ({
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
  })),
  mapDatabaseUsersArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    firstName: item.first_name,
    lastName: item.last_name,
    email: item.email,
    phone: item.phone,
  }))),

  // Show mappers
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
  mapDatabaseShowsArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
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

  // Club mappers
  mapClubInputToInsert: vi.fn((input) => input),
  mapClubInputToUpdate: vi.fn((input) => input),
  mapDatabaseToClub: vi.fn((data) => ({
    id: data.id,
    name: data.name,
    contactEmail: data.contact_email,
    phone: data.phone,
    website: data.website,
  })),
  mapDatabaseClubsArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    contactEmail: item.contact_email,
    phone: item.phone,
    website: item.website,
  }))),

  // Class mappers
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
  mapDatabaseClassesArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    className: item.name,
    level: item.level,
    trialId: item.trial_id,
    trial: item.trial?.name,
    entryFee: item.entry_fee,
    maxEntries: item.max_entries,
  }))),
  mapDatabaseEntriesArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    classId: item.class_id,
    armband: item.armband_number,
    handler: item.handler_name,
    status: item.status,
    score: item.score?.toString(),
    time: item.time,
    placement: item.placement?.toString(),
  }))),
});

// Common utilities
export const createTestWrapper = () => {
  const queryClient = new QueryClient(testConfig.queryClient);
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(
      React.StrictMode,
      {},
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    );
};

export const setupIntegrationTest = () => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  
  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  
  // Reset any global state
  // const stores = [
  //   '@/store/dogStore',
  //   '@/store/userStore', 
  //   '@/store/showStore',
  //   '@/store/clubStore',
  //   '@/store/templateStore',
  //   '@/store/classTemplateStore',
  // ];
  
  // Note: In a real implementation, you might want to reset store states here
  
  return {
    mockQueries: createMockQueries(),
    mockMappers: createMockMappers(),
    wrapper: createTestWrapper(),
  };
};

export const waitForAsyncUpdates = () => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

export const expectStoreState = (store: Record<string, unknown>, expectedState: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(expectedState)) {
    expect(store[key]).toEqual(value);
  }
};

export const expectSyncMetadata = (entity: Record<string, unknown>) => {
  expect(entity).toHaveProperty('_version');
  expect(entity).toHaveProperty('_lastModified');
  expect(entity).toHaveProperty('_lastModifiedBy');
  expect(entity).toHaveProperty('_syncStatus');
  expect(entity._version).toBeGreaterThan(0);
  expect(entity._lastModified).toBeInstanceOf(Date);
  expect(['pending', 'synced', 'error', 'conflict']).toContain(entity._syncStatus);
};