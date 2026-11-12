/**
 * MYK9-1885: the show's Nationals flag picks the Nationals sheet for an AKC
 * Scent Work trial, on the path both scoring pages use (show -> trial -> sheet).
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

import { resolveSportTypeForClass, scoresheetKeyForClass } from './types';

describe('show Nationals flag selects the Nationals sheet (MYK9-1885)', () => {
  beforeEach(() => {
    getTrialById.mockReset();
    getShow.mockReset();
  });

  it.each([
    ['AKC', 'Scent Work', true, 'AKC_SCENT_WORK_NATIONAL'],
    ['AKC', 'scent_work', true, 'AKC_SCENT_WORK_NATIONAL'],
    ['AKC', 'Scent Work', false, 'AKC_SCENT_WORK'],
    ['AKC', 'Scent Work', undefined, 'AKC_SCENT_WORK'],
    ['AKC', 'Scent Work Nationals', false, 'AKC_SCENT_WORK_NATIONAL'],
    ['AKC', 'Scent Work Nationals', true, 'AKC_SCENT_WORK_NATIONAL'],
    ['AKC', 'FastCAT', true, 'AKC_FASTCAT'],
    ['UKC', 'Nosework', true, 'UKC_NOSEWORK'],
    ['ASCA', 'Scent Detection', true, 'ASCA_SCENT_DETECTION'],
  ])('%s %s isNationals=%s scores on %s', async (organization, trialType, isNationals, key) => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType });
    getShow.mockResolvedValue({ id: 's1', organization, isNationals });
    expect(await scoresheetKeyForClass('t1', 'Interior Excellent A')).toBe(key);
  });

  it('resolves the sport code the pages hand to mapSportType', async () => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType: 'Scent Work' });
    getShow.mockResolvedValue({ id: 's1', organization: 'AKC', isNationals: true });
    expect(await resolveSportTypeForClass('t1')).toBe('akc-scent-work-nationals');
  });
});
