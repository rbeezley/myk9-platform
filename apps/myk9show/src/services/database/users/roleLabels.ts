import { supabase } from '../supabaseClient';
import { logger } from '@/services/LoggingService';

type PersonRoleLabel = { person_id: string; role_name: string };
const ROLE_RPC_PAGE_SIZE = 500;

export const hydrateVisibleRoles = async <T extends { id?: string }>(
  rows: T[]
): Promise<Array<T & { roles: string[] }>> => {
  const personIds = rows.flatMap(row => (row.id ? [row.id] : []));
  if (personIds.length === 0) return rows.map(row => ({ ...row, roles: [] }));

  const roleRows: PersonRoleLabel[] = [];
  for (let offset = 0; ; offset += ROLE_RPC_PAGE_SIZE) {
    const { data, error } = await supabase.rpc('get_visible_person_roles', {
      p_person_ids: personIds,
      p_limit: ROLE_RPC_PAGE_SIZE,
      p_offset: offset,
    });
    // Role labels decorate an otherwise valid person read. Fail closed without
    // blanking the directory during a transient RPC error or the brief interval
    // between the Vercel deploy and the post-merge migration push.
    if (error) {
      logger.warn(
        'Role label hydration failed; returning people without role labels',
        'database',
        { code: error.code },
        new Error(error.message)
      );
      return rows.map(row => ({ ...row, roles: [] }));
    }
    const page = (data ?? []) as PersonRoleLabel[];
    roleRows.push(...page);
    if (page.length < ROLE_RPC_PAGE_SIZE) break;
  }

  const rolesByPerson = new Map<string, Set<string>>();
  for (const { person_id, role_name } of roleRows) {
    const roles = rolesByPerson.get(person_id) ?? new Set<string>();
    roles.add(role_name);
    rolesByPerson.set(person_id, roles);
  }

  return rows.map(row => ({
    ...row,
    roles: row.id ? Array.from(rolesByPerson.get(row.id) ?? []) : [],
  }));
};
