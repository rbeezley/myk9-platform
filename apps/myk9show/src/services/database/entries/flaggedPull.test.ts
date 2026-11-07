/**
 * MYK9-1753: the desk's side-read of who flagged a pull, and Clear's server write plus the
 * read-back into the offline copy the desk shows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  calls: [] as Array<[string, ...unknown[]]>,
  result: { data: [] as unknown[] | null, error: null as unknown },
  refreshServerChangedEntries: vi.fn(),
}));

vi.mock('../supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq']) {
    builder[method] = (...args: unknown[]) => {
      h.calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(h.result);
  return {
    supabase: {
      rpc: h.rpc,
      from: (table: string) => {
        h.calls.push(['from', table]);
        return builder;
      },
    },
    createDatabaseError,
  };
});
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { refreshServerChangedEntries: h.refreshServerChangedEntries },
}));

import { clearFlaggedPull, getFlaggedPullSources, sourceForFlag } from './flaggedPull';

describe('getFlaggedPullSources', () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.result = { data: [], error: null };
  });

  it('reads only flagged (not scratched) pulls of the show, keeping known sources', async () => {
    h.result = {
      data: [
        {
          id: 'e1',
          check_in_pulled_by: 'exhibitor',
          updated_at: '2026-07-08T16:00:00.123456+00:00',
        },
        { id: 'e2', check_in_pulled_by: 'staff', updated_at: '2026-07-08T16:01:00+00:00' },
        { id: 'e3', check_in_pulled_by: null, updated_at: '2026-07-08T16:02:00+00:00' },
        { id: 'e4', check_in_pulled_by: 'staff', updated_at: null },
      ],
      error: null,
    };

    const sources = await getFlaggedPullSources('show-1');

    expect([...sources]).toEqual([
      ['e1', { source: 'exhibitor', writtenAt: Date.parse('2026-07-08T16:00:00.123Z') }],
      ['e2', { source: 'staff', writtenAt: Date.parse('2026-07-08T16:01:00Z') }],
    ]);
    expect(h.calls).toEqual([
      ['from', 'entries'],
      ['select', 'id, check_in_pulled_by, updated_at'],
      ['eq', 'show_id', 'show-1'],
      ['eq', 'check_in_status', 'pulled'],
      ['neq', 'entry_status', 'scratched'],
    ]);
  });

  it('throws on a read error, so the desk shows the source as unknown', async () => {
    h.result = { data: null, error: { message: 'permission denied' } };
    await expect(getFlaggedPullSources('show-1')).rejects.toMatchObject({
      message: expect.stringContaining('permission denied'),
    });
  });
});

describe('sourceForFlag', () => {
  const reads = new Map([['e1', { source: 'staff' as const, writtenAt: 1000 }]]);

  it('names the flagger only for the very write it was read from', () => {
    expect(sourceForFlag(reads, 'e1', 1000)).toBe('staff');
    expect(sourceForFlag(reads, 'e1', 999)).toBeUndefined();
    expect(sourceForFlag(reads, 'e1', 1001)).toBeUndefined();
    expect(sourceForFlag(reads, 'e2', 1000)).toBeUndefined();
  });
});

describe('clearFlaggedPull', () => {
  beforeEach(() => {
    h.rpc.mockReset();
    h.refreshServerChangedEntries.mockReset();
  });

  it('asks the database to clear, reads the row back into the replica, and returns the status', async () => {
    h.rpc.mockResolvedValue({ data: 'checked-in', error: null });

    await expect(clearFlaggedPull('e1')).resolves.toBe('checked-in');
    expect(h.rpc).toHaveBeenCalledWith('clear_flagged_pull', { p_entry_id: 'e1' });
    expect(h.refreshServerChangedEntries).toHaveBeenCalledWith(['e1'], {
      insert: 'if-show-loaded',
      reason: 'flagged pull cleared by the server',
    });
  });

  it('throws on a refusal and touches nothing else', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: 'no longer flagged pulled' } });

    await expect(clearFlaggedPull('e1')).rejects.toMatchObject({
      message: expect.stringContaining('no longer flagged pulled'),
    });
    expect(h.refreshServerChangedEntries).not.toHaveBeenCalled();
  });
});
