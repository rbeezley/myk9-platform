/**
 * MYK9-1473: the coin flip is a server RPC (online only). Pins the RPC name, the argument names, one call per tie group in the order given, and that a refusal stops the rest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));

import { recordCoinFlips } from '../classTiesMutations';

beforeEach(() => {
  rpc.mockReset();
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
