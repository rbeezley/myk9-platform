/**
 * MYK9-1473: the tie list and the coin flip are server RPCs (online only). Pins the RPC names, the
 * argument names, one call per tie group in the order given, and that a refusal stops the rest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import { readClassTies, recordCoinFlips } from '../classTiesMutations';

beforeEach(() => {
  rpc.mockReset();
});

describe('readClassTies', () => {
  it('groups the rows by the place they share', async () => {
    const row = (entry_id: string, armband_number: string, group_rank: number) => ({
      entry_id,
      armband_number,
      dog_call_name: `Dog ${armband_number}`,
      final_placement: group_rank,
      group_rank,
      total_faults: 0,
      points_earned: 0,
      search_time_seconds: 41.2,
      ranks_by_points: false,
    });
    rpc.mockResolvedValue({
      data: [row('a', '12', 2), row('b', '31', 2), row('c', '40', 4), row('d', '41', 4)],
      error: null,
    });

    const groups = await readClassTies('class-1');

    expect(rpc).toHaveBeenCalledWith('get_class_ties', { p_class_id: 'class-1' });
    expect(groups.map(group => [group.rank, group.entries.map(entry => entry.entryId)])).toEqual([
      [2, ['a', 'b']],
      [4, ['c', 'd']],
    ]);
    expect(groups[0]?.entries[0]).toMatchObject({ armband: '12', dogName: 'Dog 12' });
  });

  it('throws what the server said', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(readClassTies('class-1')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('recordCoinFlips', () => {
  it('calls set_class_tie_order once per group, in order, with exactly these argument names', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    await recordCoinFlips({
      classId: 'class-1',
      orders: [
        ['b', 'a'],
        ['d', 'c', 'e'],
      ],
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_class_tie_order', {
      p_class_id: 'class-1',
      p_entry_ids: ['b', 'a'],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_class_tie_order', {
      p_class_id: 'class-1',
      p_entry_ids: ['d', 'c', 'e'],
    });
  });

  it('stops at the first refused group', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'MK016' } })
      .mockResolvedValue({ data: 3, error: null });

    await expect(
      recordCoinFlips({
        classId: 'class-1',
        orders: [
          ['b', 'a'],
          ['d', 'c'],
        ],
      })
    ).rejects.toMatchObject({ code: 'MK016' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
