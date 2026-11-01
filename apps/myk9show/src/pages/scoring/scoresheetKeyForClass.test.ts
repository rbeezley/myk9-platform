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

import {
  MISSING_TRIAL_TYPE_SPORT_TYPE,
  UNRESOLVED_SPORT_TYPE,
  resolveSportTypeForClass,
  scoresheetKeyForClass,
} from './types';

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

describe('stored trial_type forms (MYK9-1543)', () => {
  beforeEach(() => {
    getTrialById.mockReset();
    getShow.mockReset();
  });

  it.each([
    ['AKC', 'scent_work', 'akc-scent-work', 'AKC_SCENT_WORK'],
    ['AKC', 'Scent Work', 'akc-scent-work', 'AKC_SCENT_WORK'],
    ['ASCA', 'scent_detection', 'asca-scent-detection', 'ASCA_SCENT_DETECTION'],
    ['UKC', 'nosework', 'ukc-nosework', 'UKC_NOSEWORK'],
    ['UKC', 'Nosework', 'ukc-nosework', 'UKC_NOSEWORK'],
    ['UKC', 'UKC Nosework', 'ukc-nosework', 'UKC_NOSEWORK'],
    ['ASCA', 'ASCA Scent Detection', 'asca-scent-detection', 'ASCA_SCENT_DETECTION'],
  ])('%s "%s" resolves to %s and sheet %s', async (organization, trialType, code, key) => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType });
    getShow.mockResolvedValue({ id: 's1', organization });
    expect(await resolveSportTypeForClass('t1')).toBe(code);
    expect(await scoresheetKeyForClass('t1', 'Interior Excellent A')).toBe(key);
  });

  it('AKC with a null trial type keeps the class-name fallback', async () => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType: null });
    getShow.mockResolvedValue({ id: 's1', organization: 'AKC' });
    expect(await resolveSportTypeForClass('t1')).toBeNull();
    expect(await scoresheetKeyForClass('t1', 'Interior Excellent A')).toBe('AKC_SCENT_WORK');
  });

  it.each([
    ['ASCA', 'mystery_sport', 'unresolved'],
    // MYK9-1574: a missing type is told apart so the page can name it.
    ['ASCA', null, 'unresolved-missing-trial-type'],
    ['UKC', null, 'unresolved-missing-trial-type'],
  ])(
    '%s with trial type %s never resolves to the AKC sheet',
    async (organization, trialType, sport) => {
      getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType });
      getShow.mockResolvedValue({ id: 's1', organization });
      expect(await resolveSportTypeForClass('t1')).toBe(sport);
      expect(await scoresheetKeyForClass('t1', 'Interior Excellent A')).toBeNull();
    }
  );
});

describe('trials with no trial type (MYK9-1574)', () => {
  beforeEach(() => {
    getTrialById.mockReset();
    getShow.mockReset();
  });

  it.each(['UKC', 'ASCA'])('%s with a null trial type says the type is missing', async org => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType: null });
    getShow.mockResolvedValue({ id: 's1', organization: org });
    expect(await resolveSportTypeForClass('t1')).toBe(MISSING_TRIAL_TYPE_SPORT_TYPE);
    expect(await scoresheetKeyForClass('t1', 'Interior')).toBeNull();
  });

  it('a UKC trial type with no sheet stays the generic unresolved result', async () => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType: 'Agility' });
    getShow.mockResolvedValue({ id: 's1', organization: 'UKC' });
    expect(await resolveSportTypeForClass('t1')).toBe(UNRESOLVED_SPORT_TYPE);
  });

  it('AKC with a null trial type keeps the class-name fallback', async () => {
    getTrialById.mockResolvedValue({ id: 't1', showId: 's1', trialType: null });
    getShow.mockResolvedValue({ id: 's1', organization: 'AKC' });
    expect(await resolveSportTypeForClass('t1')).toBeNull();
  });
});
