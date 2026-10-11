/**
 * MYK9-1011: a judge's DQ reaches the replicated row as the stored value
 * 'disqualified' with its reason. Unlike useOptimisticScoring.test.ts this does
 * NOT mock the result mapping, so it exercises the real scoresheet-code ->
 * result_status step that decides what is written (assertion-first).
 */

import { renderHook, act } from '@testing-library/react';
import { useOptimisticScoring } from './useOptimisticScoring';

const updateEntry = vi.fn();

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => updateEntry(...args),
  },
}));

vi.mock('@/store/scoringStore', () => ({
  useScoringStore: () => ({ submitScore: vi.fn() }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

function options(resultText: string, nonQualifyingReason?: string) {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    armband: 42,
    className: 'Novice A',
    scoreData: {
      resultText,
      searchTime: '0:00.00',
      faultCount: 0,
      ...(nonQualifyingReason ? { nonQualifyingReason } : {}),
    },
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };
}

describe('useOptimisticScoring: Disqualified', () => {
  beforeEach(() => {
    updateEntry.mockReset();
    updateEntry.mockResolvedValue('mutation-1');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('writes result_status disqualified with the judge reason, scored', async () => {
    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(
        options('DQ', 'Attacked a person in the search area')
      );
    });

    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(updateEntry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        result_status: 'disqualified',
        resultStatus: 'disqualified',
        is_scored: true,
        disqualification_reason: 'Attacked a person in the search area',
      })
    );
  });

  it('writes excused, not disqualified, for an Excused result', async () => {
    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(options('EX', 'Handler Request'));
    });

    expect(updateEntry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ result_status: 'excused', resultStatus: 'excused' })
    );
  });
});
