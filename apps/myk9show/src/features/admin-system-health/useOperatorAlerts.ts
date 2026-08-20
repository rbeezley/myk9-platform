/**
 * React Query hooks for the /admin/health board's unresolved-operator-alerts
 * section (MP-08/MP-12). A direct Supabase read is correct here — this is
 * server-authoritative, online-only admin data (RLS-gated to site admins via
 * `is_site_admin()`), not show-day persistent data, so it does not go through
 * `@myk9/replication` (same rationale as `useSystemHealthSnapshots`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { parseOperatorAlert } from './operatorAlertsSelectors';
import type { OperatorAlert, OperatorAlertRow } from './operatorAlertsTypes';

export const OPERATOR_ALERTS_QUERY_KEY = ['admin', 'system-health', 'operator-alerts'] as const;

async function fetchUnresolvedOperatorAlerts(): Promise<OperatorAlert[]> {
  const { data, error } = await supabase
    .from('operator_alerts')
    .select('id, created_at, source, severity, title, detail, dedupe_key, resolved_at, resolved_by')
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(row => parseOperatorAlert(row as OperatorAlertRow));
}

export function useOperatorAlerts() {
  return useQuery({
    queryKey: OPERATOR_ALERTS_QUERY_KEY,
    queryFn: fetchUnresolvedOperatorAlerts,
    staleTime: 30_000,
    // Polls like the health snapshot beside it. Without this a failed read
    // stays failed for the life of the tab, and both surfaces that show this
    // count tell the operator it will retry when nothing would.
    refetchInterval: 60_000,
  });
}

/** Resolves an alert via the SECURITY DEFINER `resolve_operator_alert` RPC
 * (site-admin-gated inside the function; no direct UPDATE grant exists on the
 * table). On success, invalidates the unresolved list so the board drops it. */
export function useResolveOperatorAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string): Promise<void> => {
      const { error } = await supabase.rpc('resolve_operator_alert', { p_alert_id: alertId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OPERATOR_ALERTS_QUERY_KEY });
    },
  });
}
