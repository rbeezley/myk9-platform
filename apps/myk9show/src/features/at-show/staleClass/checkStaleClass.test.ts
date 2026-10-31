// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClassById: vi.fn(),
  getClassesByTrial: vi.fn(),
  getEntriesByClass: vi.fn(),
  getTrialById: vi.fn(),
  syncAtShowData: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: mocks.getClassById,
    getClassesByTrial: mocks.getClassesByTrial,
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: mocks.getEntriesByClass },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: mocks.getTrialById },
}));
vi.mock('../atShowDataAdapter', () => ({ syncAtShowData: mocks.syncAtShowData }));
vi.mock('@/services/LoggingService', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { checkForStaleClass, evaluateStaleClass, recheckStaleClass } from './checkStaleClass';
import { useStaleClassPromptStore } from './staleClassPromptStore';

const NOW = Date.now();
const longAgo = new Date(NOW - 40 * 60_000).toISOString();

const classes = [
  {
    id: 'scored',
    name: 'Container Novice B',
    level: 'Novice',
    judgeId: 'j',
    classStatus: 'in_progress',
  },
  {
    id: 'stale',
    name: 'Buried Excellent A',
    level: 'Excellent',
    judgeId: 'j',
    classStatus: 'in_progress',
  },
  {
    id: 'same-level',
    name: 'Buried Novice A',
    level: 'Novice',
    judgeId: 'j',
    classStatus: 'in_progress',
  },
];
const entries: Record<string, unknown[]> = {
  stale: [
    { id: 'a', isScored: true, scoringCompletedAt: longAgo },
    { id: 'b', isScored: false },
  ],
  'same-level': [
    { id: 'c', isScored: true, scoringCompletedAt: longAgo },
    { id: 'd', isScored: false },
  ],
};

describe('stale-class check against the replica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStaleClassPromptStore.setState({ prompt: null, snoozes: {} });
    mocks.getClassById.mockResolvedValue({ ...classes[0], trialId: 'trial' });
    mocks.getClassesByTrial.mockResolvedValue(classes);
    mocks.getEntriesByClass.mockImplementation(async (id: string) => entries[id] ?? []);
    mocks.getTrialById.mockResolvedValue({ id: 'trial' });
    mocks.syncAtShowData.mockResolvedValue(undefined);
  });

  it('finds the different-level class and ignores the same-level one', async () => {
    const hit = await evaluateStaleClass('scored', NOW);
    expect(hit?.candidate.classId).toBe('stale');
    expect(hit?.candidate.unscoredEntryIds).toEqual(['b']);
  });

  it('treats an unset switch (null / absent) as enabled', async () => {
    mocks.getTrialById.mockResolvedValue({ id: 'trial', autoCompleteStaleClasses: undefined });
    expect(await evaluateStaleClass('scored', NOW)).not.toBeNull();
  });

  it('asks nothing when the trial switch is explicitly off', async () => {
    mocks.getTrialById.mockResolvedValue({ id: 'trial', autoCompleteStaleClasses: false });
    expect(await evaluateStaleClass('scored', NOW)).toBeNull();
    await checkForStaleClass('show', 'scored');
    expect(useStaleClassPromptStore.getState().prompt).toBeNull();
  });

  it('puts the prompt on screen after a score', async () => {
    await checkForStaleClass('show', 'scored');
    expect(useStaleClassPromptStore.getState().prompt).toMatchObject({
      classId: 'stale',
      showId: 'show',
      scoredClassId: 'scored',
    });
  });

  it('does not throw when the replica read fails', async () => {
    mocks.getClassById.mockRejectedValue(new Error('idb closed'));
    await expect(checkForStaleClass('show', 'scored')).resolves.toBeUndefined();
  });

  it('re-checks after pulling the show, so a dog scored elsewhere drops out', async () => {
    const prompt = {
      ...(await evaluateStaleClass('scored', NOW))!.candidate,
      showId: 'show',
      trialId: 'trial',
      scoredClassId: 'scored',
    };
    // Another device scored the last dog; the pull brings that in.
    mocks.syncAtShowData.mockImplementation(async () => {
      entries.stale = [
        { id: 'a', isScored: true, scoringCompletedAt: longAgo },
        { id: 'b', isScored: true, scoringCompletedAt: longAgo },
      ];
    });
    expect(await recheckStaleClass(prompt)).toBeNull();
    expect(mocks.syncAtShowData).toHaveBeenCalledWith('show');
  });
});
