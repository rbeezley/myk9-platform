import { supabase } from '@/lib/supabase';
import type { AccessCodeRpcRow } from './accessCodeRows';

/**
 * get_show_access_codes (online-only RPC; the server decides which roles the caller may see).
 * Returns `{ data, error }` as the RPC does so each caller words its own failure.
 */
export async function fetchShowAccessCodes(
  showId: string
): Promise<{ data: AccessCodeRpcRow[] | null; error: { message: string } | null }> {
  return (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: AccessCodeRpcRow[] | null; error: { message: string } | null }>
  )('get_show_access_codes', { p_show_id: showId });
}
