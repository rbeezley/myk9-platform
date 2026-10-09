import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAllOrThrow } = vi.hoisted(() => ({ getAllOrThrow: vi.fn() }));
vi.mock('./ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: { getAllOrThrow },
}));

import { overlayPendingPeople } from './pendingPeopleOverlay';

describe('overlayPendingPeople (MYK9-1071 round 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a refetch keeps a queued edit instead of the old server values', async () => {
    getAllOrThrow.mockResolvedValue([
      {
        id: 'p1',
        firstName: 'Patricia',
        lastName: 'Owner',
        city: 'Edison',
        status: 'active',
        _syncStatus: 'pending',
      },
      { id: 'p2', firstName: 'Sam', lastName: 'Clean', status: 'active', _syncStatus: 'synced' },
    ]);
    const rows = await overlayPendingPeople([
      { id: 'p1', firstName: 'Pat', lastName: 'Owner', name: 'Pat Owner', city: 'Old' },
      { id: 'p2', firstName: 'Server', lastName: 'Value', name: 'Server Value' },
    ]);
    expect(rows).toEqual([
      {
        id: 'p1',
        firstName: 'Patricia',
        lastName: 'Owner',
        name: 'Patricia Owner',
        city: 'Edison',
      },
      { id: 'p2', firstName: 'Server', lastName: 'Value', name: 'Server Value' },
    ]);
  });

  it('an unreadable replica overlays nothing', async () => {
    getAllOrThrow.mockRejectedValue(new Error('idb'));
    const rows = [{ id: 'p1', firstName: 'Pat' }];
    expect(await overlayPendingPeople(rows)).toBe(rows);
  });
});
