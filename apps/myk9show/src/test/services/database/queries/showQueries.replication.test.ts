import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockShowsTable, mockClubsTable, mockTrialsTable, mockJudgeAssignmentsTable } = vi.hoisted(
  () => ({
    mockShowsTable: {
      getAllShows: vi.fn(),
      getShowById: vi.fn(),
      getUpcomingShows: vi.fn(),
      getShowsByClub: vi.fn(),
      getAll: vi.fn(),
    },
    mockClubsTable: {
      getAllClubs: vi.fn(),
      getClubById: vi.fn(),
      getAll: vi.fn(),
    },
    mockTrialsTable: {
      getTrialsByShow: vi.fn(),
      getAll: vi.fn(),
    },
    mockJudgeAssignmentsTable: {
      getByShowId: vi.fn(),
      getAll: vi.fn(),
    },
  })
);

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));

vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mockClubsTable,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));

// Now import the functions under test
import {
  getAllShows,
  getShowById,
  getUpcomingShows,
  getShowsByDateRange,
  getShowsByClub,
  getShowsWithEntryCounts,
  getShowsByStatus,
  getSecretaryShows,
  searchShows,
  getShowStatistics,
} from '@/services/database/shows';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeShow(overrides: Partial<ReplicatedShow> = {}): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Spring Championship',
    organization: 'AKC',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    location: 'Portland, OR',
    status: 'published',
    clubId: 'club-1',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-04-25',
    preEntryFee: 30,
    dayOfShowFee: 35,
    maxEntriesPerDog: 2,
    maxTotalEntries: 100,
    allowsNonOwnerHandlers: true,
    acceptCheckPayments: true,
    acceptCashPayments: false,
    logoUrl: 'https://example.com/logo.png',
    coverImageUrl: 'https://example.com/cover.png',
    accentColor: '#ff0000',
    ...overrides,
  };
}

function makeClub(overrides: Partial<ReplicatedClub> = {}): ReplicatedClub {
  return {
    id: 'club-1',
    name: 'Portland Dog Club',
    email: 'info@pdclub.com',
    phone: '555-1234',
    website: 'https://pdclub.com',
    address: '123 Main St',
    logoUrl: 'https://pdclub.com/logo.png',
    coverImageUrl: 'https://pdclub.com/cover.png',
    accentColor: '#00ff00',
    ...overrides,
  };
}

function makeTrial(overrides: Partial<ReplicatedTrial> = {}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial 1',
    date: '2026-05-01',
    trialNumber: '1',
    status: 'upcoming',
    trialType: 'Scent Work',
    maxEntriesPerDog: 2,
    maxTotalEntries: 50,
    maxEntriesPerHandler: 3,
    ...overrides,
  };
}

function makeJudgeAssignment(
  overrides: Partial<ReplicatedJudgeAssignment> = {}
): ReplicatedJudgeAssignment {
  return {
    id: 'ja-1',
    personId: 'person-1',
    showId: 'show-1',
    trialId: 'trial-1',
    classId: 'class-1',
    status: 'confirmed',
    invitedAt: '2026-03-01T00:00:00Z',
    confirmedAt: '2026-03-05T00:00:00Z',
    fee: 200,
    notes: 'Experienced judge',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers to set up default mocks for list queries
// ---------------------------------------------------------------------------

function setupListMocks(
  shows: ReplicatedShow[] = [makeShow()],
  clubs: ReplicatedClub[] = [makeClub()],
  trials: ReplicatedTrial[] = [makeTrial()],
  assignments: ReplicatedJudgeAssignment[] = [makeJudgeAssignment()]
) {
  mockShowsTable.getAllShows.mockResolvedValue(shows);
  mockShowsTable.getUpcomingShows.mockResolvedValue(shows);
  mockShowsTable.getShowsByClub.mockResolvedValue(shows);
  mockClubsTable.getAllClubs.mockResolvedValue(clubs);
  mockTrialsTable.getAll.mockResolvedValue(trials);
  mockJudgeAssignmentsTable.getAll.mockResolvedValue(assignments);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAllShows
  // -----------------------------------------------------------------------
  describe('getAllShows', () => {
    it('returns correct snake_case shape with joined data', async () => {
      setupListMocks();

      const result = await getAllShows();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      // Show fields
      expect(row.id).toBe('show-1');
      expect(row.name).toBe('Spring Championship');
      expect(row.start_date).toBe('2026-05-01');
      expect(row.end_date).toBe('2026-05-02');
      expect(row.location).toBe('Portland, OR');
      expect(row.status).toBe('published');
      expect(row.club_id).toBe('club-1');
      expect(row.pre_entry_fee).toBe(30);
      expect(row.deleted_at).toBeNull();

      // Club sub-object (summary)
      const club = row.club as Record<string, unknown>;
      expect(club.id).toBe('club-1');
      expect(club.name).toBe('Portland Dog Club');
      expect(club.logo_url).toBe('https://pdclub.com/logo.png');

      // Trials array
      const trials = row.trials as Record<string, unknown>[];
      expect(trials).toHaveLength(1);
      expect(trials[0].id).toBe('trial-1');
      expect(trials[0].trial_number).toBe('1');
      expect(trials[0].trial_type).toBe('Scent Work');

      // Judge assignments array
      const ja = row.judge_assignments as Record<string, unknown>[];
      expect(ja).toHaveLength(1);
      expect(ja[0].person_id).toBe('person-1');
      expect(ja[0].fee).toBe(200);
      expect(ja[0].judge).toBeNull(); // people not replicated yet
    });

    it('returns empty array when no shows exist', async () => {
      setupListMocks([], [], [], []);

      const result = await getAllShows();

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('sorts by start_date ascending', async () => {
      const shows = [
        makeShow({ id: 'show-b', startDate: '2026-06-01' }),
        makeShow({ id: 'show-a', startDate: '2026-04-01' }),
      ];
      // getAllShows from the replicated table already sorts ascending
      setupListMocks(shows);

      const result = await getAllShows();

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).id).toBe('show-b');
    });

    it('sets club to null when show has no clubId', async () => {
      setupListMocks([makeShow({ clubId: undefined })]);

      const result = await getAllShows();
      const row = result.data[0] as Record<string, unknown>;
      expect(row.club).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getShowById
  // -----------------------------------------------------------------------
  describe('getShowById', () => {
    it('returns correct snake_case shape with detail club', async () => {
      mockShowsTable.getShowById.mockResolvedValue(makeShow());
      mockClubsTable.getClubById.mockResolvedValue(makeClub());
      mockTrialsTable.getTrialsByShow.mockResolvedValue([makeTrial()]);
      mockJudgeAssignmentsTable.getByShowId.mockResolvedValue([makeJudgeAssignment()]);

      const result = await getShowById('show-1');

      expect(result.error).toBeNull();
      const row = result.data as Record<string, unknown>;
      expect(row.id).toBe('show-1');

      // Detail club includes address, phone, email, website
      const club = row.club as Record<string, unknown>;
      expect(club.address).toBe('123 Main St');
      expect(club.phone).toBe('555-1234');
      expect(club.email).toBe('info@pdclub.com');
      expect(club.website).toBe('https://pdclub.com');
    });

    it('returns { data: null, error: null } for missing records', async () => {
      mockShowsTable.getShowById.mockResolvedValue(null);

      const result = await getShowById('non-existent');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getUpcomingShows
  // -----------------------------------------------------------------------
  describe('getUpcomingShows', () => {
    it('respects limit parameter', async () => {
      const shows = Array.from({ length: 5 }, (_, i) =>
        makeShow({ id: `show-${i}`, startDate: `2026-0${5 + i}-01` })
      );
      setupListMocks(shows);

      const result = await getUpcomingShows(3);

      expect(result.data).toHaveLength(3);
    });

    it('returns all shows when limit exceeds count', async () => {
      setupListMocks([makeShow()]);

      const result = await getUpcomingShows(10);

      expect(result.data).toHaveLength(1);
    });

    it('returns { data: [], error: null } for empty list', async () => {
      setupListMocks([], [], [], []);

      const result = await getUpcomingShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getShowsByDateRange
  // -----------------------------------------------------------------------
  describe('getShowsByDateRange', () => {
    it('filters shows within date range', async () => {
      const shows = [
        makeShow({ id: 'in-range', startDate: '2026-05-01', endDate: '2026-05-02' }),
        makeShow({ id: 'out-of-range', startDate: '2026-07-01', endDate: '2026-07-02' }),
      ];
      setupListMocks(shows);

      const result = await getShowsByDateRange('2026-04-01', '2026-06-01');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('in-range');
    });

    it('returns empty array when no shows match range', async () => {
      setupListMocks([makeShow({ startDate: '2026-01-01', endDate: '2026-01-02' })]);

      const result = await getShowsByDateRange('2026-06-01', '2026-07-01');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getShowsByClub
  // -----------------------------------------------------------------------
  describe('getShowsByClub', () => {
    it('sorts by start_date descending', async () => {
      const shows = [
        makeShow({ id: 'show-old', startDate: '2026-01-01' }),
        makeShow({ id: 'show-new', startDate: '2026-06-01' }),
      ];
      mockShowsTable.getShowsByClub.mockResolvedValue(shows);
      mockClubsTable.getAllClubs.mockResolvedValue([makeClub()]);
      mockTrialsTable.getAll.mockResolvedValue([]);
      mockJudgeAssignmentsTable.getAll.mockResolvedValue([]);

      const result = await getShowsByClub('club-1');

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).start_date).toBe('2026-06-01');
      expect((result.data[1] as Record<string, unknown>).start_date).toBe('2026-01-01');
    });
  });

  // -----------------------------------------------------------------------
  // getShowsWithEntryCounts
  // -----------------------------------------------------------------------
  describe('getShowsWithEntryCounts', () => {
    it('adds entry_count: 0 to each row', async () => {
      setupListMocks();

      const result = await getShowsWithEntryCounts();

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).entry_count).toBe(0);
      // Should have club sub-object
      expect((result.data[0] as Record<string, unknown>).club).toBeDefined();
    });

    it('returns empty array when no shows', async () => {
      setupListMocks([], [], [], []);

      const result = await getShowsWithEntryCounts();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getShowsByStatus
  // -----------------------------------------------------------------------
  describe('getShowsByStatus', () => {
    it('filters by status', async () => {
      const shows = [
        makeShow({ id: 'pub', status: 'published' }),
        makeShow({ id: 'draft', status: 'draft' }),
      ];
      setupListMocks(shows);

      const result = await getShowsByStatus('published');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('pub');
    });

    it('returns empty when no shows match status', async () => {
      setupListMocks([makeShow({ status: 'published' })]);

      const result = await getShowsByStatus('cancelled');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getSecretaryShows
  // -----------------------------------------------------------------------
  describe('getSecretaryShows', () => {
    it('returns only id, name, start_date, end_date', async () => {
      setupListMocks();

      const result = await getSecretaryShows('user-1');

      expect(result.data).toHaveLength(1);
      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('show-1');
      expect(row.name).toBe('Spring Championship');
      expect(row.start_date).toBe('2026-05-01');
      expect(row.end_date).toBe('2026-05-02');
      // Should NOT have other fields
      expect(row.location).toBeUndefined();
      expect(row.club).toBeUndefined();
    });

    it('sorts by start_date descending', async () => {
      const shows = [
        makeShow({ id: 'old', startDate: '2026-01-01', endDate: '2026-01-02' }),
        makeShow({ id: 'new', startDate: '2026-06-01', endDate: '2026-06-02' }),
      ];
      setupListMocks(shows);

      const result = await getSecretaryShows('user-1');

      expect((result.data[0] as Record<string, unknown>).start_date).toBe('2026-06-01');
    });
  });

  // -----------------------------------------------------------------------
  // searchShows
  // -----------------------------------------------------------------------
  describe('searchShows', () => {
    it('filters by name case-insensitively', async () => {
      const shows = [
        makeShow({ id: 'match', name: 'Spring Championship' }),
        makeShow({ id: 'no-match', name: 'Fall Classic' }),
      ];
      setupListMocks(shows);

      const result = await searchShows('spring');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('filters by location case-insensitively', async () => {
      const shows = [
        makeShow({ id: 'match', name: 'Event A', location: 'Portland, OR' }),
        makeShow({ id: 'no-match', name: 'Event B', location: 'Seattle, WA' }),
      ];
      setupListMocks(shows);

      const result = await searchShows('PORTLAND');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('returns empty array for no matches', async () => {
      setupListMocks([makeShow()]);

      const result = await searchShows('zzzznonexistent');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getShowStatistics
  // -----------------------------------------------------------------------
  describe('getShowStatistics', () => {
    it('returns total count of shows', async () => {
      setupListMocks([makeShow({ id: 'a' }), makeShow({ id: 'b' }), makeShow({ id: 'c' })]);

      const result = await getShowStatistics();

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ total: 3 });
    });

    it('returns 0 when no shows exist', async () => {
      setupListMocks([]);

      const result = await getShowStatistics();

      expect(result.data).toEqual({ total: 0 });
      expect(result.error).toBeNull();
    });
  });
});
