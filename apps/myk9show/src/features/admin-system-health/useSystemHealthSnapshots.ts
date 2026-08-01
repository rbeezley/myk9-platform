/**
 * React Query hook for the System Health board.
 *
 * A single query serves both needs: the latest snapshot is `rows[0]` and the
 * 7-run history strip is `rows`. The `created_at desc` index (see the migration)
 * makes the `limit(7)` read cheap. This is a deliberate direct Supabase read of
 * server-authoritative admin data — it is NOT show-day persistent data, so it
 * does not go through `@myk9/replication`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { parseSnapshot } from './systemHealthSelectors';
import type { SystemHealthSnapshot, SystemHealthSnapshotRow } from './systemHealthTypes';

/** How many recent runs the history strip shows. */
export const HISTORY_LIMIT = 12;

export interface SystemHealthData {
  /** Most recent snapshot, or null when the table is empty. */
  latest: SystemHealthSnapshot | null;
  /** Up to `HISTORY_LIMIT` snapshots, newest first. */
  history: SystemHealthSnapshot[];
}

async function fetchSystemHealth(): Promise<SystemHealthData> {
  const { data, error } = await supabase
    .from('system_health_snapshots')
    .select('id, created_at, source, overall_status, checks, run_duration_ms')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw error;

  const history = (data ?? []).map(row => parseSnapshot(row as SystemHealthSnapshotRow));
  return { latest: history[0] ?? null, history };
}

export function useSystemHealthSnapshots() {
  return useQuery({
    queryKey: ['admin', 'system-health', 'snapshots'],
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
  });
}
