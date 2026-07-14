import { supabase } from '@/services/database/supabaseClient';

export interface RevokeSelfAuthIdentityResult {
  revoked: boolean;
  error: Error | null;
}

export async function revokeSelfAuthIdentity(): Promise<RevokeSelfAuthIdentityResult> {
  const { data, error } = await supabase.functions.invoke('revoke-self-auth-identity', {
    body: {},
  });

  if (error) {
    return { revoked: false, error };
  }

  if (data?.revoked !== true) {
    return { revoked: false, error: new Error('Auth identity was not revoked') };
  }

  return {
    revoked: true,
    error: null,
  };
}
