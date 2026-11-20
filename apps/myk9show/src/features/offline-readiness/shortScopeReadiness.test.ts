import { describe, expect, it, vi } from 'vitest';
import { computeOfflineReadiness } from './computeOfflineReadiness';
import { toScope } from './showStructureScopes';

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {},
  replicatedJudgeAssignmentsTable: {},
  replicatedShowsTable: {},
  replicatedTrialsTable: {},
}));
vi.mock('@/services/database/judges/assignmentReads', () => ({
  readJudgeAssignmentsOrThrow: vi.fn(),
}));

describe('a scope a download left short (MYK9-2254)', () => {
  it('reads as not saved, so the badge shows "Offline copy: not saved on this device"', () => {
    // What a short full download persists: the confirmed server count, and the
    // device holding fewer rows than that. Its watermark may be fresh.
    const trials = toScope('trials', { expectedRemoteRows: 3, lastIncrementalSyncAt: 2_000 }, 2);

    expect(trials.hydrated).toBe(false);
    expect(computeOfflineReadiness({ permissionsCachedAt: 1_000, scopes: [trials] })).toEqual({
      ready: false,
      missing: ['trials'],
      asOf: null,
    });
  });

  it('reads as saved once the device holds the confirmed count', () => {
    const trials = toScope('trials', { expectedRemoteRows: 3, lastIncrementalSyncAt: 2_000 }, 3);

    expect(computeOfflineReadiness({ permissionsCachedAt: 1_000, scopes: [trials] }).ready).toBe(
      true
    );
  });
});
