import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import {
  WITHHELD_SCORED_COLUMNS,
  withholdScoredResultColumns,
  hasScoredResult,
} from './resultVisibility';

// supabase is only touched by buildReplicatedUserEntryRows for the enrollments
// lookup — stub it to return no rows so the mapper path runs purely.
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

import { buildReplicatedUserEntryRows } from './userEntriesReplication';

function makeScoredEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    dogId: 'dog-1',
    handlerId: 'handler-1',
    armband: '101',
    handler: 'Jane Smith',
    entryStatus: 'confirmed',
    entryFee: 30,
    paymentStatus: 'paid',
    submittedAt: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    // Scored result — class results NOT released
    isScored: true,
    resultStatus: 'qualified',
    finalPlacement: 1,
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    ...overrides,
  } as ReplicatedEntry;
}

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Novice A',
    entryFee: 30,
    maxEntries: 50,
    // Not released
    resultsReleasedAt: null,
    ...overrides,
  } as ReplicatedClass;
}

function makeShow(overrides: Partial<ReplicatedShow> = {}): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Spring Championship',
    startDate: '2026-05-01',
    status: 'published',
    ...overrides,
  } as ReplicatedShow;
}

function makeTrial(overrides: Partial<ReplicatedTrial> = {}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial 1',
    date: '2026-05-01',
    trialNumber: '1',
    trialType: 'Scent Work',
    ...overrides,
  } as ReplicatedTrial;
}

function mapsFor(cls: ReplicatedClass, show: ReplicatedShow, trial: ReplicatedTrial) {
  return {
    dogsMap: new Map(),
    classesMap: new Map([[cls.id, cls]]),
    showsMap: new Map([[show.id, show]]),
    trialsMap: new Map([[trial.id, trial]]),
  };
}

describe('withholdScoredResultColumns', () => {
  it('nulls every withheld scored column present on the row', () => {
    const row: Record<string, unknown> = {
      id: 'e1',
      armband: '101',
      entry_status: 'confirmed',
      is_scored: true,
      final_placement: 1,
      result_status: 'qualified',
      search_time_seconds: 42.5,
      total_faults: 0,
      total_score: 100,
      result_text: 'Q',
    };

    withholdScoredResultColumns(row);

    for (const column of WITHHELD_SCORED_COLUMNS) {
      expect(row[column]).toBeNull();
    }
  });

  it('preserves is_scored and all non-result columns', () => {
    const row: Record<string, unknown> = {
      id: 'e1',
      armband: '101',
      entry_status: 'confirmed',
      payment_status: 'paid',
      is_scored: true,
      final_placement: 3,
    };

    withholdScoredResultColumns(row);

    expect(row.is_scored).toBe(true);
    expect(row.armband).toBe('101');
    expect(row.entry_status).toBe('confirmed');
    expect(row.payment_status).toBe('paid');
    expect(row.final_placement).toBeNull();
  });
});

describe('hasScoredResult', () => {
  it('is true for isScored / is_scored true', () => {
    expect(hasScoredResult({ isScored: true })).toBe(true);
    expect(hasScoredResult({ is_scored: true })).toBe(true);
  });

  it('is false otherwise', () => {
    expect(hasScoredResult({ isScored: false })).toBe(false);
    expect(hasScoredResult({})).toBe(false);
  });
});

describe('buildReplicatedUserEntryRows result-leak guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT expose final_placement/result_status/scores for an unreleased scored class', async () => {
    const entry = makeScoredEntry();
    const cls = makeClass({ resultsReleasedAt: null });
    const show = makeShow();
    const trial = makeTrial();

    const { data } = await buildReplicatedUserEntryRows([entry], mapsFor(cls, show, trial));

    const row = data[0];
    // Assertion-first: the raw replicated values must NOT leak.
    expect(row.final_placement).toBeNull();
    expect(row.result_status).toBeNull();
    expect(row.search_time_seconds).toBeNull();
    expect(row.total_faults).toBeNull();
    // Identity / status still present (offline-first preserved).
    expect(row.id).toBe('entry-1');
    expect(row.armband).toBe('101');
    expect(row.entry_status).toBe('confirmed');
    expect(row.is_scored).toBe(true);
  });

  it('withholds scored columns even when the class is released (server view owns release)', async () => {
    // The replication path can never resolve the per-field cascade, so it always
    // withholds; correctly-released results come from the cascade-aware server
    // view that getUserEntries prefers when entries are scored.
    const entry = makeScoredEntry();
    const cls = makeClass({ resultsReleasedAt: '2026-05-02T00:00:00Z' });
    const show = makeShow();
    const trial = makeTrial();

    const { data } = await buildReplicatedUserEntryRows([entry], mapsFor(cls, show, trial));

    const row = data[0];
    expect(row.final_placement).toBeNull();
    expect(row.result_status).toBeNull();
    // class_results_released_at is still surfaced (it is not a scored value).
    expect(row.class_results_released_at).toBe('2026-05-02T00:00:00Z');
  });
});
