/**
 * The raw withdrawal-policy columns the premium carries (MYK9-1952). The client resolves
 * show-over-club with `getEffectiveWithdrawalPolicy`; this function cannot import app code.
 */
export interface ShowWithdrawalRow {
  withdrawal_cutoff_date?: string | null;
  withdrawal_retention_type?: string | null;
  withdrawal_retention_value?: number | null;
  withdrawal_policy_notes?: string | null;
}

export interface ClubWithdrawalRow {
  default_withdrawal_retention_type?: string | null;
  default_withdrawal_retention_value?: number | null;
  default_withdrawal_policy_notes?: string | null;
}

export function buildWithdrawalPayload(show: ShowWithdrawalRow, club: ClubWithdrawalRow | null) {
  return {
    show: {
      withdrawal_cutoff_date: show.withdrawal_cutoff_date ?? null,
      withdrawal_retention_type: show.withdrawal_retention_type ?? null,
      withdrawal_retention_value: show.withdrawal_retention_value ?? null,
      withdrawal_policy_notes: show.withdrawal_policy_notes ?? null,
    },
    club: club
      ? {
          default_withdrawal_retention_type: club.default_withdrawal_retention_type ?? null,
          default_withdrawal_retention_value: club.default_withdrawal_retention_value ?? null,
          default_withdrawal_policy_notes: club.default_withdrawal_policy_notes ?? null,
        }
      : null,
  };
}
