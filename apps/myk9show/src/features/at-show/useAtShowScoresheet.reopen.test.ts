import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from '@myk9/replication';
import type { ScoreData } from '@myk9/scoring-ui';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { spyOnWriteAndQueue } from '@/test/utils/spyOnWriteAndQueue';
import { useAtShowScoresheet } from './useAtShowScoresheet';

const mocks = vi.hoisted(() => ({ getClassById: vi.fn(), getTrialById: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: mocks.getClassById, sync: vi.fn(), subscribe: vi.fn(() => () => {}) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: mocks.getTrialById, sync: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/hooks/useReplicationSync', () => ({ useReplicationSync: () => ({ status: {} }) }));
vi.mock('@/hooks/useScoresheetRingMove', () => {
  const ringMove = { opened: vi.fn(), start: vi.fn(), scored: vi.fn() };
  return { useScoresheetRingMove: () => ringMove };
});
vi.mock('@/utils/checkInTransitions', () => ({ transitionToCompleted: vi.fn() }));
vi.mock('./staleClass/checkStaleClass', () => ({ checkForStaleClass: vi.fn() }));
vi.mock('./cancelledClassGuard', () => ({
  CANCELLED_CLASS_MESSAGE: 'cancelled',
  useIsClassCancelled: () => false,
}));
vi.mock('./atShowClassCompletion', () => ({
  isCurrentFinalPendingEntry: vi.fn().mockResolvedValue(false),
  recordCompletionIntentIfConfirmed: vi.fn(),
}));
vi.mock('@/pages/scoring/liveScoringBreed', () => ({
  resolveLiveScoringBreed: vi.fn().mockResolvedValue(null),
}));

const saved: ScoreData = {
  resultText: 'Q',
  searchTime: '0:04.35',
  areas: { 'area 1': '0:04.35 NOT FOUND INCORRECT' },
  areaTimes: ['0:04.35'],
  correctCount: 0,
  incorrectCount: 1,
  faultCount: 1,
  finishCallErrors: 0,
  points: 0,
};

describe('reopening a saved score from the device (MYK9-2006)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
    spyOnWriteAndQueue(replicatedEntriesTable).queue.mockResolvedValue('mutation-1');
    mocks.getClassById.mockResolvedValue({ id: 'class-1', trialId: 'trial-1', name: 'Container Novice A', element: 'Container', level: 'Novice' });
    mocks.getTrialById.mockResolvedValue({ id: 'trial-1', date: '2026-11-14' });
    await replicatedEntriesTable.set(
      'entry-1',
      { id: 'entry-1', classId: 'class-1', showId: 'show-1', armband: '101', status: 'registered', dog_call_name: 'Rex' },
      false, undefined, undefined, { allowColdInsert: 'fixture' }
    );
  });

  it('offline, straight after saving, reload carries the saved score', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const onScored = vi.fn();
    const { result } = renderHook(() =>
      useAtShowScoresheet({ showId: 'show-1', classId: 'class-1', entryId: 'entry-1', onScored })
    );
    await waitFor(() => expect(result.current.classInfo).not.toBeNull());
    expect(result.current.entry?.existingScore).toBeUndefined();
    await act(async () => {
      await result.current.submit(saved);
    });
    expect(onScored).toHaveBeenCalled();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.entry?.existingScore).toBeDefined());
    expect(result.current.entry?.existingScore).toMatchObject({
      resultText: 'Q', searchTime: '0:04.35', areaTimes: ['0:04.35'], faultCount: 1,
    });
  });
});
