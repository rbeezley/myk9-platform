/**
 * Withdrawal refund policy — pure resolution + suggested-amount selectors.
 *
 * Policy is declared club-default / show-override (mirrors migration 114's
 * judge-day-capacity default+override). These are NOT React hooks — they are
 * pure, synchronous functions with defensive defaults so a row that predates
 * the migration (or a never-configured club) never crashes a caller.
 *
 * The system INFORMS, it does not automate: `resolveWithdrawalRefundCents`
 * returns a *suggested* amount the secretary can override one-click. See
 * docs/plan-refund-policy-withdrawal.md (D2, D5, D7, D8).
 */

const DEFAULT_TIMEZONE = 'America/New_York';

export type RetentionType = 'flat' | 'percent';

export interface WithdrawalPolicy {
  /** ISO 'YYYY-MM-DD'. Full refund on or before this calendar day (show tz). NULL = prose governs. */
  cutoffDate: string | null;
  /** What is kept AFTER the cutoff. */
  retentionType: RetentionType;
  /** flat = cents per entry; percent = whole-number percent. */
  retentionValue: number;
  /** Free-text escape hatch for multi-tier / unusual policies. */
  notes: string | null;
}

/**
 * Subset of the `clubs` row carrying the default withdrawal policy.
 *
 * MYK9-454: there is deliberately NO cutoff date here. A cutoff is an absolute
 * calendar date, which is only meaningful anchored to one show's entry-close
 * date. As a club-wide default it governs every future show, and the day after
 * it passes every inheriting show resolves `after_cutoff` and keeps the office
 * fee with `requiresManual: false` — a confidently wrong refund. Clubs declare
 * retention + prose; the date is per show.
 */
export interface ClubWithdrawalFields {
  default_withdrawal_retention_type?: string | null;
  default_withdrawal_retention_value?: number | null;
  default_withdrawal_policy_notes?: string | null;
}

/** Subset of the `shows` row carrying the (optional) per-show override. */
export interface ShowWithdrawalFields {
  withdrawal_cutoff_date?: string | null;
  withdrawal_retention_type?: string | null;
  withdrawal_retention_value?: number | null;
  withdrawal_policy_notes?: string | null;
}

export type WithdrawalRefundReason =
  | 'before_cutoff'
  | 'after_cutoff'
  | 'no_cutoff' // policy exists but is prose-only
  | 'no_policy'; // nothing declared at either level

export interface WithdrawalRefundSuggestion {
  refundCents: number;
  retainedCents: number;
  /** True when the system can't compute a confident amount — secretary decides. */
  requiresManual: boolean;
  reason: WithdrawalRefundReason;
}

function normalizeRetentionType(raw: string | null | undefined): RetentionType {
  return raw === 'percent' ? 'percent' : 'flat';
}

function buildPolicy(
  cutoff: string | null | undefined,
  type: string | null | undefined,
  value: number | null | undefined,
  notes: string | null | undefined
): WithdrawalPolicy {
  return {
    cutoffDate: cutoff ?? null,
    retentionType: normalizeRetentionType(type),
    retentionValue: value ?? 0,
    notes: notes ?? null,
  };
}

function hasAnyField(...values: Array<string | number | null | undefined>): boolean {
  return values.some(v => v !== null && v !== undefined);
}

/**
 * Resolve the effective policy by composing the two levels PER FIELD: each show
 * field wins where the show declares one, and falls back to the club default
 * where it does not. If neither level declares anything, returns null (unset →
 * the caller shows the neutral default message and flags the refund manual).
 *
 * Per-field, not all-or-nothing (Codex review of #2156). Once the cutoff became
 * show-only, an all-or-nothing choice made club retention unreachable: a show
 * declaring only its cutoff dropped the club's office fee along with it and
 * refunded in full at `requiresManual: false`. Composing also makes true what
 * the editor has always promised — "leave blank to inherit the club default".
 */
export function getEffectiveWithdrawalPolicy(
  show: ShowWithdrawalFields | null | undefined,
  club: ClubWithdrawalFields | null | undefined
): WithdrawalPolicy | null {
  const showDeclares =
    !!show &&
    hasAnyField(
      show.withdrawal_cutoff_date,
      show.withdrawal_retention_type,
      show.withdrawal_retention_value,
      show.withdrawal_policy_notes
    );
  const clubDeclares =
    !!club &&
    hasAnyField(
      club.default_withdrawal_retention_type,
      club.default_withdrawal_retention_value,
      club.default_withdrawal_policy_notes
    );

  if (!showDeclares && !clubDeclares) return null;

  // Retention is a PAIR — the editor nulls type and value together — so the
  // show overrides the club's fee only when it declares one of its own.
  const showDeclaresRetention = hasAnyField(
    show?.withdrawal_retention_type,
    show?.withdrawal_retention_value
  );

  return buildPolicy(
    // The cutoff is show-only (MYK9-454): clubs no longer carry one.
    show?.withdrawal_cutoff_date ?? null,
    showDeclaresRetention
      ? show?.withdrawal_retention_type
      : club?.default_withdrawal_retention_type,
    showDeclaresRetention
      ? show?.withdrawal_retention_value
      : club?.default_withdrawal_retention_value,
    // Prose composes like every other field: the show's own if it wrote one,
    // else the club's. Gating this on "the show declared anything" also threw
    // away PROCEDURAL club notes on every show that set a cutoff — and since
    // the cutoff is show-only and retention needs one to bite, that left a
    // club's two remaining fields mutually exclusive. The contradiction that
    // motivated the gate is fixed where it actually lives: the disclosure
    // sentence (formatWithdrawalPolicy) and requiresManual below.
    show?.withdrawal_policy_notes ?? club?.default_withdrawal_policy_notes ?? null
  );
}

/**
 * The calendar date of `instant` AS OBSERVED in `timeZone`, formatted
 * 'YYYY-MM-DD'. en-CA yields ISO-ordered date parts; comparing two such strings
 * lexicographically is a correct calendar-date comparison. Falls back to the
 * default zone if an invalid IANA name is supplied (never throws).
 */
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

/**
 * Suggested refund for a voluntary withdrawal of one entry. Before the cutoff
 * (inclusive, in the show's timezone) → full refund. After → entry fee minus the
 * retained office fee (flat) or percentage. Prose-only or unset policy → suggest
 * full but flag for manual handling. Never returns a negative refund; retained +
 * refunded always sum to the entry fee.
 */
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

  // Prose with nothing structured behind it: the notes may impose a tier this
  // function cannot evaluate, so "keep nothing" is a guess, not an answer.
  // The system informs — hand it to the secretary rather than pre-filling a
  // confident full refund the policy text contradicts.
  if (retainedCents === 0 && policy.notes?.trim()) {
    return {
      refundCents: entryFeeCents,
      retainedCents: 0,
      requiresManual: true,
      reason: 'after_cutoff',
    };
  }

  return {
    refundCents: entryFeeCents - retainedCents,
    retainedCents,
    requiresManual: false,
    reason: 'after_cutoff',
  };
}
