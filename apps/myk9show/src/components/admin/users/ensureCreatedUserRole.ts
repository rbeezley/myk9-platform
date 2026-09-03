import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';

/** Confirm ambiguous no-op results before advertising a role in an invitation. */
export async function ensureCreatedUserRole(userId: string, roleName: string): Promise<void> {
  if (await rbacService.ensureUserHasRole(userId, roleName)) return;

  // false means either an existing assignment or a failed role lookup. This
  // online admin flow must confirm the exact unscoped grant before claiming it.
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, roles!inner(name)')
    .eq('user_id', userId)
    .eq('roles.name', roleName)
    .eq('is_active', true)
    .is('club_id', null)
    .is('show_id', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error(`Could not confirm role assignment: ${roleName}`);
}
