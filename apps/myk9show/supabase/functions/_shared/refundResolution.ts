// "Resolve without refund" for a queued refund (Codex round 6 on #2689).
// Deno-free; stripe-approve-refund authorises the caller as a site admin
// (the same path as an approval), then calls this with its service-role rpc.
//
// When a charge is honored another way (an admin fulfills the entries by
// hand), the queued request must be retired, or another admin could still
// approve a full refund afterwards. resolve_refund_request_without_refund
// does it under the request's row lock, with a required note, only while no
// attempt is pending or succeeded. The state is terminal: approval refuses it.

import type { RefundQueueDeps } from './refundRequests.ts';

export type ResolutionResult =
  | { status: 200; body: { outcome: 'resolved' | 'already_resolved' } }
  | { status: 400 | 404 | 409 | 500; body: { error: string } };

export async function resolveRefundRequestWithoutRefund(
  deps: Pick<RefundQueueDeps, 'rpc'>,
  input: { requestId: string; actorAuthUserId: string; note: string }
): Promise<ResolutionResult> {
  const note = input.note.trim();
  if (!note) return { status: 400, body: { error: 'note_required' } };

  const { data, error } = await deps.rpc('resolve_refund_request_without_refund', {
    p_request_id: input.requestId,
    p_actor_auth_user_id: input.actorAuthUserId,
    p_note: note,
  });
  if (error) {
    console.error(`resolve_refund_request_without_refund failed for ${input.requestId}:`, error);
    return { status: 500, body: { error: 'resolve_failed' } };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
  switch (row?.outcome) {
    case 'resolved':
    case 'already_resolved':
      return { status: 200, body: { outcome: row.outcome } };
    case 'not_found':
      return { status: 404, body: { error: 'not_found' } };
    case 'note_required':
      return { status: 400, body: { error: 'note_required' } };
    case 'has_live_attempt':
      return { status: 409, body: { error: 'has_live_attempt' } };
    case 'not_resolvable':
      return { status: 409, body: { error: 'not_resolvable' } };
    default:
      return { status: 500, body: { error: 'resolve_failed' } };
  }
}
