import { createClient } from '@supabase/supabase-js';

export interface PersistenceFailure {
  kind: 'http' | 'transport' | 'missing-count';
  status: number;
  entryCount: number;
  code?: string;
  shardIndex?: number;
}

export interface PersistenceObservation {
  count: number | null;
  failures: PersistenceFailure[];
}

export async function countPersistedScores(
  entryIds: readonly string[]
): Promise<PersistenceObservation> {
  if (entryIds.length === 0) return { count: 0, failures: [] };
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase persistence-verification credentials.');
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { count, error, status } = await client
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .in('id', [...entryIds])
    .eq('is_scored', true)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error || count === null || !Number.isSafeInteger(count) || count < 0) {
    // HEAD errors can have no message/body. Preserve status and a bounded code,
    // never response bodies, URLs, credentials, or an invented zero count.
    const code = error?.code;
    return {
      count: null,
      failures: [
        {
          kind: error ? (status > 0 ? 'http' : 'transport') : 'missing-count',
          status,
          entryCount: entryIds.length,
          ...(code && /^[A-Z0-9_]{1,24}$/.test(code) ? { code } : {}),
        },
      ],
    };
  }
  return { count, failures: [] };
}
