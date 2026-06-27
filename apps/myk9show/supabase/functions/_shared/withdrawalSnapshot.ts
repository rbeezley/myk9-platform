// Pure resolution of the effective withdrawal policy that gets SNAPSHOTTED onto
// an entry at payment time. Deno-free (colocated vitest) — the webhook does the
// DB I/O (fetch show+club, write the snapshot); this decides WHAT the snapshot
// is, so the precedence rule is unit-testable.
//
// Mirrors the app-side getEffectiveWithdrawalPolicy (src/features/payments/
// withdrawalPolicy.ts): a show override (any field set) wins over the club
// default; neither declared → null. Duplicated across the Deno/app boundary by
// necessity, kept tiny on purpose.
//
// See docs/plan-refund-policy-withdrawal.md (Phase 3, D3).

export interface WithdrawalPolicySnapshot {
  cutoffDate: string | null;
  retentionType: 'flat' | 'percent';
  // Normalized to a required number (0 when unset) so the snapshot mirrors the
  // app policy contract (getEffectiveWithdrawalPolicy) exactly — Phase 4 reads
  // this JSON as the policy and must not special-case a null vs 0 retention.
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

function hasAny(...values: Array<string | number | null | undefined>): boolean {
  return values.some(v => v !== null && v !== undefined);
}

function build(
  cutoff: string | null | undefined,
  type: string | null | undefined,
  value: number | null | undefined,
  notes: string | null | undefined
): WithdrawalPolicySnapshot {
  return {
    cutoffDate: cutoff ?? null,
    retentionType: type === 'percent' ? 'percent' : 'flat',
    retentionValue: value ?? 0,
    notes: notes ?? null,
  };
}

/**
 * Resolve the snapshot from a show row (override) + its club row (default).
 * Returns null when neither level declares a policy.
 */
export function resolveWithdrawalSnapshot(
  show: ShowWithdrawalColumns | null | undefined,
  club: ClubWithdrawalColumns | null | undefined
): WithdrawalPolicySnapshot | null {
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
