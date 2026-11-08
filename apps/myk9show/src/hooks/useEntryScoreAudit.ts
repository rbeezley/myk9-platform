import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  getEntryScoreAudit,
  type EntryScoreAuditItem,
} from '@/services/database/entries/scoreAudit';

// MYK9-1754: only show managers can read entry_score_audit (RLS), so the control
// is offered to the same roles. Online-only admin read: no replica, no offline copy.
const SCORE_AUDIT_ROLES = new Set<UserRole>([
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.SITE_ADMIN,
]);

export function useEntryScoreAudit(entryId: string, enabled: boolean) {
  const { userWithRoles } = useAuthContext();
  const canViewScoreHistory =
    userWithRoles?.roles.some(role => SCORE_AUDIT_ROLES.has(role)) ?? false;

  const query = useQuery<EntryScoreAuditItem[]>({
    queryKey: ['entry-score-audit', entryId],
    queryFn: () => getEntryScoreAudit(entryId),
    enabled: Boolean(entryId) && enabled && canViewScoreHistory,
    staleTime: 30_000,
    retry: false,
  });

  return { ...query, canViewScoreHistory };
}
