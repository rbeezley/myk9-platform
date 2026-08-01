// supabase/functions/admin-generate-reset-link/generateResetLinkHandler.ts
// Domain logic for the admin-generate-reset-link entrypoint, extracted from
// the `handle()` callback in index.ts (MYK9-41) so it can be unit-tested
// under vitest without a live Supabase client or `Deno.serve`. The envelope
// (CORS/JWT/body parsing — `processRequest`) is already covered by
// ../_shared/http/__tests__/handler.test.ts; this covers the site_admin
// gate, input validation, and the reset-link generation flow itself.

import type { HandlerCtx } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';

export interface GenerateResetLinkRequest {
  targetEmail?: string;
}

export async function generateResetLinkHandler({
  body,
  user,
  supabase,
}: HandlerCtx<GenerateResetLinkRequest>) {
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

  const { data: rbacRoles } = await applyActiveRoleValidity(
    supabase.from('user_roles').select('role:roles(name)').eq('user_id', callerPerson.id)
  );

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
}
