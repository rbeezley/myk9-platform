/**
 * Connectivity probe for the shared MutationManager (MYK9-1474). A network-class upload
 * failure is only treated as "uplink down" (and so does not spend the retry budget) when this
 * returns false. GoTrue's health endpoint needs no session and reads no table.
 */
const PROBE_TIMEOUT_MS = 3000;

export async function checkSupabaseReachable(): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
