import { supabase } from '@/lib/supabase';
import { logger } from '@/services/LoggingService';

/**
 * `get_user_roles` reports one scope id per grant (`COALESCE(show_id, club_id)`), so a grant
 * pinned to a show loses its `club_id`. The server's `is_show_club_admin` keys on that
 * `club_id` (MYK9-1886), so the client reads it back for show-pinned grants: the caller's
 * own `user_roles` rows are readable (`user_roles_select`). Best effort: a failed read leaves
 * the grant without a club and the scope predicates fall back to the `shows` list.
 */
export async function fetchShowGrantClubIds(
  userRoleIds: readonly string[]
): Promise<Map<string, string>> {
  const clubByRole = new Map<string, string>();
  if (userRoleIds.length === 0) return clubByRole;
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('id, club_id')
      .in('id', [...userRoleIds]);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.club_id) clubByRole.set(row.id, row.club_id);
    }
  } catch (error) {
    logger.warn('Could not read the club behind a show-pinned grant', 'rbac', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return clubByRole;
}
