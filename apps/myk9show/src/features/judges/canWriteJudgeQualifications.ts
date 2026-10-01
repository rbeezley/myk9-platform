import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';

/**
 * Who may write `judge_qualifications`. Mirrors the table's INSERT/UPDATE policy
 * (supabase/migrations/068_fix_judge_qualifications_rls.sql: `has_role('secretary')
 * OR has_role('site_admin')`) and `replace_judge_qualifications`
 * (20260903150000). A club admin is NOT in this set, so a surface that creates a
 * judge (person, then qualification) must not offer it to one: the person would be
 * created and the qualification refused.
 */
export function canWriteJudgeQualifications(hasRole: (role: UserRole) => boolean): boolean {
  return hasRole(UserRole.SECRETARY) || hasRole(UserRole.SITE_ADMIN);
}

export function useCanWriteJudgeQualifications(): boolean {
  const { hasRole } = useAuthContext();
  return canWriteJudgeQualifications(hasRole);
}
