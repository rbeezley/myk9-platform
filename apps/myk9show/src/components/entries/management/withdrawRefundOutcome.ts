import type { WithdrawalRefundSuggestion } from '@/features/payments/withdrawalPolicy';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { isStripeRefundable } from './refundEligibility';

/**
 * MYK9-1615: what the dog-level Withdraw confirm knows about one entry's refund. Every outcome
 * is advisory; refunds are still approved per entry by a person afterwards.
 */
export type WithdrawRefundOutcome =
  | { kind: 'no-online-payment' }
  | { kind: 'checking' }
  | { kind: 'failed' }
  /** The policy cannot give a figure, or the secretary chose to set it when approving. */
  | { kind: 'at-approval'; maxCents: number; chosen: boolean }
  | { kind: 'suggested'; refundCents: number };

export interface RefundPreviewState {
  data: WithdrawalRefundSuggestion | undefined;
  isError: boolean;
  isFetching: boolean;
}

export function entryFeeCents(entry: Pick<EntryManagementEntry, 'totalFee'>): number {
  return Math.round((entry.totalFee ?? 0) * 100);
}

export function resolveWithdrawRefundOutcome(
  entry: EntryManagementEntry,
  preview: RefundPreviewState | undefined,
  refundsAtApproval: boolean
): WithdrawRefundOutcome {
  if (!isStripeRefundable(entry)) return { kind: 'no-online-payment' };
  const maxCents = entryFeeCents(entry);
  if (preview?.data && !preview.isError) {
    return preview.data.requiresManual
      ? { kind: 'at-approval', maxCents, chosen: false }
      : { kind: 'suggested', refundCents: preview.data.refundCents };
  }
  if (preview?.isError && !preview.isFetching) {
    return refundsAtApproval ? { kind: 'at-approval', maxCents, chosen: true } : { kind: 'failed' };
  }
  return { kind: 'checking' };
}

/** Ordinary confirmation waits until no entry is still checking or failed without a choice. */
export function everyOutcomeKnown(outcomes: readonly WithdrawRefundOutcome[]): boolean {
  return outcomes.every(o => o.kind !== 'checking' && o.kind !== 'failed');
}
