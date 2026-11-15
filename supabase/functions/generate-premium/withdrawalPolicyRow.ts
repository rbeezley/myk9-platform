/**
 * MYK9-1976: the show's refund and withdrawal policy as the premium carries it.
 *
 * The premium prints the text an exhibitor reads in the app: the show's text, else the club's,
 * else the default built from the policy fields and the show's registry. This function cannot
 * import app code, so it sends the raw columns in the row shape the app's own read selects
 * (EFFECTIVE_WITHDRAWAL_SELECT in apps/myk9show/src/features/payments/useEffectiveWithdrawalPolicy.ts)
 * and the app resolves them with that same resolver (resolveEffectiveWithdrawalTerms). Nothing
 * is resolved or cut here.
 */

/** Columns added to the premium's `shows` select, beside the club and trial columns below. */
export const PREMIUM_SHOW_WITHDRAWAL_COLUMNS =
  'withdrawal_cutoff_date, withdrawal_retention_type, withdrawal_retention_value, withdrawal_policy_notes, withdrawal_policy_text';

/** Columns added to the premium's `clubs(...)` embed. */
export const PREMIUM_CLUB_WITHDRAWAL_COLUMNS =
  'default_withdrawal_retention_type, default_withdrawal_retention_value, default_withdrawal_policy_notes, default_withdrawal_policy_text';

export interface PremiumWithdrawalRow {
  withdrawal_cutoff_date: string | null;
  withdrawal_retention_type: string | null;
  withdrawal_retention_value: number | null;
  withdrawal_policy_notes: string | null;
  withdrawal_policy_text: string | null;
  trials: Array<{ registry_id: string | null }>;
  clubs: {
    default_withdrawal_retention_type: string | null;
    default_withdrawal_retention_value: number | null;
    default_withdrawal_policy_notes: string | null;
    default_withdrawal_policy_text: string | null;
  } | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The policy row from the premium's show read (embedded club as object or one-element array). */
export function buildPremiumWithdrawalRow(show: Record<string, unknown>): PremiumWithdrawalRow {
  const rawClub = Array.isArray(show.clubs) ? show.clubs[0] : show.clubs;
  const club = (rawClub ?? null) as Record<string, unknown> | null;
  const trials = Array.isArray(show.trials) ? (show.trials as Array<Record<string, unknown>>) : [];
  return {
    withdrawal_cutoff_date: text(show.withdrawal_cutoff_date),
    withdrawal_retention_type: text(show.withdrawal_retention_type),
    withdrawal_retention_value: amount(show.withdrawal_retention_value),
    withdrawal_policy_notes: text(show.withdrawal_policy_notes),
    withdrawal_policy_text: text(show.withdrawal_policy_text),
    trials: trials.map(trial => ({ registry_id: text(trial?.registry_id) })),
    clubs: club
      ? {
          default_withdrawal_retention_type: text(club.default_withdrawal_retention_type),
          default_withdrawal_retention_value: amount(club.default_withdrawal_retention_value),
          default_withdrawal_policy_notes: text(club.default_withdrawal_policy_notes),
          default_withdrawal_policy_text: text(club.default_withdrawal_policy_text),
        }
      : null,
  };
}
