import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoringEntry } from './types';

const load = vi.hoisted(() => vi.fn());
vi.mock('./paperScoresheetData', () => ({ loadEntriesWithDogs: load }));

import { reloadEntriesAfterSave } from './paperScoresheetReload';
import { sortByExhibitorOrder } from './paper-scoring-types';

const dog = (entryId: string, exhibitorOrder: number, isScored = false) =>
  ({ entryId, exhibitorOrder, isScored, status: isScored ? 'scored' : 'pending' }) as ScoringEntry;

const nextUnscored = (entries: ScoringEntry[], current: string) =>
  sortByExhibitorOrder(entries).find(e => !e.isScored && e.entryId !== current)?.entryId;

/**
 * MYK9-774: the class read now throws on a failed device read. The reload runs
 * after a save has landed, so the throw used to escape as if the save failed
 * and "save and next" stopped advancing. The fallback keeps the list but must
 * record the landed change, or the judge is routed back to a scored dog.
 */
describe('reloadEntriesAfterSave', () => {
  // Braced: a function returned from beforeEach runs as a cleanup hook, and
  // mockReset() returns the mock itself (MYK9-787).
  beforeEach(() => {
    load.mockReset();
  });

  it('marks the saved dog scored when the device read fails', async () => {
    load.mockRejectedValue(new Error('Could not read entries on this device'));

    const { entries, refreshed } = await reloadEntriesAfterSave(
      'class-1',
      [dog('a', 1), dog('b', 2)],
      { entryId: 'a', scored: true }
    );

    expect(refreshed).toBe(false);
    expect(entries.map(e => [e.entryId, e.isScored, e.status])).toEqual([
      ['a', true, 'scored'],
      ['b', false, 'pending'],
    ]);
  });

  it('never routes save-and-next back to a scored dog while the refresh keeps failing', async () => {
    load.mockRejectedValue(new Error('Could not read entries on this device'));
    let list = [dog('a', 1), dog('b', 2), dog('c', 3)];

    ({ entries: list } = await reloadEntriesAfterSave('class-1', list, {
      entryId: 'a',
      scored: true,
    }));
    expect(nextUnscored(list, 'a')).toBe('b');

    ({ entries: list } = await reloadEntriesAfterSave('class-1', list, {
      entryId: 'b',
      scored: true,
    }));
    expect(nextUnscored(list, 'b')).toBe('c');
  });

  it('marks a cleared dog unscored when the device read fails', async () => {
    load.mockRejectedValue(new Error('Could not read entries on this device'));

    const { entries } = await reloadEntriesAfterSave('class-1', [dog('a', 1, true)], {
      entryId: 'a',
      scored: false,
    });

    expect(entries[0]).toMatchObject({ isScored: false, status: 'pending' });
  });

  it('returns the fresh list when the read succeeds', async () => {
    load.mockResolvedValue([]);

    await expect(
      reloadEntriesAfterSave('class-1', [dog('a', 1)], { entryId: 'a', scored: true })
    ).resolves.toEqual({ entries: [], refreshed: true });
    expect(load).toHaveBeenCalledWith('class-1');
  });
});
