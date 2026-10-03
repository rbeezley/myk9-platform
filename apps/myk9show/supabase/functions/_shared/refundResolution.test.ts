// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveRefundRequestWithoutRefund } from './refundResolution';
import { approveRefundRequest } from './refundApproval';
import { harness } from './refundApprovalTestHarness';

const INPUT = { requestId: 'rr-1', actorAuthUserId: 'admin-uid', note: '  Paid by hand  ' };

function rpcReturning(row: unknown, error: { message: string } | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    deps: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: row === undefined ? [] : [row], error };
      },
    },
  };
}

describe('resolveRefundRequestWithoutRefund (Codex round 6, #2689)', () => {
  it('sends the trimmed note and the acting admin to the locked RPC', async () => {
    const { calls, deps } = rpcReturning({
      outcome: 'resolved',
      request_status: 'resolved_without_refund',
    });
    await expect(resolveRefundRequestWithoutRefund(deps, INPUT)).resolves.toEqual({
      status: 200,
      body: { outcome: 'resolved' },
    });
    expect(calls).toEqual([
      {
        fn: 'resolve_refund_request_without_refund',
        args: { p_request_id: 'rr-1', p_actor_auth_user_id: 'admin-uid', p_note: 'Paid by hand' },
      },
    ]);
  });

  it('requires a note: a blank one never reaches the database', async () => {
    const { calls, deps } = rpcReturning({ outcome: 'resolved' });
    await expect(
      resolveRefundRequestWithoutRefund(deps, { ...INPUT, note: '   ' })
    ).resolves.toEqual({ status: 400, body: { error: 'note_required' } });
    expect(calls).toEqual([]);
  });

  it.each([
    ['already_resolved', { status: 200, body: { outcome: 'already_resolved' } }],
    ['has_live_attempt', { status: 409, body: { error: 'has_live_attempt' } }],
    ['not_resolvable', { status: 409, body: { error: 'not_resolvable' } }],
    ['note_required', { status: 400, body: { error: 'note_required' } }],
    ['not_found', { status: 404, body: { error: 'not_found' } }],
    ['surprise', { status: 500, body: { error: 'resolve_failed' } }],
  ])('maps %s', async (outcome, expected) => {
    const { deps } = rpcReturning({ outcome });
    await expect(resolveRefundRequestWithoutRefund(deps, INPUT)).resolves.toEqual(expected);
  });

  it('a database error is a 500, not a resolution', async () => {
    const { deps } = rpcReturning(undefined, { message: 'boom' });
    await expect(resolveRefundRequestWithoutRefund(deps, INPUT)).resolves.toEqual({
      status: 500,
      body: { error: 'resolve_failed' },
    });
  });
});

describe('approval of a resolved request', () => {
  it('is refused with no Stripe call', async () => {
    const h = harness({ resolved: true });
    await expect(approveRefundRequest(h.deps, INPUT)).resolves.toEqual({
      status: 409,
      body: { error: 'resolved_without_refund' },
    });
    expect(h.created).toHaveLength(0);
    expect(h.pageRequests).toEqual([]);
  });
});
