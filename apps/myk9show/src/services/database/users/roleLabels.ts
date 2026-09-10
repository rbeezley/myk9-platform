import { supabase } from '../supabaseClient';

type PersonRoleLabel = { person_id: string; role_name: string };

export const hydrateVisibleRoles = async <T extends { id?: string }>(
  rows: T[]
): Promise<Array<T & { roles: string[] }>> => {
  const personIds = rows.flatMap(row => (row.id ? [row.id] : []));
  if (personIds.length === 0) return rows.map(row => ({ ...row, roles: [] }));

  const { data, error } = await supabase.rpc('get_visible_person_roles', {
    p_person_ids: personIds,
  });
  if (error) throw error;

  const rolesByPerson = new Map<string, Set<string>>();
  for (const { person_id, role_name } of (data ?? []) as PersonRoleLabel[]) {
    const roles = rolesByPerson.get(person_id) ?? new Set<string>();
    roles.add(role_name);
    rolesByPerson.set(person_id, roles);
  }

  return rows.map(row => ({
    ...row,
    roles: row.id ? Array.from(rolesByPerson.get(row.id) ?? []) : [],
  }));
};
