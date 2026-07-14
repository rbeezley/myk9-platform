// Ban the caller's auth identity after self-service person deletion.
// Deploy: supabase functions deploy revoke-self-auth-identity --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { handleRevokeSelfAuthIdentity } from './handler.ts';

handle<Record<string, never>>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ user, supabase }) =>
    handleRevokeSelfAuthIdentity({
      user,
      supabase: {
        auth: {
          admin: {
            updateUserById: async (authUserId, attributes) => {
              const { error } = await supabase.auth.admin.updateUserById(authUserId, attributes);
              return { error };
            },
          },
        },
        from: table => ({
          insert: async value => {
            const { error } = await supabase.from(table).insert(value as Record<string, unknown>);
            return { error };
          },
        }),
      },
    })
);
