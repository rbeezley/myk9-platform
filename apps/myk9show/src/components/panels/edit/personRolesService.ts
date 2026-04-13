import { supabase } from '@/services/database/supabaseClient';

/** Apply role changes to user_roles table. Compares old vs new and grants/revokes. */
export async function savePersonRoles(personId: string, newRoles: string[]) {
  const mapName = (r: string) => (r === 'admin' ? 'site_admin' : r);

  // Fetch current active roles
  const { data: currentData, error: currentError } = await supabase
    .from('user_roles')
    .select('role:roles!user_roles_role_id_fkey(name)')
    .eq('user_id', personId)
    .eq('is_active', true);
  if (currentError) throw new Error(`Failed to fetch current roles: ${currentError.message}`);

  const oldRoles = (currentData ?? [])
    .map((r: Record<string, unknown>) => {
      const name = (r.role as { name: string })?.name;
      return name === 'site_admin' ? 'admin' : name;
    })
    .filter(Boolean) as string[];

  const toGrant = newRoles.filter(r => !oldRoles.includes(r)).map(mapName);
  const toRevoke = oldRoles.filter(r => !newRoles.includes(r)).map(mapName);

  if (toGrant.length === 0 && toRevoke.length === 0) return;

  // Resolve all role IDs and the granting user's people.id in parallel
  const allRoleNames = [...new Set([...toGrant, ...toRevoke])];
  const [{ data: roleRows, error: rolesError }, authResult] = await Promise.all([
    supabase.from('roles').select('id, name').in('name', allRoleNames),
    supabase.auth.getUser(),
  ]);
  if (rolesError) throw new Error(`Failed to fetch role ids: ${rolesError.message}`);

  const roleMap = new Map((roleRows ?? []).map(r => [r.name, r.id as string]));

  let grantedBy: string | null = null;
  if (authResult.data.user) {
    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', authResult.data.user.id)
      .maybeSingle();
    grantedBy = person?.id ?? null;
  }

  const grantRoleIds = toGrant.map(n => roleMap.get(n)).filter((id): id is string => !!id);
  const revokeRoleIds = toRevoke.map(n => roleMap.get(n)).filter((id): id is string => !!id);

  await Promise.all([
    // Grants: check for deactivated rows, reactivate or insert in batch
    (async () => {
      if (grantRoleIds.length === 0) return;

      const { data: existing } = await supabase
        .from('user_roles')
        .select('id, role_id, is_active')
        .eq('user_id', personId)
        .in('role_id', grantRoleIds);

      const existingMap = new Map((existing ?? []).map(r => [r.role_id, r]));
      const toReactivate = grantRoleIds.filter(id => existingMap.get(id)?.is_active === false);
      const toInsert = grantRoleIds.filter(id => !existingMap.has(id));

      await Promise.all([
        ...toReactivate.map(roleId =>
          supabase
            .from('user_roles')
            .update({ is_active: true })
            .eq('id', existingMap.get(roleId)!.id)
        ),
        toInsert.length > 0
          ? supabase
              .from('user_roles')
              .insert(
                toInsert.map(roleId => ({
                  user_id: personId,
                  role_id: roleId,
                  granted_by: grantedBy,
                }))
              )
          : Promise.resolve(),
      ]);
    })(),

    // Revokes: single update with .in()
    revokeRoleIds.length > 0
      ? supabase
          .from('user_roles')
          .update({ is_active: false })
          .eq('user_id', personId)
          .in('role_id', revokeRoleIds)
      : Promise.resolve(),
  ]);
}
