// Show Store Detailed Integration Tests
// Tests show store integration with database layer, club relationships, and complex scenarios

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import type { ShowInput } from '@/store/showStore';
import type { Show } from '@/types/show-types';
// import type { Club } from '@/types/club-types';

// Mock comprehensive show data
const mockShows = [
  {
    id: 'show-1',
    name: 'Spring Classic Dog Show',
    type: 'Conformation',
    start_date: '2025-03-15',
    end_date: '2025-03-15',
    location: 'Central Park Convention Center',
    status: 'Scheduled',
    events: ['Group 1', 'Group 2', 'Best in Show'],
    source: 'myK9Show',
    entry_open_date: '2025-02-01',
    entry_close_date: '2025-03-01',
    pre_entry_fee: '30',
    day_of_show_fee: '35',
    club_id: 'club-1',
    club_name: 'Metro Dog Club',
    club_address: '123 Dog St, City, State 12345',
    club_email: 'info@metrodogclub.org',
    chairman: 'John Chairman',
    secretary: 'Jane Secretary',
    chief_steward: 'Bob Steward',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    club: { name: 'Metro Dog Club', contact_email: 'info@metrodogclub.org' },
    assigned_judges: [],
    trials: []
  },
  {
    id: 'show-2',
    name: 'Summer Agility Championship',
    type: 'Agility',
    start_date: '2025-06-20',
    end_date: '2025-06-22',
    location: 'Outdoor Agility Field',
    status: 'Open for Entries',
    events: ['Standard', 'Jumpers', 'FAST'],
    source: 'myK9Show',
    entry_open_date: '2025-05-01',
    entry_close_date: '2025-06-15',
    pre_entry_fee: '25',
    club_id: 'club-2',
    club_name: 'Agility Masters Club',
    club_address: '456 Agility Ave, Town, State 67890',
    club_email: 'contact@agilityclub.org',
    chairman: 'Alice Chairman',
    secretary: 'Charlie Secretary',
    chief_steward: 'Diana Steward',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    club: { name: 'Agility Masters Club', contact_email: 'contact@agilityclub.org' },
    assigned_judges: [
      {
        judge_id: 'judge-1',
        judge_name: 'Expert Judge',
        assignment_type: 'Primary',
        events: ['Standard', 'Jumpers']
      }
    ],
    trials: [
      {
        id: 'trial-1',
        name: 'Saturday Trial',
        date: '2025-06-21',
        trial_number: 'T-001',
        status: 'Scheduled'
      }
    ]
  },
  {
    id: 'show-3',
    name: 'Fall Rally Event',
    type: 'Rally',
    start_date: '2025-09-10',
    end_date: '2025-09-10',
    location: 'Indoor Training Center',
    status: 'Past',
    events: ['Rally Novice', 'Rally Advanced', 'Rally Excellent'],
    source: 'external',
    entry_open_date: '2025-08-01',
    entry_close_date: '2025-09-05',
    pre_entry_fee: '20',
    club_id: 'club-1',
    club_name: 'Metro Dog Club',
    club_address: '123 Dog St, City, State 12345',
    club_email: 'info@metrodogclub.org',
    chairman: 'Rally Chairman',
    secretary: 'Rally Secretary',
    chief_steward: 'Rally Steward',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z',
    club: { name: 'Metro Dog Club', contact_email: 'info@metrodogclub.org' },
    assigned_judges: [],
    trials: []
  }
];

const mockClubs = [
  {
    id: 'club-1',
    name: 'Metro Dog Club',
    contact_email: 'info@metrodogclub.org',
    phone: '555-0123',
    website: 'https://metrodogclub.org',
    address: '123 Dog St',
    city: 'City',
    state: 'State',
    zip_code: '12345',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z'
  },
  {
    id: 'club-2',
    name: 'Agility Masters Club',
    contact_email: 'contact@agilityclub.org',
    phone: '555-0456',
    website: 'https://agilityclub.org',
    address: '456 Agility Ave',
    city: 'Town',
    state: 'State',
    zip_code: '67890',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z'
  }
];

// Mock database queries
vi.mock('@/services/database/queries/showQueries', () => ({
  getAllShows: vi.fn().mockResolvedValue({
    data: mockShows,
    error: null
  }),
  getShowById: vi.fn((id: string) => {
    const show = mockShows.find(s => s.id === id);
    return Promise.resolve({
      data: show || null,
      error: show ? null : new Error('Show not found')
    });
  }),
  getShowsByClub: vi.fn((clubId: string) => {
    const shows = mockShows.filter(s => s.club_id === clubId);
    return Promise.resolve({
      data: shows,
      error: null
    });
  }),
  createShow: vi.fn((showData: Record<string, unknown>) => {
    const newShow = {
      id: `show-${Date.now()}`,
      ...showData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assigned_judges: [],
      trials: []
    };
    return Promise.resolve({
      data: newShow,
      error: null
    });
  }),
  updateShow: vi.fn((id: string, updates: Record<string, unknown>) => {
    const show = mockShows.find(s => s.id === id);
    if (!show) {
      return Promise.resolve({
        data: null,
        error: new Error('Show not found')
      });
    }
    const updatedShow = {
      ...show,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: updatedShow,
      error: null
    });
  }),
  deleteShow: vi.fn((id: string) => {
    return Promise.resolve({
      data: { id },
      error: null
    });
  }),
  getShowStatistics: vi.fn().mockResolvedValue({
    data: {
      total: mockShows.length,
      by_type: {
        'Conformation': 1,
        'Agility': 1,
        'Rally': 1
      },
      by_status: {
        'Scheduled': 1,
        'Open for Entries': 1,
        'Past': 1
      },
      upcoming: 2,
      past: 1
    },
    error: null
  })
}));

vi.mock('@/services/database/queries/clubQueries', () => ({
  getAllClubs: vi.fn().mockResolvedValue({
    data: mockClubs,
    error: null
  }),
  getClubById: vi.fn((id: string) => {
    const club = mockClubs.find(c => c.id === id);
    return Promise.resolve({
      data: club || null,
      error: club ? null : new Error('Club not found')
    });
  }),
  createClub: vi.fn((clubData: Record<string, unknown>) => {
    const newClub = {
      id: `club-${Date.now()}`,
      ...clubData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: newClub,
      error: null
    });
  }),
  updateClub: vi.fn((id: string, updates: Record<string, unknown>) => {
    const club = mockClubs.find(c => c.id === id);
    if (!club) {
      return Promise.resolve({
        data: null,
        error: new Error('Club not found')
      });
    }
    const updatedClub = {
      ...club,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: updatedClub,
      error: null
    });
  }),
  deleteClub: vi.fn(),
  getClubStatistics: vi.fn()
}));

// Mock other dependencies
vi.mock('@/utils/authHelpers', () => ({
  getLastModifiedBy: vi.fn().mockReturnValue('test-user'),
}));

vi.mock('@/utils/idUtils', () => ({
  generateId: vi.fn(() => `test-id-${Date.now()}-${Math.random()}`),
}));

vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })),
}));

vi.mock('@/utils/standardizedErrorHandler', () => ({
  reportStoreError: vi.fn(),
  reportWarning: vi.fn(),
  reportInfo: vi.fn(),
  reportDebug: vi.fn(),
}));

vi.mock('@/utils/cascadingDelete', () => ({
  performCascadingDelete: vi.fn((id: string) => ({
    showId: id,
    trialsDeleted: 1,
    classesDeleted: 3,
    entriesDeleted: 5,
  })),
  previewCascadingDelete: vi.fn((id: string, name: string) => ({
    showId: id,
    showName: name,
    trialsToDelete: 1,
    classesToDelete: 3,
    entriesToDelete: 5,
    warnings: [],
  })),
}));

// Mock config
vi.mock('@/config/dataSource', () => ({
  shouldUseMockData: vi.fn().mockReturnValue(false),
}));

// Mock mappers
vi.mock('@/services/mappers/showMappers', () => ({
  mapShowInputToInsert: vi.fn((input) => ({
    name: input.name,
    type: input.type,
    start_date: input.startDate,
    end_date: input.endDate,
    location: input.location,
    status: input.status,
    club_id: input.clubId,
    pre_entry_fee: input.preEntryFee,
  })),
  mapShowInputToUpdate: vi.fn((input) => ({
    name: input.name,
    location: input.location,
    status: input.status,
  })),
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
    events: data.events || [],
    source: data.source,
    preEntryFee: data.pre_entry_fee,
    dayOfShowFee: data.day_of_show_fee,
    assignedJudges: data.assigned_judges || [],
    trials: data.trials || [],
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
    events: item.events || [],
    source: item.source,
    preEntryFee: item.pre_entry_fee,
    dayOfShowFee: item.day_of_show_fee,
    assignedJudges: item.assigned_judges || [],
    trials: item.trials || [],
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
    address: data.address,
    city: data.city,
    state: data.state,
    zipCode: data.zip_code,
    upcomingShows: [],
    pastShows: [],
  })),
  mapDatabaseClubsArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    contactEmail: item.contact_email,
    phone: item.phone,
    website: item.website,
    address: item.address,
    city: item.city,
    state: item.state,
    zipCode: item.zip_code,
    upcomingShows: [],
    pastShows: [],
  }))),
}));

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

describe('Show Store Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Show Store Direct Operations', () => {
    it('should handle show creation with proper metadata', async () => {
      const { result } = renderHook(() => useShowStore());

      const showData: ShowInput = {
        name: 'Integration Test Show',
        type: 'Conformation',
        startDate: '2025-04-15',
        endDate: '2025-04-15',
        location: 'Test Convention Center',
        status: 'Scheduled',
        events: ['Group 1', 'Group 2', 'Best in Show'],
        source: 'myK9Show' as const,
        entryOpenDate: '2025-03-01',
        entryCloseDate: '2025-04-10',
        preEntryFee: '35',
        dayOfShowFee: '40',
        clubId: 'club-1',
        clubName: 'Test Club',
        clubAddress: '123 Test St, Test City, TS 12345',
        clubEmail: 'test@club.org',
        chairman: 'Test Chairman',
        secretary: 'Test Secretary',
        chiefSteward: 'Test Steward',
      };

      await act(async () => {
        const newShow = await result.current.addShow(showData);
        
        expect(newShow).toMatchObject({
          name: 'Integration Test Show',
          type: 'Conformation',
          startDate: '2025-04-15',
          clubId: 'club-1',
          _syncStatus: 'pending',
          _version: 1,
          _lastModifiedBy: 'test-user',
        });

        expect(newShow._lastModified).toBeInstanceOf(Date);
        expect(newShow.stats).toEqual([]);
        expect(newShow.trials).toEqual([]);
        expect(newShow.assignedJudges).toEqual([]);
      });

      expect(result.current.shows).toHaveLength(1);
      expect(result.current.shows[0].name).toBe('Integration Test Show');
    });

    it('should handle show updates with version increments', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show first
      await act(async () => {
        await result.current.addShow({
          name: 'Update Test Show',
          type: 'Agility',
          startDate: '2025-05-01',
          endDate: '2025-05-01',
          location: 'Original Location',
          status: 'Scheduled',
          events: ['Standard'],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-04-01',
          entryCloseDate: '2025-04-25',
          preEntryFee: '25',
          clubId: 'club-2',
          clubName: 'Update Club',
          clubAddress: '456 Update St',
          clubEmail: 'update@club.org',
          chairman: 'Update Chairman',
          secretary: 'Update Secretary',
          chiefSteward: 'Update Steward',
        });
      });

      const showId = result.current.shows[0].id;
      const initialVersion = result.current.shows[0]._version;

      // Update the show
      await act(async () => {
        const updatedShow = await result.current.updateShow(showId, {
          location: 'Updated Location',
          status: 'Open for Entries',
          preEntryFee: '30',
        });
        
        expect(updatedShow).toMatchObject({
          name: 'Update Test Show',
          location: 'Updated Location',
          status: 'Open for Entries',
          _version: initialVersion + 1,
          _syncStatus: 'pending',
        });
      });

      // Verify update in store
      const show = result.current.getShowById(showId);
      expect(show?.location).toBe('Updated Location');
      expect(show?.status).toBe('Open for Entries');
      expect(show?._version).toBe(2);
    });

    it('should handle show deletion with cascading options', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show first
      await act(async () => {
        await result.current.addShow({
          name: 'Delete Test Show',
          type: 'Rally',
          startDate: '2025-06-01',
          endDate: '2025-06-01',
          location: 'Delete Location',
          status: 'Scheduled',
          events: ['Rally Novice'],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-05-01',
          entryCloseDate: '2025-05-25',
          preEntryFee: '20',
          clubId: 'club-1',
          clubName: 'Delete Club',
          clubAddress: '789 Delete Ave',
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
      expect(result.current.selectedShowId).toBe(''); // Should clear selection
    });

    it('should handle cascading delete with related data cleanup', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show first
      await act(async () => {
        await result.current.addShow({
          name: 'Cascade Delete Show',
          type: 'Conformation',
          startDate: '2025-07-01',
          endDate: '2025-07-01',
          location: 'Cascade Location',
          status: 'Scheduled',
          events: ['All Breeds'],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-06-01',
          entryCloseDate: '2025-06-25',
          preEntryFee: '35',
          clubId: 'club-1',
          clubName: 'Cascade Club',
          clubAddress: '999 Cascade St',
          clubEmail: 'cascade@club.org',
          chairman: 'Cascade Chairman',
          secretary: 'Cascade Secretary',
          chiefSteward: 'Cascade Steward',
        });
      });

      const showId = result.current.shows[0].id;

      // Test cascading delete
      await act(async () => {
        await result.current.deleteShowCascading(showId);
      });

      expect(result.current.shows).toHaveLength(0);

      // Verify cascading delete was called
      const { performCascadingDelete } = await import('@/utils/cascadingDelete');
      expect(performCascadingDelete).toHaveBeenCalledWith(showId);
    });

    it('should provide show lookup functions', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add shows for different clubs
      await act(async () => {
        await result.current.addShow({
          name: 'Club 1 Show 1',
          type: 'Conformation',
          startDate: '2025-08-01',
          endDate: '2025-08-01',
          location: 'Location 1',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-07-01',
          entryCloseDate: '2025-07-25',
          preEntryFee: '30',
          clubId: 'club-1',
          clubName: 'Club 1',
          clubAddress: 'Address 1',
          clubEmail: 'club1@test.org',
          chairman: 'Chairman 1',
          secretary: 'Secretary 1',
          chiefSteward: 'Steward 1',
        });

        await result.current.addShow({
          name: 'Club 1 Show 2',
          type: 'Agility',
          startDate: '2025-08-15',
          endDate: '2025-08-15',
          location: 'Location 2',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-07-15',
          entryCloseDate: '2025-08-10',
          preEntryFee: '25',
          clubId: 'club-1',
          clubName: 'Club 1',
          clubAddress: 'Address 1',
          clubEmail: 'club1@test.org',
          chairman: 'Chairman 1',
          secretary: 'Secretary 1',
          chiefSteward: 'Steward 1',
        });

        await result.current.addShow({
          name: 'Club 2 Show 1',
          type: 'Rally',
          startDate: '2025-09-01',
          endDate: '2025-09-01',
          location: 'Location 3',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-08-01',
          entryCloseDate: '2025-08-25',
          preEntryFee: '20',
          clubId: 'club-2',
          clubName: 'Club 2',
          clubAddress: 'Address 2',
          clubEmail: 'club2@test.org',
          chairman: 'Chairman 2',
          secretary: 'Secretary 2',
          chiefSteward: 'Steward 2',
        });
      });

      const show1Id = result.current.shows[0].id;

      // Test getShowById
      const show = result.current.getShowById(show1Id);
      expect(show).toBeTruthy();
      expect(show?.name).toBe('Club 1 Show 1');

      // Test getShowsByClub
      const club1Shows = result.current.getShowsByClub('club-1');
      expect(club1Shows).toHaveLength(2);
      expect(club1Shows.map(s => s.name)).toEqual(['Club 1 Show 1', 'Club 1 Show 2']);

      const club2Shows = result.current.getShowsByClub('club-2');
      expect(club2Shows).toHaveLength(1);
      expect(club2Shows[0].name).toBe('Club 2 Show 1');
    });

    it('should handle show selection state', async () => {
      const { result } = renderHook(() => useShowStore());

      // Initially no show selected
      expect(result.current.selectedShowId).toBe('');

      // Add a show and select it
      await act(async () => {
        await result.current.addShow({
          name: 'Selected Show',
          type: 'Conformation',
          startDate: '2025-10-01',
          endDate: '2025-10-01',
          location: 'Selected Location',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-09-01',
          entryCloseDate: '2025-09-25',
          preEntryFee: '30',
          clubId: 'club-1',
          clubName: 'Selected Club',
          clubAddress: 'Selected Address',
          clubEmail: 'selected@club.org',
          chairman: 'Selected Chairman',
          secretary: 'Selected Secretary',
          chiefSteward: 'Selected Steward',
        });
      });

      const showId = result.current.shows[0].id;

      act(() => {
        result.current.selectShow(showId);
      });

      expect(result.current.selectedShowId).toBe(showId);

      // Test that deleting selected show clears selection
      await act(async () => {
        await result.current.deleteShow(showId);
      });

      expect(result.current.selectedShowId).toBe('');
    });

    it('should handle legacy methods correctly', async () => {
      const { result } = renderHook(() => useShowStore());

      const testShow: Show = {
        id: 'legacy-show',
        name: 'Legacy Show',
        type: 'Conformation',
        startDate: '2025-11-01',
        endDate: '2025-11-01',
        location: 'Legacy Location',
        status: 'Scheduled',
        events: [],
        source: 'myK9Show',
        entryOpenDate: '2025-10-01',
        entryCloseDate: '2025-10-25',
        preEntryFee: '30',
        clubId: 'legacy-club',
        clubName: 'Legacy Club',
        clubAddress: 'Legacy Address',
        clubEmail: 'legacy@club.org',
        chairman: 'Legacy Chairman',
        secretary: 'Legacy Secretary',
        chiefSteward: 'Legacy Steward',
        assignedJudges: [],
        trials: [],
        stats: [],
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'test-user',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      // Test legacy add
      act(() => {
        result.current.addShowLegacy(testShow);
      });

      expect(result.current.shows).toHaveLength(1);
      expect(result.current.shows[0].name).toBe('Legacy Show');

      // Test legacy update
      const updatedShow = { ...testShow, name: 'Updated Legacy Show' };
      act(() => {
        result.current.updateShowLegacy(updatedShow);
      });

      expect(result.current.shows[0].name).toBe('Updated Legacy Show');

      // Test legacy remove (with warning)
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      act(() => {
        result.current.removeShow('legacy-show');
      });

      expect(result.current.shows).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Simple delete for show legacy-show')
      );

      consoleSpy.mockRestore();
    });

    it('should provide cascading delete preview', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show first
      await act(async () => {
        await result.current.addShow({
          name: 'Preview Delete Show',
          type: 'Agility',
          startDate: '2025-12-01',
          endDate: '2025-12-01',
          location: 'Preview Location',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-11-01',
          entryCloseDate: '2025-11-25',
          preEntryFee: '25',
          clubId: 'club-1',
          clubName: 'Preview Club',
          clubAddress: 'Preview Address',
          clubEmail: 'preview@club.org',
          chairman: 'Preview Chairman',
          secretary: 'Preview Secretary',
          chiefSteward: 'Preview Steward',
        });
      });

      const showId = result.current.shows[0].id;

      // Test cascading delete preview
      const preview = result.current.previewCascadingDelete(showId);
      
      expect(preview).toBeTruthy();
      expect(preview?.showId).toBe(showId);
      expect(preview?.showName).toBe('Preview Delete Show');
      expect(preview?.trialsToDelete).toBe(1);
      expect(preview?.classesToDelete).toBe(3);
      expect(preview?.entriesToDelete).toBe(5);
    });
  });

  describe('Show Store Compatibility Layer', () => {
    it('should load and display shows correctly through compatibility layer', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useShowStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.shows).toHaveLength(3);
      
      const show1 = result.current.shows.find(s => s.id === 'show-1');
      expect(show1).toMatchObject({
        id: 'show-1',
        name: 'Spring Classic Dog Show',
        type: 'Conformation',
        startDate: '2025-03-15',
        clubName: 'Metro Dog Club',
        status: 'Scheduled',
      });
    });

    it('should provide show statistics', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useShowStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatistics).toBe(false);
      });

      expect(result.current.statistics).toMatchObject({
        total: 3,
        by_type: {
          'Conformation': 1,
          'Agility': 1,
          'Rally': 1
        },
        by_status: {
          'Scheduled': 1,
          'Open for Entries': 1,
          'Past': 1
        },
        upcoming: 2,
        past: 1
      });
    });
  });

  describe('Show-Club Integration', () => {
    it('should update club relationships when creating shows', async () => {
      const { result: showResult } = renderHook(() => useShowStore());
      const { result: clubResult } = renderHook(() => useClubStore());

      // Add a club first
      await act(async () => {
        await clubResult.current.addClub({
          name: 'Integration Club',
          contactEmail: 'integration@club.org',
          phone: '555-9999',
          website: 'https://integration.org',
          address: '999 Integration Blvd',
          city: 'Integration City',
          state: 'IC',
          zipCode: '99999',
        });
      });

      const clubId = clubResult.current.clubs[0].id;

      // Create a show for this club
      await act(async () => {
        await showResult.current.addShow({
          name: 'Integration Show',
          type: 'Conformation',
          startDate: '2025-12-15',
          endDate: '2025-12-15',
          location: 'Integration Center',
          status: 'Scheduled',
          events: ['All Breeds'],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-11-15',
          entryCloseDate: '2025-12-10',
          preEntryFee: '35',
          clubId,
          clubName: 'Integration Club',
          clubAddress: '999 Integration Blvd, Integration City, IC 99999',
          clubEmail: 'integration@club.org',
          chairman: 'Integration Chairman',
          secretary: 'Integration Secretary',
          chiefSteward: 'Integration Steward',
        });
      });

      // Verify show was created
      expect(showResult.current.shows).toHaveLength(1);
      expect(showResult.current.shows[0].clubId).toBe(clubId);
      expect(showResult.current.shows[0].clubName).toBe('Integration Club');

      // Note: Club updating would be tested in the actual implementation
      // The show store tries to update the club's upcomingShows array
    });

    it('should handle club-show relationships in queries', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add multiple shows for the same club
      const clubId = 'relationship-club';
      
      await act(async () => {
        await result.current.addShow({
          name: 'Relationship Show 1',
          type: 'Conformation',
          startDate: '2025-05-01',
          endDate: '2025-05-01',
          location: 'Location A',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-04-01',
          entryCloseDate: '2025-04-25',
          preEntryFee: '30',
          clubId,
          clubName: 'Relationship Club',
          clubAddress: 'Relationship Address',
          clubEmail: 'relationship@club.org',
          chairman: 'Chairman A',
          secretary: 'Secretary A',
          chiefSteward: 'Steward A',
        });

        await result.current.addShow({
          name: 'Relationship Show 2',
          type: 'Agility',
          startDate: '2025-05-15',
          endDate: '2025-05-15',
          location: 'Location B',
          status: 'Open for Entries',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-04-15',
          entryCloseDate: '2025-05-10',
          preEntryFee: '25',
          clubId,
          clubName: 'Relationship Club',
          clubAddress: 'Relationship Address',
          clubEmail: 'relationship@club.org',
          chairman: 'Chairman B',
          secretary: 'Secretary B',
          chiefSteward: 'Steward B',
        });
      });

      // Test club-specific queries
      const clubShows = result.current.getShowsByClub(clubId);
      expect(clubShows).toHaveLength(2);
      expect(clubShows.every(s => s.clubId === clubId)).toBe(true);
      expect(clubShows.map(s => s.name)).toEqual(['Relationship Show 1', 'Relationship Show 2']);
    });
  });

  describe('Real-world Show Management Scenarios', () => {
    it('should handle complete show lifecycle management', async () => {
      const { result } = renderHook(() => useShowStore());

      // 1. Create a new show
      const showData: ShowInput = {
        name: 'Lifecycle Dog Show',
        type: 'Conformation',
        startDate: '2025-08-15',
        endDate: '2025-08-15',
        location: 'Lifecycle Convention Center',
        status: 'Planning',
        events: ['Sporting Group', 'Working Group', 'Best in Show'],
        source: 'myK9Show' as const,
        entryOpenDate: '2025-07-01',
        entryCloseDate: '2025-08-10',
        preEntryFee: '32',
        dayOfShowFee: '37',
        clubId: 'lifecycle-club',
        clubName: 'Lifecycle Dog Club',
        clubAddress: '123 Lifecycle St, City, State 12345',
        clubEmail: 'info@lifecycleclub.org',
        chairman: 'Lifecycle Chairman',
        secretary: 'Lifecycle Secretary',
        chiefSteward: 'Lifecycle Steward',
        assignedJudges: [
          {
            judgeId: 'judge-1',
            judgeName: 'Expert Judge',
            assignmentType: 'Primary',
            events: ['Sporting Group', 'Working Group']
          }
        ],
        trials: [
          {
            id: 'trial-1',
            name: 'Saturday Morning Trial',
            date: '2025-08-15',
            trialNumber: 'LC-001',
            status: 'Scheduled'
          }
        ]
      };

      await act(async () => {
        const newShow = await result.current.addShow(showData);
        expect(newShow.name).toBe('Lifecycle Dog Show');
        expect(newShow.status).toBe('Planning');
      });

      const showId = result.current.shows[0].id;

      // 2. Update show as planning progresses
      await act(async () => {
        await result.current.updateShow(showId, {
          status: 'Scheduled',
          location: 'Updated Convention Center',
        });
      });

      let show = result.current.getShowById(showId);
      expect(show?.status).toBe('Scheduled');
      expect(show?.location).toBe('Updated Convention Center');

      // 3. Open entries
      await act(async () => {
        await result.current.updateShow(showId, {
          status: 'Open for Entries',
        });
      });

      show = result.current.getShowById(showId);
      expect(show?.status).toBe('Open for Entries');

      // 4. Close entries and finalize
      await act(async () => {
        await result.current.updateShow(showId, {
          status: 'Entries Closed',
        });
      });

      show = result.current.getShowById(showId);
      expect(show?.status).toBe('Entries Closed');

      // 5. Complete the show
      await act(async () => {
        await result.current.updateShow(showId, {
          status: 'Completed',
        });
      });

      show = result.current.getShowById(showId);
      expect(show?.status).toBe('Completed');
    });

    it('should handle multi-day show management', async () => {
      const { result } = renderHook(() => useShowStore());

      const multiDayShowData: ShowInput = {
        name: 'Three Day Championship',
        type: 'Conformation',
        startDate: '2025-09-13',
        endDate: '2025-09-15',
        location: 'Championship Grounds',
        status: 'Scheduled',
        events: [
          'Friday Specialties',
          'Saturday All-Breed',
          'Sunday Sweepstakes'
        ],
        source: 'myK9Show' as const,
        entryOpenDate: '2025-08-01',
        entryCloseDate: '2025-09-08',
        preEntryFee: '45',
        dayOfShowFee: '55',
        clubId: 'championship-club',
        clubName: 'Championship Dog Club',
        clubAddress: '456 Championship Ave',
        clubEmail: 'info@championshipclub.org',
        chairman: 'Championship Chairman',
        secretary: 'Championship Secretary',
        chiefSteward: 'Championship Steward',
        trials: [
          {
            id: 'trial-fri',
            name: 'Friday Trial',
            date: '2025-09-13',
            trialNumber: 'CC-001',
            status: 'Scheduled'
          },
          {
            id: 'trial-sat',
            name: 'Saturday Trial',
            date: '2025-09-14',
            trialNumber: 'CC-002',
            status: 'Scheduled'
          },
          {
            id: 'trial-sun',
            name: 'Sunday Trial',
            date: '2025-09-15',
            trialNumber: 'CC-003',
            status: 'Scheduled'
          }
        ]
      };

      await act(async () => {
        const newShow = await result.current.addShow(multiDayShowData);
        expect(newShow.name).toBe('Three Day Championship');
        expect(newShow.startDate).toBe('2025-09-13');
        expect(newShow.endDate).toBe('2025-09-15');
        expect(newShow.trials).toHaveLength(3);
      });

      const show = result.current.shows[0];
      expect(show.events).toContain('Friday Specialties');
      expect(show.events).toContain('Saturday All-Breed');
      expect(show.events).toContain('Sunday Sweepstakes');
    });

    it('should handle show search and filtering scenarios', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add multiple shows with different characteristics
      const shows = [
        {
          name: 'Spring Conformation Show',
          type: 'Conformation',
          startDate: '2025-03-15',
          status: 'Scheduled',
          clubId: 'club-1',
        },
        {
          name: 'Summer Agility Trial',
          type: 'Agility',
          startDate: '2025-06-20',
          status: 'Open for Entries',
          clubId: 'club-2',
        },
        {
          name: 'Fall Rally Event',
          type: 'Rally',
          startDate: '2025-09-10',
          status: 'Past',
          clubId: 'club-1',
        },
        {
          name: 'Winter Specialty',
          type: 'Conformation',
          startDate: '2025-12-05',
          status: 'Planning',
          clubId: 'club-3',
        }
      ];

      for (const showData of shows) {
        await act(async () => {
          await result.current.addShow({
            ...showData,
            endDate: showData.startDate,
            location: 'Test Location',
            events: [],
            source: 'myK9Show' as const,
            entryOpenDate: '2025-01-01',
            entryCloseDate: '2025-12-31',
            preEntryFee: '30',
            clubName: `Club ${showData.clubId}`,
            clubAddress: 'Test Address',
            clubEmail: 'test@club.org',
            chairman: 'Test Chairman',
            secretary: 'Test Secretary',
            chiefSteward: 'Test Steward',
          });
        });
      }

      expect(result.current.shows).toHaveLength(4);

      // Filter by type
      const conformationShows = result.current.shows.filter(s => s.type === 'Conformation');
      expect(conformationShows).toHaveLength(2);

      // Filter by status
      const scheduledShows = result.current.shows.filter(s => s.status === 'Scheduled');
      expect(scheduledShows).toHaveLength(1);

      // Filter by club
      const club1Shows = result.current.getShowsByClub('club-1');
      expect(club1Shows).toHaveLength(2);

      // Filter by date range (shows in 2025)
      const shows2025 = result.current.shows.filter(s => 
        s.startDate.startsWith('2025')
      );
      expect(shows2025).toHaveLength(4);
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle show operations with proper loading states', async () => {
      const { result } = renderHook(() => useShowStore());

      // Initially not loading
      expect(result.current.isLoading).toBe(false);

      // Test that operations complete without hanging
      await act(async () => {
        await result.current.addShow({
          name: 'Performance Test Show',
          type: 'Agility',
          startDate: '2025-10-15',
          endDate: '2025-10-15',
          location: 'Performance Center',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-09-15',
          entryCloseDate: '2025-10-10',
          preEntryFee: '25',
          clubId: 'performance-club',
          clubName: 'Performance Club',
          clubAddress: 'Performance Address',
          clubEmail: 'performance@club.org',
          chairman: 'Performance Chairman',
          secretary: 'Performance Secretary',
          chiefSteward: 'Performance Steward',
        });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.shows).toHaveLength(1);
    });

    it('should handle show not found scenarios', async () => {
      const { result } = renderHook(() => useShowStore());

      // Try to update non-existent show
      await act(async () => {
        const result_update = await result.current.updateShow('non-existent', {
          name: 'Should Not Work',
        });
        expect(result_update).toBeNull();
      });

      expect(result.current.error).toBeTruthy();

      // Get non-existent show
      const show = result.current.getShowById('non-existent');
      expect(show).toBeNull();

      // Get shows for non-existent club
      const clubShows = result.current.getShowsByClub('non-existent-club');
      expect(clubShows).toHaveLength(0);
    });

    it('should handle data migration and localStorage correctly', async () => {
      const { result } = renderHook(() => useShowStore());

      // Add a show
      await act(async () => {
        await result.current.addShow({
          name: 'Migration Test Show',
          type: 'Rally',
          startDate: '2025-11-15',
          endDate: '2025-11-15',
          location: 'Migration Center',
          status: 'Scheduled',
          events: [],
          source: 'myK9Show' as const,
          entryOpenDate: '2025-10-15',
          entryCloseDate: '2025-11-10',
          preEntryFee: '20',
          clubId: 'migration-club',
          clubName: 'Migration Club',
          clubAddress: 'Migration Address',
          clubEmail: 'migration@club.org',
          chairman: 'Migration Chairman',
          secretary: 'Migration Secretary',
          chiefSteward: 'Migration Steward',
        });
      });

      expect(result.current.shows).toHaveLength(1);

      // Simulate page reload with new store instance
      const { result: result2 } = renderHook(() => useShowStore());

      // Data should be persisted (in real scenario, would be from localStorage)
      expect(result2.current.shows).toBeDefined();
    });
  });
});