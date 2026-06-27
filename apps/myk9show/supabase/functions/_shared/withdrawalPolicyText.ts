// Resolve + render the effective withdrawal policy as a single disclosure
// STRING, for the Stripe Checkout `custom_text` shown to the actual payer on a
// secretary-generated / waitlist-offer payment link (they never see the myK9
// cart disclosure). Deno-free (colocated vitest).
//
// Mirrors the app-side getEffectiveWithdrawalPolicy + describeWithdrawalPolicy
// (src/features/payments/*). Duplicated across the Deno/app boundary by
// necessity; kept tiny.
//
// See docs/plan-refund-policy-withdrawal.md (Phase 3, D4/D8).

export interface EffectiveWithdrawalPolicy {
  cutoffDate: string | null;
  retentionType: 'flat' | 'percent';
  retentionValue: number | null;
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
): EffectiveWithdrawalPolicy {
  return {
    cutoffDate: cutoff ?? null,
    retentionType: type === 'percent' ? 'percent' : 'flat',
    retentionValue: value ?? null,
    notes: notes ?? null,
  };
}

export function resolveEffectiveWithdrawalPolicy(
  show: ShowWithdrawalColumns | null | undefined,
  club: ClubWithdrawalColumns | null | undefined
): EffectiveWithdrawalPolicy | null {
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

function formatRetained(policy: EffectiveWithdrawalPolicy): string | null {
  const v = policy.retentionValue;
  if (v === null || v === undefined || v <= 0) return null;
  return policy.retentionType === 'percent' ? `${v}%` : `$${(v / 100).toFixed(2)}`;
}

/** A single disclosure string (line + any prose) suitable for Stripe custom_text. */
export function describeWithdrawalPolicyText(policy: EffectiveWithdrawalPolicy | null): string {
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
