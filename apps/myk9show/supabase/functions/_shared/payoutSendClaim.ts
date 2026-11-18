// MYK9-2170 payout brake: the payout run's only way to put a show's payout into
// 'processing'. claim_show_payout_for_send (SQL) reads the brake in the same
// transaction and decides; this module only calls it and reads the answer.
// Anything it cannot read as a claim is "send nothing" (fail closed).

export type PayoutClaimOutcome =
  'claimed' | 'awaiting_approval' | 'approval_reset' | 'held' | 'busy' | 'account_mismatch';

export interface PayoutClaim {
  outcome: PayoutClaimOutcome;
  payoutId: string | null;
  /** Set when the claimed row was approved: the most this send may be. */
  approvedAmountCents: number | null;
}

export interface PayoutClaimClient {
  rpc(
    fn: 'claim_show_payout_for_send',
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export interface PayoutClaimRequest {
  showId: string;
  accountId: string;
  destination: string;
  amountCents: number;
}

const OUTCOMES: readonly PayoutClaimOutcome[] = [
  'claimed',
  'awaiting_approval',
  'approval_reset',
  'held',
  'busy',
  'account_mismatch',
];

function isOutcome(value: unknown): value is PayoutClaimOutcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

/** Returns null when the claim could not be read; the caller sends nothing. */
export async function claimShowPayoutForSend(
  client: PayoutClaimClient,
  request: PayoutClaimRequest
): Promise<PayoutClaim | null> {
  const { data, error } = await client.rpc('claim_show_payout_for_send', {
    p_show_id: request.showId,
    p_account_id: request.accountId,
    p_destination: request.destination,
    p_amount_cents: request.amountCents,
  });
  if (error || !data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  if (!isOutcome(raw.outcome)) return null;
  const payoutId = typeof raw.payout_id === 'string' ? raw.payout_id : null;
  const approved = raw.approved_amount_cents;
  const claim: PayoutClaim = {
    outcome: raw.outcome,
    payoutId,
    approvedAmountCents:
      typeof approved === 'number' && Number.isFinite(approved) ? approved : null,
  };
  if (claim.outcome === 'claimed' && !claim.payoutId) return null;
  return claim;
}

/** An approved payout recalculated after the claim may never send more than was approved. */
export function exceedsApproval(claim: PayoutClaim, finalAmountCents: number): boolean {
  return claim.approvedAmountCents !== null && finalAmountCents > claim.approvedAmountCents;
}
