import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = vi.hoisted(() => vi.fn());
vi.mock('./paperScoresheetData', () => ({ loadEntriesWithDogs: load }));

import { refreshEntriesAfterSave } from './paperScoresheetReload';

/**
 * MYK9-774: the class read now throws on a failed device read. The refresh
 * runs after a save has landed; a failure is reported as null so the page
 * pauses scoring instead of letting the judge act on the stale list.
 */
describe('refreshEntriesAfterSave', () => {
  // Braced: a function returned from beforeEach runs as a cleanup hook, and
  // mockReset() returns the mock itself (MYK9-787).
  beforeEach(() => {
    load.mockReset();
  });

  it('answers null when the device read fails', async () => {
    load.mockRejectedValue(new Error('Could not read entries on this device'));

    await expect(refreshEntriesAfterSave('class-1')).resolves.toBeNull();
  });

  it('returns the fresh list when the read succeeds', async () => {
    load.mockResolvedValue([]);

    await expect(refreshEntriesAfterSave('class-1')).resolves.toEqual([]);
    expect(load).toHaveBeenCalledWith('class-1');
  });
});
