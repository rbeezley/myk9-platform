import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedScoreStore, type SavedScore } from './savedScore';

const row = { scoring_completed_at: '2026-11-27T15:00:00Z', check_in_status: 'completed' };

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntryWith: vi.fn(async (_id: string, build: (current: unknown) => unknown) => {
      build(row);
    }),
  },
}));

const { clearEntryScore } = await import('./clearEntryScore');

const juni: SavedScore = {
  entryId: 'juni',
  dogLabel: '101 Juni',
  resultLabel: 'Not qualified',
  timeLabel: null,
  listPath: '/at-show/s/class/c',
  scoreRoute: '/at-show/s/class/c/score/juni',
};

describe('clearEntryScore and the "Saved:" line (MYK9-2518)', () => {
  beforeEach(() => {
    useSavedScoreStore.getState().set(juni);
  });

  it('removes the saved line when the dog it names is reset', async () => {
    await clearEntryScore('juni');
    expect(useSavedScoreStore.getState().saved).toBeNull();
  });

  it('leaves the saved line alone when a different dog is reset', async () => {
    await clearEntryScore('aspen');
    expect(useSavedScoreStore.getState().saved).toEqual(juni);
  });

  it('leaves the saved line alone when the clear is declined', async () => {
    await expect(clearEntryScore('juni', '2026-11-27T16:00:00Z')).resolves.toBe(false);
    expect(useSavedScoreStore.getState().saved).toEqual(juni);
  });
});
