import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

import { denyPullRefundDecision } from './denyPullRefundDecision';

describe('denyPullRefundDecision', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends the guarded denial decision to the migration-backed RPC', async () => {
    rpc.mockResolvedValue({ error: null });

    await expect(denyPullRefundDecision('entry-1')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('set_entry_refund_decision', {
      p_entry_id: 'entry-1',
      p_decision: 'denied',
    });
  });

  // 20260722160000 is applied; MYK9-654 retired the "RPC not deployed yet"
  // arm, so a missing function is an ordinary failure the caller surfaces.
  it('throws when the RPC cannot be found, rather than reporting it unavailable', async () => {
    const error = {
      code: 'PGRST202',
      message: 'Could not find the function public.set_entry_refund_decision in the schema cache',
    };
    rpc.mockResolvedValue({ error });

    await expect(denyPullRefundDecision('entry-1')).rejects.toBe(error);
  });

  it('does not hide unrelated authorization errors', async () => {
    const error = { code: '42501', message: 'not authorized' };
    rpc.mockResolvedValue({ error });

    await expect(denyPullRefundDecision('entry-1')).rejects.toBe(error);
  });
});
