/**
 * React Query hook for the System Health board.
 *
 * A single query serves both needs: the latest snapshot is `rows[0]` and the
 * 7-run history strip is `rows`. The `created_at desc` index (see the migration)
 * makes the `limit(7)` read cheap. This is a deliberate direct Supabase read of
 * server-authoritative admin data — it is NOT show-day persistent data, so it
 * does not go through `@myk9/replication`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { parseSnapshot } from './systemHealthSelectors';
import type { SystemHealthSnapshot, SystemHealthSnapshotRow } from './systemHealthTypes';

/** How many recent runs the history strip shows. */
export const HISTORY_LIMIT = 12;
export const SYSTEM_HEALTH_QUERY_KEY = ['admin', 'system-health', 'snapshots'] as const;

export interface SystemHealthData {
  /** Most recent snapshot, or null when the table is empty. */
  latest: SystemHealthSnapshot | null;
  /** Up to `HISTORY_LIMIT` snapshots, newest first. */
  history: SystemHealthSnapshot[];
}

export async function fetchSystemHealth(): Promise<SystemHealthData> {
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
    queryKey: SYSTEM_HEALTH_QUERY_KEY,
    queryFn: fetchSystemHealth,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export interface RunHealthCheckResult {
  data: SystemHealthData;
  completed: boolean;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

/** Queue a full run and wait briefly for its append-only snapshot to arrive. */
export function useRunSystemHealthCheck() {
  const queryClient = useQueryClient();

  return useMutation<RunHealthCheckResult, Error, void>({
    mutationFn: async () => {
      const { data: trigger, error } = await supabase.rpc('run_system_health_check_now');

      if (error) throw error;

      const runToken =
        trigger &&
        typeof trigger === 'object' &&
        'run_token' in trigger &&
        typeof trigger.run_token === 'string'
          ? trigger.run_token
          : null;
      if (!runToken) throw new Error('The health check did not return a run token.');

      const manualSource = `cron-health-check:manual:${runToken}`;

      for (let attempt = 0; attempt < 60; attempt += 1) {
        const data = await queryClient.fetchQuery({
          queryKey: SYSTEM_HEALTH_QUERY_KEY,
          queryFn: fetchSystemHealth,
          staleTime: 0,
        });
        if (data.history.some(snapshot => snapshot.source === manualSource)) {
          return { data, completed: true };
        }
        await wait(500);
      }

      const data = await queryClient.fetchQuery({
        queryKey: SYSTEM_HEALTH_QUERY_KEY,
        queryFn: fetchSystemHealth,
        staleTime: 0,
      });
      return { data, completed: data.history.some(snapshot => snapshot.source === manualSource) };
    },
  });
}
