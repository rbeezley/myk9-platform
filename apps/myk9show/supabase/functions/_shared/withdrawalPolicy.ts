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
const DEFAULT_TIMEZONE = 'America/New_York';

export type WithdrawalRefundReason = 'before_cutoff' | 'after_cutoff' | 'no_cutoff' | 'no_policy';

export interface WithdrawalRefundSuggestion {
  refundCents: number;
  retainedCents: number;
  requiresManual: boolean;
  reason: WithdrawalRefundReason;
}

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

function localCalendarDate(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  }
}

export function resolveWithdrawalRefundCents(
  policy: WithdrawalPolicy | null,
  entryFeeCents: number,
  asOf: Date,
  timeZone: string
): WithdrawalRefundSuggestion {
  if (!policy) {
    return {
      refundCents: entryFeeCents,
      retainedCents: 0,
      requiresManual: true,
      reason: 'no_policy',
    };
  }

  if (!policy.cutoffDate) {
    return {
      refundCents: entryFeeCents,
      retainedCents: 0,
      requiresManual: true,
      reason: 'no_cutoff',
    };
  }

  const today = localCalendarDate(asOf, timeZone);
  if (today <= policy.cutoffDate) {
    return {
      refundCents: entryFeeCents,
      retainedCents: 0,
      requiresManual: false,
      reason: 'before_cutoff',
    };
  }

  const rawRetained =
    policy.retentionType === 'percent'
      ? Math.round((entryFeeCents * policy.retentionValue) / 100)
      : policy.retentionValue;
  const retainedCents = Math.min(Math.max(rawRetained, 0), entryFeeCents);

  return {
    refundCents: entryFeeCents - retainedCents,
    retainedCents,
    requiresManual: false,
    reason: 'after_cutoff',
  };
}
