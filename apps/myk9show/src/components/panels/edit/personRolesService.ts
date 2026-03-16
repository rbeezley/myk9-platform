import { supabase } from '@/services/database/supabaseClient';

/** Apply role changes to user_roles table. Compares old vs new and grants/revokes. */
export async function savePersonRoles(personId: string, newRoles: string[]) {
  const mapName = (r: string) => (r === 'admin' ? 'site_admin' : r);

  // Fetch current roles from DB to compute the diff
  const { data: currentData } = await supabase
    .from('user_roles')
    .select('role:roles!user_roles_role_id_fkey(name)')
    .eq('user_id', personId)
    .eq('is_active', true);
  const oldRoles = (currentData || [])
    .map((r: Record<string, unknown>) => {
      const name = (r.role as { name: string })?.name;
      return name === 'site_admin' ? 'admin' : name;
    })
    .filter(Boolean) as string[];

  const toGrant = newRoles.filter(r => !oldRoles.includes(r)).map(mapName);
  const toRevoke = oldRoles.filter(r => !newRoles.includes(r)).map(mapName);

  // Get the current user's people.id (granted_by FK references people table, not auth.users)
  const authUser = (await supabase.auth.getUser()).data.user;
  let grantedBy: string | null = null;
  if (authUser) {
    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    grantedBy = person?.id ?? null;
  }

  for (const roleName of toGrant) {
    const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).single();
    if (!role) continue;

    // Check if deactivated row exists — reactivate it
    const { data: existing } = await supabase
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', personId)
      .eq('role_id', role.id)
      .maybeSingle();

    if (existing && !existing.is_active) {
      await supabase.from('user_roles').update({ is_active: true }).eq('id', existing.id);
    } else if (!existing) {
      await supabase.from('user_roles').insert({
        user_id: personId,
        role_id: role.id,
        granted_by: grantedBy,
      });
    }
  }

  for (const roleName of toRevoke) {
    const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).single();
    if (!role) continue;

    await supabase
      .from('user_roles')
      .update({ is_active: false })
      .eq('user_id', personId)
      .eq('role_id', role.id);
  }
}
