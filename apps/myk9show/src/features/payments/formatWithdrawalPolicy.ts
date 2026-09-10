/**
 * Pure formatter that turns a resolved WithdrawalPolicy into the exhibitor-
 * facing disclosure shown BEFORE payment. Kept separate from the component so
 * the copy — the actual product of this feature — is unit-tested directly.
 *
 * See docs/plan-refund-policy-withdrawal.md (Phase 3, D4, D8).
 */

import type { WithdrawalPolicy } from './withdrawalPolicy';

export interface WithdrawalPolicyDescription {
  /** The main one-line disclosure sentence. Always present. */
  refundLine: string;
  /** Free-text policy notes (multi-tier / unusual policies), if any. */
  notes: string | null;
}

const SERVICE_FEE_SENTENCE = 'Service fees are non-refundable.';

/** 'YYYY-MM-DD' → 'June 1, 2026'. Formatted in UTC so the displayed day can't
 *  drift by one from a local-timezone parse of the bare date. */
function formatCutoff(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatRetained(policy: WithdrawalPolicy): string | null {
  const v = policy.retentionValue;
  if (v === null || v === undefined || v <= 0) return null;
  return policy.retentionType === 'percent' ? `${v}%` : `$${(v / 100).toFixed(2)}`;
}

export function describeWithdrawalPolicy(
  policy: WithdrawalPolicy | null
): WithdrawalPolicyDescription {
  // Unset (D8): never blank — a neutral, honest default.
  if (!policy) {
    return {
      refundLine: `Refund policy: contact the club. ${SERVICE_FEE_SENTENCE}`,
      notes: null,
    };
  }

  const notes = policy.notes?.trim() ? policy.notes.trim() : null;

  // Prose-only (no structured cutoff): the notes govern; still disclose fees.
  if (!policy.cutoffDate) {
    return { refundLine: SERVICE_FEE_SENTENCE, notes };
  }

  const retained = formatRetained(policy);

  // Cutoff with no retention is effectively a full refund regardless of date —
  // don't imply a deadline that changes nothing. But only SAY "full refund"
  // when there is no prose to contradict it: a club's multi-tier note appended
  // to that sentence read "Full refund of the entry fee. … then 50% until 7
  // days out" in one breath, and that string is the payer's pre-payment
  // disclosure and the entry's frozen snapshot. With prose present the notes
  // govern, exactly as in the no-cutoff branch above.
  if (!retained) {
    return notes
      ? { refundLine: SERVICE_FEE_SENTENCE, notes }
      : { refundLine: `Full refund of the entry fee. ${SERVICE_FEE_SENTENCE}`, notes };
  }

  return {
    refundLine: `Full refund of the entry fee until ${formatCutoff(
      policy.cutoffDate
    )}; after that, ${retained} is kept. ${SERVICE_FEE_SENTENCE}`,
    notes,
  };
}
