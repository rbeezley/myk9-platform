import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockShowsTable,
  mockClubsTable,
  mockTrialsTable,
  mockClassesTable,
  mockJudgeAssignmentsTable,
  mockPostgrestGetShowById,
} = vi.hoisted(() => ({
  mockShowsTable: { getShowById: vi.fn(), getAllShows: vi.fn() },
  mockClubsTable: { getClubById: vi.fn() },
  mockTrialsTable: { getTrialsByShow: vi.fn() },
  mockClassesTable: { getAll: vi.fn() },
  mockJudgeAssignmentsTable: { getByShowId: vi.fn() },
  mockPostgrestGetShowById: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mockClubsTable,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));
vi.mock('./reads.postgrest', async importOriginal => {
  const original = await importOriginal<typeof import('./reads.postgrest')>();
  return { ...original, postgrestGetShowById: mockPostgrestGetShowById };
});

import { getShowById } from './reads';

/**
 * Classes replicate scoped BY TRIAL and only for authenticated sessions, while
 * shows and trials arrive earlier. A signed-in visitor can therefore hold a
 * show and its trials with none of their classes, and every consumer that reads
 * classes off the show then sees a show that legitimately offers nothing.
 *
 * Reproduced in a real browser before this guard existed: with `shows` and
 * `trials` in IndexedDB and `classes` absent, the premium's offered-classes
 * section and its "See classes" link both disappeared on a show with 9 classes.
 */
describe('getShowById — classes missing from the replication store', () => {
  const CACHED_SHOW = { id: 'show-1', name: 'Cached Show', clubId: null };
  const CACHED_TRIAL = {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Saturday',
    trialType: 'Scent Work',
  };
  const CACHED_TRIAL_2 = {
    id: 'trial-2',
    showId: 'show-1',
    name: 'Sunday',
    trialType: 'Scent Work',
  };

  const REMOTE_WITH_CLASSES = {
    data: {
      id: 'show-1',
      name: 'Cached Show',
      trials: [
        {
          id: 'trial-1',
          name: 'Saturday',
          class: [{ id: 'c1', name: 'Interior Novice', element: 'Interior', level: 'Novice' }],
        },
      ],
      judge_assignments: [],
    },
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowsTable.getShowById.mockResolvedValue(CACHED_SHOW);
    mockClubsTable.getClubById.mockResolvedValue(null);
    mockTrialsTable.getTrialsByShow.mockResolvedValue([CACHED_TRIAL]);
    mockJudgeAssignmentsTable.getByShowId.mockResolvedValue([]);
  });

  it('takes the trials from the server when the store has none of their classes', async () => {
    mockClassesTable.getAll.mockResolvedValue([]);
    mockPostgrestGetShowById.mockResolvedValue(REMOTE_WITH_CLASSES);

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { class: unknown[] }[] }).trials;

    expect(trials).toHaveLength(1);
    expect(trials[0]?.class).toEqual([
      { id: 'c1', name: 'Interior Novice', element: 'Interior', level: 'Novice' },
    ]);
  });

  it('keeps the replicated trials when the store already has classes', async () => {
    // Offline-first: a warm store must not be overwritten by the network.
    mockClassesTable.getAll.mockResolvedValue([
      { id: 'local-1', trialId: 'trial-1', name: 'Local Interior', element: 'Interior' },
    ]);
    mockPostgrestGetShowById.mockResolvedValue(REMOTE_WITH_CLASSES);

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { class: { id: string }[] }[] }).trials;

    expect(trials[0]?.class?.[0]?.id).toBe('local-1');
  });

  it('leaves a genuinely class-less show empty rather than flip-flopping', async () => {
    mockClassesTable.getAll.mockResolvedValue([]);
    mockPostgrestGetShowById.mockResolvedValue({
      data: { id: 'show-1', name: 'Cached Show', trials: [{ id: 'trial-1', class: [] }] },
      error: null,
    });

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { class: unknown[] }[] }).trials;

    expect(trials[0]?.class).toEqual([]);
  });

  /**
   * The shape that matters most: `classes` sync scoped BY TRIAL, so opening one
   * trial populates its classes and leaves its siblings empty. Partial coverage
   * is the normal state, not the exception. A whole-show check would see the one
   * populated trial, conclude the show was fine, and leave Sunday showing
   * nothing at all.
   */
  it('fills only the trials that are missing classes, leaving warm ones alone', async () => {
    mockTrialsTable.getTrialsByShow.mockResolvedValue([CACHED_TRIAL, CACHED_TRIAL_2]);
    // Saturday's classes are in the store; Sunday's are not.
    mockClassesTable.getAll.mockResolvedValue([
      { id: 'local-sat', trialId: 'trial-1', name: 'Local Interior', element: 'Interior' },
    ]);
    mockPostgrestGetShowById.mockResolvedValue({
      data: {
        id: 'show-1',
        name: 'Cached Show',
        trials: [
          { id: 'trial-1', class: [{ id: 'remote-sat', element: 'Interior' }] },
          { id: 'trial-2', class: [{ id: 'remote-sun', element: 'Exterior' }] },
        ],
        judge_assignments: [],
      },
      error: null,
    });

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { id: string; class: { id: string }[] }[] }).trials;

    const saturday = trials.find(t => t.id === 'trial-1');
    const sunday = trials.find(t => t.id === 'trial-2');

    // Saturday keeps its local copy — offline-first, network never overwrites.
    expect(saturday?.class?.[0]?.id).toBe('local-sat');
    // Sunday, which had none, is filled from the server.
    expect(sunday?.class?.[0]?.id).toBe('remote-sun');
  });

  it('leaves a trial empty when the server has nothing for it either', async () => {
    mockTrialsTable.getTrialsByShow.mockResolvedValue([CACHED_TRIAL, CACHED_TRIAL_2]);
    mockClassesTable.getAll.mockResolvedValue([]);
    mockPostgrestGetShowById.mockResolvedValue({
      data: {
        id: 'show-1',
        name: 'Cached Show',
        trials: [
          { id: 'trial-1', class: [{ id: 'remote-sat', element: 'Interior' }] },
          { id: 'trial-2', class: [] },
        ],
        judge_assignments: [],
      },
      error: null,
    });

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { id: string; class: unknown[] }[] }).trials;

    expect(trials.find(t => t.id === 'trial-1')?.class).toHaveLength(1);
    expect(trials.find(t => t.id === 'trial-2')?.class).toEqual([]);
  });

  it('leaves a trial alone when the server does not report it at all', async () => {
    mockTrialsTable.getTrialsByShow.mockResolvedValue([CACHED_TRIAL, CACHED_TRIAL_2]);
    mockClassesTable.getAll.mockResolvedValue([]);
    mockPostgrestGetShowById.mockResolvedValue({
      data: {
        id: 'show-1',
        name: 'Cached Show',
        trials: [{ id: 'trial-1', class: [{ id: 'remote-sat' }] }],
        judge_assignments: [],
      },
      error: null,
    });

    const result = await getShowById('show-1');
    const trials = (result.data as { trials: { id: string; class: unknown[] }[] }).trials;

    expect(trials).toHaveLength(2);
    expect(trials.find(t => t.id === 'trial-2')?.class).toEqual([]);
  });

  it('keeps the replicated row when the network read fails', async () => {
    // Offline: there is nothing better to fall back to, and throwing would
    // lose the cached show entirely.
    mockClassesTable.getAll.mockResolvedValue([]);
    mockPostgrestGetShowById.mockRejectedValue(new Error('offline'));

    const result = await getShowById('show-1');

    expect((result.data as { id: string }).id).toBe('show-1');
  });
});
