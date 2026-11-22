import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
}));

import { denyPullRefundDecision, isRefundDecisionRpcMissing } from './denyPullRefundDecision';

describe('denyPullRefundDecision', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sends the guarded denial decision to the migration-backed RPC', async () => {
    rpc.mockResolvedValue({ error: null });

    await expect(
      denyPullRefundDecision('entry-1', '  Past the refund deadline.  ')
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('set_entry_refund_decision', {
      p_entry_id: 'entry-1',
      p_decision: 'denied',
      p_reason: 'Past the refund deadline.',
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

    await expect(denyPullRefundDecision('entry-1', 'Late')).rejects.toBe(error);
  });

  it('does not hide unrelated authorization errors', async () => {
    const error = { code: '42501', message: 'not authorized' };
    rpc.mockResolvedValue({ error });

    await expect(denyPullRefundDecision('entry-1', 'Late')).rejects.toBe(error);
  });
});

// MYK9-2293: a missing signature means this tab predates a schema change; the caller asks for a restart.
describe('isRefundDecisionRpcMissing', () => {
  it('reads a missing function from PostgREST or Postgres as a stale tab', () => {
    expect(isRefundDecisionRpcMissing({ code: 'PGRST202', message: 'schema cache' })).toBe(true);
    expect(isRefundDecisionRpcMissing({ code: '42883', message: 'function does not exist' })).toBe(
      true
    );
  });

  it('leaves every other failure alone', () => {
    expect(isRefundDecisionRpcMissing({ code: '42501', message: 'not authorized' })).toBe(false);
    expect(isRefundDecisionRpcMissing({ code: '22023', message: 'needs a reason' })).toBe(false);
    expect(isRefundDecisionRpcMissing(new Error('network'))).toBe(false);
    expect(isRefundDecisionRpcMissing(null)).toBe(false);
  });
});
