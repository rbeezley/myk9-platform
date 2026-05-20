// supabase/functions/admin-delete-user/index.ts
// Hard-delete a person + their auth.users entry. site_admin only.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

interface DeleteRequest {
  personId: string;
}

handle<DeleteRequest>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
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
    const { data: rbacRoles } = await supabase
      .from('user_roles')
      .select('role:roles(name)')
      .eq('user_id', callerPerson.id)
      .eq('is_active', true);

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
  },
);
