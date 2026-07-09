/**
 * Fail-closed durability tests for useOptimisticScoring.
 *
 * The invariant under test: a judge's score submit MUST NOT report success
 * (onSuccess / navigation) unless the score was durably queued. If the queue
 * write throws (overflow, IDB/quota failure, entry missing) or returns a null
 * mutation id (no MutationManager wired), the submit must fail closed —
 * onError fires, onSuccess does not, and the local session is not written.
 *
 * Assertion-first (per CLAUDE.md): these assertions describe the fixed
 * behavior; before the fix, updateEntry failures were swallowed and onSuccess
 * fired anyway.
 */

import { renderHook, act } from '@testing-library/react';
import { useOptimisticScoring } from './useOptimisticScoring';

const updateEntry = vi.fn();
const addScoreToSession = vi.fn();

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => updateEntry(...args),
  },
}));

vi.mock('@/store/scoringStore', () => ({
  useScoringStore: () => ({ submitScore: addScoreToSession }),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock('@/utils/scoringMappings', () => ({
  mapQualificationToResultStatus: (r: string) => (r === 'Qualified' ? 'qualified' : 'nq'),
}));

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    armband: 42,
    className: 'Novice A',
    scoreData: { resultText: 'Qualified', searchTime: '0:45.00', faultCount: 0 },
    onSuccess: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe('useOptimisticScoring — fail-closed durability', () => {
  beforeEach(() => {
    updateEntry.mockReset();
    addScoreToSession.mockReset();
    // Force the online branch so the no-op serverUpdate resolves to success.
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('does NOT call onSuccess when the queue write throws (e.g. queue overflow)', async () => {
    updateEntry.mockRejectedValue(new Error('Mutation queue is full (1000)'));
    const opts = baseOptions();

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    expect(opts.onSuccess).not.toHaveBeenCalled();
    expect(opts.onError).toHaveBeenCalledTimes(1);
    expect((opts.onError.mock.calls[0][0] as Error).message).toContain('queue is full');
    // Score was not durably saved → do not write the local session either.
    expect(addScoreToSession).not.toHaveBeenCalled();
  });

  it('does NOT call onSuccess when updateEntry returns a null mutation id', async () => {
    updateEntry.mockResolvedValue(null);
    const opts = baseOptions();

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    expect(opts.onSuccess).not.toHaveBeenCalled();
    expect(opts.onError).toHaveBeenCalledTimes(1);
    expect(addScoreToSession).not.toHaveBeenCalled();
  });

  it('calls onSuccess only when the queue returns a real mutation id', async () => {
    updateEntry.mockResolvedValue('mutation-123');
    const opts = baseOptions();

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    expect(opts.onError).not.toHaveBeenCalled();
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);
    expect(addScoreToSession).toHaveBeenCalledTimes(1);
  });

  // Audit M3: full multi-area detail must reach the whitelisted ringside columns,
  // not just the 5 summary fields. Assertion-first — pins the exact column names
  // and values the write carries.
  it('persists the full multi-area ScoreData to the whitelisted ringside columns', async () => {
    updateEntry.mockResolvedValue('mutation-456');
    const opts = baseOptions({
      scoreData: {
        resultText: 'Qualified',
        searchTime: '1:30.00',
        faultCount: 2,
        areaTimes: ['0:45.00', '0:30.00', '0:15.00'],
        correctCount: 3,
        incorrectCount: 1,
        finishCallErrors: 0,
        points: 95,
        nonQualifyingReason: undefined,
      },
    });

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    expect(updateEntry).toHaveBeenCalledTimes(1);
    const payload = updateEntry.mock.calls[0][1] as Record<string, unknown>;
    // Per-area times converted from M:SS.ss to seconds.
    expect(payload.area1_time_seconds).toBe(45);
    expect(payload.area2_time_seconds).toBe(30);
    expect(payload.area3_time_seconds).toBe(15);
    // Only 3 areas supplied → the 4th is written as null (authoritative full
    // submit), not omitted, so a dropped area can't leave a stale time.
    expect(payload.area4_time_seconds).toBeNull();
    // Counts + points mapped to their DB column names.
    expect(payload.total_correct_finds).toBe(3);
    expect(payload.total_incorrect_finds).toBe(1);
    expect(payload.no_finish_count).toBe(0);
    expect(payload.points_earned).toBe(95);
  });

  // Rescore correcting nonzero detail down to 0 must WRITE 0, not omit it (which
  // would leave the cached nonzero value to re-upload stale). audit/Codex P2.
  it('writes an explicit 0 detail value on a rescore (does not drop it)', async () => {
    updateEntry.mockResolvedValue('mutation-789');
    const opts = baseOptions({
      scoreData: {
        resultText: 'Qualified',
        searchTime: '1:00.00',
        faultCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        finishCallErrors: 0,
        points: 0,
      },
    });

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    const payload = updateEntry.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.total_correct_finds).toBe(0);
    expect(payload.total_incorrect_finds).toBe(0);
    expect(payload.no_finish_count).toBe(0);
    expect(payload.points_earned).toBe(0);
  });

  // Rescore NQ/DQ → Qualified must CLEAR the old reason (write null), not omit it
  // and leave the stale reason on the entry/reports. Codex P2.
  it('clears disqualification_reason (null) when rescoring to qualified', async () => {
    updateEntry.mockResolvedValue('mutation-q');
    const opts = baseOptions({
      scoreData: { resultText: 'Qualified', searchTime: '0:45.00', faultCount: 0 },
    });

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    const payload = updateEntry.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toHaveProperty('disqualification_reason', null);
  });

  it('writes the disqualification_reason when the score is non-qualifying', async () => {
    updateEntry.mockResolvedValue('mutation-nq');
    const opts = baseOptions({
      scoreData: {
        resultText: 'NQ',
        searchTime: '0:45.00',
        faultCount: 0,
        nonQualifyingReason: 'Missed hide',
      },
    });

    const { result } = renderHook(() => useOptimisticScoring());
    await act(async () => {
      await result.current.submitScoreOptimistically(opts);
    });

    const payload = updateEntry.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.disqualification_reason).toBe('Missed hide');
  });
});
