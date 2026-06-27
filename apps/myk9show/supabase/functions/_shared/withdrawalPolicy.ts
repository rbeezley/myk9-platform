// Server-side (Deno) resolution + disclosure rendering of the effective
// withdrawal policy. ONE module for both server uses:
//   - the webhook SNAPSHOTS resolveWithdrawalPolicy(show, club) onto an entry at
//     payment time (Phase 3b, D3);
//   - the payment-link function renders describeWithdrawalPolicyText(...) into
//     the Stripe Checkout custom_text the payer sees (Phase 3a, D4/D8).
//
// Both used to live in two near-identical files (withdrawalSnapshot.ts +
// withdrawalPolicyText.ts) with the same shape under two names; consolidated
// here so there is one give-up-policy contract on the server. Mirrors the
// app-side getEffectiveWithdrawalPolicy + describeWithdrawalPolicy
// (src/features/payments/*) — still duplicated across the Deno/app boundary by
// necessity (Deno can't import app `src`), but kept to a single server copy.
//
// See docs/plan-refund-policy-withdrawal.md (Phase 3, D3/D4/D8).

export interface WithdrawalPolicy {
  cutoffDate: string | null;
  retentionType: 'flat' | 'percent';
  // Normalized to a required number (0 when unset) so the server policy mirrors
  // the app policy contract exactly — readers must not special-case null vs 0.
  retentionValue: number;
  notes: string | null;
}

export interface ShowWithdrawalColumns {
  withdrawal_cutoff_date?: string | null;
  withdrawal_retention_type?: string | null;
  withdrawal_retention_value?: number | null;
  withdrawal_policy_notes?: string | null;
}

export interface ClubWithdrawalColumns {
  default_withdrawal_cutoff_date?: string | null;
  default_withdrawal_retention_type?: string | null;
  default_withdrawal_retention_value?: number | null;
  default_withdrawal_policy_notes?: string | null;
}

const SERVICE_FEE_SENTENCE = 'Service fees are non-refundable.';

function hasAny(...values: Array<string | number | null | undefined>): boolean {
  return values.some(v => v !== null && v !== undefined);
}

function build(
  cutoff: string | null | undefined,
  type: string | null | undefined,
  value: number | null | undefined,
  notes: string | null | undefined
): WithdrawalPolicy {
  return {
    cutoffDate: cutoff ?? null,
    retentionType: type === 'percent' ? 'percent' : 'flat',
    retentionValue: value ?? 0,
    notes: notes ?? null,
  };
}

/**
 * Resolve the effective policy from a show row (override) + its club row
 * (default): a show override (any field set) wins over the club default;
 * neither declared → null.
 */
export function resolveWithdrawalPolicy(
  show: ShowWithdrawalColumns | null | undefined,
  club: ClubWithdrawalColumns | null | undefined
): WithdrawalPolicy | null {
  if (
    show &&
    hasAny(
      show.withdrawal_cutoff_date,
      show.withdrawal_retention_type,
      show.withdrawal_retention_value,
      show.withdrawal_policy_notes
    )
  ) {
    return build(
      show.withdrawal_cutoff_date,
      show.withdrawal_retention_type,
      show.withdrawal_retention_value,
      show.withdrawal_policy_notes
    );
  }

  if (
    club &&
    hasAny(
      club.default_withdrawal_cutoff_date,
      club.default_withdrawal_retention_type,
      club.default_withdrawal_retention_value,
      club.default_withdrawal_policy_notes
    )
  ) {
    return build(
      club.default_withdrawal_cutoff_date,
      club.default_withdrawal_retention_type,
      club.default_withdrawal_retention_value,
      club.default_withdrawal_policy_notes
    );
  }

  return null;
}

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

/** A single disclosure string (line + any prose) suitable for Stripe custom_text. */
export function describeWithdrawalPolicyText(policy: WithdrawalPolicy | null): string {
  if (!policy) {
    return `Refund policy: contact the club. ${SERVICE_FEE_SENTENCE}`;
  }

  const notes = policy.notes?.trim() ? policy.notes.trim() : null;
  const withNotes = (line: string) => (notes ? `${line} ${notes}` : line);

  if (!policy.cutoffDate) {
    return withNotes(SERVICE_FEE_SENTENCE);
  }

  const retained = formatRetained(policy);
  if (!retained) {
    return withNotes(`Full refund of the entry fee. ${SERVICE_FEE_SENTENCE}`);
  }

  return withNotes(
    `Full refund of the entry fee until ${formatCutoff(
      policy.cutoffDate
    )}; after that, ${retained} is kept. ${SERVICE_FEE_SENTENCE}`
  );
}
