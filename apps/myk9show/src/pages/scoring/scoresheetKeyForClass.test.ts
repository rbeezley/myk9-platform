/**
 * MYK9-1098: Set Max Time asks for one time per area only for classes scored on
 * the AKC Scent Work sheet, decided by the same resolution the scoresheet page
 * uses. Nationals splits one total across its areas; ASCA times one total.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTrialById, getShow } = vi.hoisted(() => ({
  getTrialById: vi.fn(),
  getShow: vi.fn(),
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: getShow },
}));

import { scoresheetKeyForClass } from './types';

describe('scoresheetKeyForClass (MYK9-1098)', () => {
  beforeEach(() => {
    getTrialById.mockReset();
    getShow.mockReset();
  });

  it.each([
    ['AKC', 'Scent Work', 'AKC_SCENT_WORK'],
    ['AKC', 'Scent Work Nationals', 'AKC_SCENT_WORK_NATIONAL'],
    ['ASCA', 'Scent Detection', 'ASCA_SCENT_DETECTION'],
    ['UKC', 'Nosework', 'UKC_NOSEWORK'],
  ])('%s %s scores on %s', async (organization, trialType, key) => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType });
    getShow.mockResolvedValue({ id: 's1', organization });
    expect(await scoresheetKeyForClass('t1', 'Interior Excellent A')).toBe(key);
  });

  it('falls back to the class name when the trial does not resolve', async () => {
    getTrialById.mockResolvedValue(null);
    expect(await scoresheetKeyForClass('t1', 'AKC Nationals Interior')).toBe(
      'AKC_SCENT_WORK_NATIONAL'
    );
  });
});
