/**
 * Typed Supabase admin (service-role) client.
 *
 * `persistSession: false` / `autoRefreshToken: false`: this is a short-lived,
 * non-interactive process with no browser storage — there is no session to
 * persist or token to refresh, and disabling both avoids background timers
 * keeping the process alive.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@myk9/supabase';

import type { AdminMcpConfig } from '../config';

export type AdminSupabaseClient = SupabaseClient<Database>;

export function createSupabaseAdminClient(
  config: AdminMcpConfig,
): AdminSupabaseClient {
  return createClient<Database>(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
