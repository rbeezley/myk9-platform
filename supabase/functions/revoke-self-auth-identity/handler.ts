import { HttpError } from '../_shared/http/responses.ts';

import { revokeAuthIdentity } from './revocation.ts';

interface RevokeHandlerArgs {
  user?: { id: string };
  supabase: {
    auth: {
      admin: {
        updateUserById: (
          authUserId: string,
          attributes: { ban_duration: string }
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
    from: (table: string) => {
      insert: (value: unknown) => Promise<{ error: { code?: string; message?: string } | null }>;
    };
  };
}

export async function handleRevokeSelfAuthIdentity(
  args: RevokeHandlerArgs
): Promise<{ revoked: boolean }> {
  if (!args.user) {
    throw new HttpError(401, 'Authentication failed');
  }

  return revokeAuthIdentity({
    authUserId: args.user.id,
    updateUserById: (authUserId, attributes) =>
      args.supabase.auth.admin.updateUserById(authUserId, attributes),
    persistAlert: async alert => {
      const { error } = await args.supabase.from('operator_alerts').insert(alert);
      if (error && error.code !== '23505') {
        throw error;
      }
    },
  });
}
