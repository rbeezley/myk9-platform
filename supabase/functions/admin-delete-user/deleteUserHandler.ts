// supabase/functions/admin-delete-user/deleteUserHandler.ts
// Domain logic for the admin-delete-user entrypoint, extracted from the
// `handle()` callback in index.ts (MYK9-41) so it can be unit-tested under
// vitest without a live Supabase client or `Deno.serve`. The envelope
// (CORS/JWT/body parsing — `processRequest`) is already covered by
// ../_shared/http/__tests__/handler.test.ts; this covers the site_admin
// gate, input validation, and the delete flow itself.

import type { HandlerCtx } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';

export interface DeleteUserRequest {
  personId: string;
}

export async function deleteUserHandler({ body, user, supabase }: HandlerCtx<DeleteUserRequest>) {
  // The envelope already validated the JWT; `user` is non-null.
  if (!user) {
    throw new HttpError(401, 'Authentication failed');
  }

  // 1. Look up the caller's person row
  const { data: callerPerson, error: callerError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (callerError || !callerPerson) {
    throw new HttpError(403, 'Caller not found');
  }

  // 2. Check site_admin via RBAC
  const { data: rbacRoles } = await applyActiveRoleValidity(
    supabase.from('user_roles').select('role:roles(name)').eq('user_id', callerPerson.id)
  );

  const isSiteAdmin =
    rbacRoles?.some((r: { role: { name: string } | null }) => r.role?.name === 'site_admin') ??
    false;

  if (!isSiteAdmin) {
    throw new HttpError(403, 'Unauthorized: requires site_admin role');
  }

  // 3. Validate request
  const { personId } = body;
  if (!personId) {
    throw new HttpError(400, 'Missing required parameter: personId');
  }
  if (personId === callerPerson.id) {
    throw new HttpError(400, 'Cannot delete your own account');
  }

  // 4. Look up target person's auth_user_id
  // Intentionally does NOT filter by deleted_at — allows admins to
  // permanently purge soft-deleted users from the Data Lifecycle page
  const { data: targetPerson, error: targetError } = await supabase
    .from('people')
    .select('id, first_name, last_name, auth_user_id')
    .eq('id', personId)
    .single();

  if (targetError || !targetPerson) {
    throw new HttpError(404, 'User not found');
  }

  // 5. Hard-delete the people row (CASCADE handles dependent tables)
  const { error: deleteError } = await supabase.from('people').delete().eq('id', personId);

  if (deleteError) {
    console.error('Failed to delete people row:', deleteError);
    // The owns-dogs guard trigger (migration 20260617130000) blocks the delete
    // with SQLSTATE MK001. Surface it as an actionable 409 instead of a generic
    // 500 so the client can tell the admin to delete the dogs first.
    if (deleteError.code === 'MK001') {
      throw new HttpError(409, deleteError.message, 'MK001');
    }
    throw new HttpError(500, 'Failed to delete user record');
  }

  // 6. Delete auth.users entry if it exists
  if (targetPerson.auth_user_id) {
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
      targetPerson.auth_user_id
    );

    if (authDeleteError) {
      // Log but don't fail — the people row is already deleted
      console.error('Failed to delete auth user (people row already removed):', authDeleteError);
    }
  }

  console.log(
    `User permanently deleted: ${targetPerson.first_name} ${targetPerson.last_name} (${personId}) by admin ${callerPerson.id}`
  );

  return {
    success: true,
    deleted: {
      personId,
      authUserDeleted: !!targetPerson.auth_user_id,
    },
  };
}
