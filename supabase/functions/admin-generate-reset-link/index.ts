import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

interface GenerateResetLinkRequest {
  targetEmail?: string;
}

handle<GenerateResetLinkRequest>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    if (!user) {
      throw new HttpError(401, 'Authentication failed');
    }

    // 1. Verify caller is site_admin
    const { data: callerPerson, error: callerError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (callerError || !callerPerson) {
      throw new HttpError(403, 'Caller not found');
    }

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

    // 2. Parse request
    const { targetEmail } = body;

    if (!targetEmail) {
      throw new HttpError(400, 'Missing required parameter: targetEmail');
    }

    // 3. Generate password recovery link using admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: targetEmail,
    });

    if (linkError || !linkData) {
      console.error('Failed to generate reset link:', linkError);
      throw new HttpError(500, linkError?.message ?? 'Failed to generate reset link');
    }

    console.log(`Password reset link generated for ${targetEmail} by admin ${callerPerson.id}`);

    return {
      success: true,
      link: linkData.properties?.action_link ?? null,
    };
  },
);
