import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trialStore';

// ── Mutable mock state ───────────────────────────────────────────────────────

let mockEntries: SyncableShowEntry[] = [];
let mockTrials: SyncableTrial[] = [];
let mockTrialClasses: Record<string, SyncableTrialClass[]> = {};

vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: { entries: SyncableShowEntry[] }) => unknown) =>
    selector({ entries: mockEntries }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (
    selector: (s: {
      trials: SyncableTrial[];
      trialClasses: Record<string, SyncableTrialClass[]>;
    }) => unknown
  ) => selector({ trials: mockTrials, trialClasses: mockTrialClasses }),
}));

// Import after mocks (vi.mock is hoisted)
import { useQuickActionStats } from '../useQuickActionStats';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<SyncableShowEntry> = {}): SyncableShowEntry {
  return {
    id: 'entry-1',
    showId: 'show-1',
    dogId: 'dog-1',
    classId: 'class-1',
    handlerId: 'handler-1',
    status: 'submitted',
    paymentStatus: 'pending',
    statusHistory: [],
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableShowEntry;
}

function makeTrial(overrides: Partial<SyncableTrial> = {}): SyncableTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    status: 'Upcoming',
    trialNumber: 1,
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrial;
}

function makeClass(overrides: Partial<SyncableTrialClass> = {}): SyncableTrialClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    isScoringFinalized: false,
    _syncStatus: 'synced',
    ...overrides,
  } as SyncableTrialClass;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useQuickActionStats', () => {
  beforeEach(() => {
    mockEntries = [];
    mockTrials = [];
    mockTrialClasses = {};
  });

  it('returns all zeros when showId is empty', () => {
    mockEntries = [makeEntry({ showId: 'show-1', status: 'submitted' })];
    mockTrials = [makeTrial({ showId: 'show-1', status: 'Upcoming' })];
    mockTrialClasses = { 'trial-1': [makeClass({ isScoringFinalized: true })] };

    const { result } = renderHook(() => useQuickActionStats(''));

    expect(result.current.pendingEntriesCount).toBe(0);
    expect(result.current.reportsReadyCount).toBe(0);
    expect(result.current.activeTrialsCount).toBe(0);
  });

  it('counts only submitted entries for the show', () => {
    mockEntries = [
      makeEntry({ id: 'e1', showId: 'show-1', status: 'submitted' }),
      makeEntry({ id: 'e2', showId: 'show-1', status: 'submitted' }),
      makeEntry({ id: 'e3', showId: 'show-1', status: 'confirmed' }),
      makeEntry({ id: 'e4', showId: 'show-2', status: 'submitted' }), // different show
    ];

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.pendingEntriesCount).toBe(2);
  });

  it('counts finalized classes across all trials for the show', () => {
    mockTrials = [
      makeTrial({ id: 'trial-1', showId: 'show-1' }),
      makeTrial({ id: 'trial-2', showId: 'show-1' }),
      makeTrial({ id: 'trial-3', showId: 'show-2' }), // different show
    ];
    mockTrialClasses = {
      'trial-1': [
        makeClass({ id: 'c1', isScoringFinalized: true }),
        makeClass({ id: 'c2', isScoringFinalized: true }),
      ],
      'trial-2': [
        makeClass({ id: 'c3', isScoringFinalized: true }),
        makeClass({ id: 'c4', isScoringFinalized: false }),
      ],
      'trial-3': [
        makeClass({ id: 'c5', isScoringFinalized: true }), // different show — excluded
      ],
    };

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.reportsReadyCount).toBe(3);
  });

  it('counts only Upcoming and In Progress trials as active', () => {
    mockTrials = [
      makeTrial({ id: 't1', showId: 'show-1', status: 'Upcoming' }),
      makeTrial({ id: 't2', showId: 'show-1', status: 'In Progress' }),
      makeTrial({ id: 't3', showId: 'show-1', status: 'Completed' }),
      makeTrial({ id: 't4', showId: 'show-1', status: 'Cancelled' }),
      makeTrial({ id: 't5', showId: 'show-2', status: 'Upcoming' }), // different show
    ];

    const { result } = renderHook(() => useQuickActionStats('show-1'));

    expect(result.current.activeTrialsCount).toBe(2);
  });
});
