/**
 * Writes a role's permission set by permission code (MYK9-1409).
 *
 * supabase-js never throws on a failed query, so every call here reads its `error`. Unknown codes
 * are refused before any write. The swap adds the new rows first and only then removes the
 * others, so a failure part-way leaves the role with extra permissions, never with none; the
 * caller reports the error and the admin saves again.
 */
import { supabase } from '@/lib/supabase';

export interface ResolvedPermission {
  id: string;
  code: string;
}

/** Look up the requested codes, in request order without duplicates; throws on a failed read or an unknown code. */
export async function resolvePermissionCodes(codes: string[]): Promise<ResolvedPermission[]> {
  const wanted = [...new Set(codes)];
  if (wanted.length === 0) return [];

  const { data, error } = await supabase.from('permissions').select('id, code').in('code', wanted);
  if (error) throw new Error(`Failed to look up permissions: ${error.message}`);

  const byCode = new Map((data ?? []).map(p => [p.code, p] as const));
  const unknown = wanted.filter(code => !byCode.has(code));
  if (unknown.length > 0) throw new Error(`Unknown permission codes: ${unknown.join(', ')}`);

  return wanted.map(code => byCode.get(code)!);
}

/** Replace the role's role_permissions rows with exactly `permissionIds`. */
export async function replaceRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<void> {
  if (permissionIds.length > 0) {
    const { error: addError } = await supabase.from('role_permissions').upsert(
      permissionIds.map(permission_id => ({ role_id: roleId, permission_id })),
      { onConflict: 'role_id,permission_id', ignoreDuplicates: true }
    );
    if (addError) throw new Error(`Failed to add role permissions: ${addError.message}`);
  }

  let removeOthers = supabase.from('role_permissions').delete().eq('role_id', roleId);
  if (permissionIds.length > 0) {
    removeOthers = removeOthers.not('permission_id', 'in', `(${permissionIds.join(',')})`);
  }
  const { error: removeError } = await removeOthers;
  if (removeError) throw new Error(`Failed to remove role permissions: ${removeError.message}`);
}
