/**
 * Writes a role and its permission set through one RPC each (MYK9-1409).
 *
 * The RPCs (migration 20261026152300) run in one transaction: a failure writes nothing, so a
 * role is never left with no permissions and a failed create can be saved again under the
 * same name. The update locks the role row, so overlapping saves of one role cannot delete
 * each other's rows. Unknown codes are refused server-side before any write. supabase-js
 * never throws on a failed call, so each wrapper reads `error` and throws it.
 */
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/supabase';

export interface RoleWriteResult {
  role: Tables<'roles'>;
  /** The codes written, in request order without duplicates; null when permissions were untouched. */
  permissionCodes: string[] | null;
}

function toResult(data: unknown): RoleWriteResult {
  const { role, permission_codes } = data as {
    role: Tables<'roles'>;
    permission_codes: string[] | null;
  };
  return { role, permissionCodes: permission_codes };
}

export async function createRoleWithPermissions(
  name: string,
  permissionCodes: string[],
  description?: string
): Promise<RoleWriteResult> {
  const { data, error } = await supabase.rpc('create_role_with_permissions', {
    p_name: name,
    p_permission_codes: permissionCodes,
    ...(description !== undefined && { p_description: description }),
  });
  if (error) throw new Error(`Failed to create role: ${error.message}`);
  return toResult(data);
}

export async function updateRoleWithPermissions(
  roleId: string,
  changes: { description?: string | undefined; permissionCodes?: string[] | undefined }
): Promise<RoleWriteResult> {
  const { description, permissionCodes } = changes;
  const { data, error } = await supabase.rpc('update_role_with_permissions', {
    p_role_id: roleId,
    p_set_description: description !== undefined,
    ...(description !== undefined && { p_description: description }),
    ...(permissionCodes !== undefined && { p_permission_codes: permissionCodes }),
  });
  if (error) throw new Error(`Failed to update role: ${error.message}`);
  return toResult(data);
}
