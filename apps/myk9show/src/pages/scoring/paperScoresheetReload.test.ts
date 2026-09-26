import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoringEntry } from './types';

const load = vi.hoisted(() => vi.fn());
vi.mock('./paperScoresheetData', () => ({ loadEntriesWithDogs: load }));

import { reloadEntriesAfterSave } from './paperScoresheetReload';

const current = [{ entryId: 'e1', isScored: false }] as unknown as ScoringEntry[];

/**
 * MYK9-774: the class read now throws on a failed device read. The reload runs
 * after a save has landed, so the throw used to escape as if the save failed
 * and "save and next" stopped advancing.
 */
describe('reloadEntriesAfterSave', () => {
  // Braced: a function returned from beforeEach runs as a cleanup hook, and
  // mockReset() returns the mock itself.
  beforeEach(() => {
    load.mockReset();
  });

  it('keeps the current list and reports no refresh when the device read fails', async () => {
    load.mockRejectedValue(new Error('Could not read entries on this device'));

    await expect(reloadEntriesAfterSave('class-1', current)).resolves.toEqual({
      entries: current,
      refreshed: false,
    });
  });

  it('returns the fresh list when the read succeeds', async () => {
    load.mockResolvedValue([]);

    await expect(reloadEntriesAfterSave('class-1', current)).resolves.toEqual({
      entries: [],
      refreshed: true,
    });
    expect(load).toHaveBeenCalledWith('class-1');
  });
});
