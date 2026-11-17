import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTrialsByShow: vi.fn(),
  getShow: vi.fn(),
  updateShow: vi.fn(),
  reportDebug: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
  replicatedShowsTable: { get: mocks.getShow, updateShow: mocks.updateShow },
}));
vi.mock('@/utils/standardizedErrorHandler', () => ({ reportDebug: mocks.reportDebug }));

import { deriveShowDatesFromTrials, syncReplicatedShowDates } from '../deriveShowDatesFromTrials';

describe('deriveShowDatesFromTrials', () => {
  it('one trial: the same day twice', () => {
    expect(deriveShowDatesFromTrials([{ date: '2026-12-12' }])).toEqual({
      startDate: '2026-12-12',
      endDate: '2026-12-12',
    });
  });

  it('several trials: earliest and latest, whatever the order', () => {
    expect(
      deriveShowDatesFromTrials([
        { date: '2026-12-13' },
        { date: '2026-12-11' },
        { date: '2026-12-12' },
      ])
    ).toEqual({ startDate: '2026-12-11', endDate: '2026-12-13' });
  });

  it('ignores soft-deleted trials', () => {
    expect(
      deriveShowDatesFromTrials([
        { date: '2026-12-01', deletedAt: '2026-11-01T00:00:00Z' },
        { date: '2026-12-12' },
      ])
    ).toEqual({ startDate: '2026-12-12', endDate: '2026-12-12' });
  });

  it('no live trial: null', () => {
    expect(deriveShowDatesFromTrials([])).toBeNull();
    expect(deriveShowDatesFromTrials([{ date: '2026-12-01', deletedAt: 'x' }])).toBeNull();
  });
});

describe('syncReplicatedShowDates', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('queues the derived dates when the replicated show disagrees', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ date: '2026-12-12' }, { date: '2026-12-13' }]);
    mocks.getShow.mockResolvedValue({
      startDate: '2026-12-05T00:00:00+00:00',
      endDate: '2026-12-06T00:00:00+00:00',
    });
    await syncReplicatedShowDates('show-1');
    expect(mocks.updateShow).toHaveBeenCalledWith('show-1', {
      startDate: '2026-12-12',
      endDate: '2026-12-13',
    });
  });

  it('does nothing when the show already agrees', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ date: '2026-12-12' }]);
    mocks.getShow.mockResolvedValue({
      startDate: '2026-12-12T00:00:00+00:00',
      endDate: '2026-12-12',
    });
    await syncReplicatedShowDates('show-1');
    expect(mocks.updateShow).not.toHaveBeenCalled();
  });

  it('logs and resolves when the follow-up fails', async () => {
    mocks.getTrialsByShow.mockResolvedValue([{ date: '2026-12-12' }]);
    mocks.getShow.mockResolvedValue({ startDate: '2026-01-01', endDate: '2026-01-01' });
    mocks.updateShow.mockRejectedValue(new Error('boom'));
    await expect(syncReplicatedShowDates('show-1')).resolves.toBeUndefined();
    expect(mocks.reportDebug).toHaveBeenCalled();
  });
});
