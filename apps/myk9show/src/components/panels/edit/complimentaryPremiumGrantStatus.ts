import type {
  AdminGrantHistoryRow,
  SanitizedGrantStatus,
} from '@/services/database/entitlement/types';

/**
 * Derives a truthful display status for a grant history row from its
 * timestamp/revocation/supersession columns — mirrors the server's
 * derivation in get_own_entitlement_context() so the admin view and the
 * exhibitor's own view never disagree.
 */
export function deriveGrantStatus(row: AdminGrantHistoryRow, now: Date): SanitizedGrantStatus {
  if (row.revoked_at) return 'revoked';
  if (row.superseded_at) return 'superseded';
  const starts = new Date(row.starts_at);
  const ends = new Date(row.ends_at);
  if (now < starts) return 'scheduled';
  if (now > ends) return 'expired';
  return 'active';
}
