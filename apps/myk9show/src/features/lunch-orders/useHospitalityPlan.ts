import { onlineManager, useQueries } from '@tanstack/react-query';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { queryKeys } from '@/lib/queryClient';
import type { ReadinessQuery } from '@/hooks/queries/reportReadiness';
import { useJudgesOnDays } from './judgesOnDays';
import { buildHospitalityPlanDay, type HospitalityPlanDay } from './hospitalityPlan';
import { lunchOrdersService } from './lunchOrdersService';
import { useVolunteersOnDays } from './useLunchOrders';

export interface HospitalityPlanData {
  days: HospitalityPlanDay[];
  isLoading: boolean;
  isError: boolean;
  /** The Reports page's readiness input; Print waits on it so the paper is never half-filled. */
  readiness: ReadinessQuery;
  refetch: () => void;
}

/**
 * Host-side read for the Hospitality plan report (MYK9-1695): the same four sources the Show Desk
 * Lunch orders list reads (judges, officials, volunteers, saved lunch rows), so both agree.
 * All four are online-only planning reads; nothing is fetched unless the report is selected.
 */
export function useHospitalityPlan(
  showId: string | undefined,
  trialIds: readonly string[],
  enabled: boolean
): HospitalityPlanData {
  const active = enabled && Boolean(showId);
  const judges = useJudgesOnDays(showId ?? '', trialIds, active);
  const volunteers = useVolunteersOnDays(showId ?? '', trialIds, active);
  const officials = useShowOfficials(active ? showId : undefined);
  const orders = useQueries({
    queries: trialIds.map(trialId => ({
      queryKey: queryKeys.lunchOrders(trialId),
      queryFn: () => lunchOrdersService.listForTrial(trialId),
      enabled: active,
    })),
  });

  const isError =
    judges.isError || volunteers.isError || officials.isError || orders.some(q => q.isError);
  const hasData =
    judges.hasData &&
    volunteers.data !== undefined &&
    officials.data !== undefined &&
    orders.every(q => q.data !== undefined);

  const days = hasData
    ? trialIds.map((trialId, index) =>
        buildHospitalityPlanDay({
          trialId,
          saved: orders[index]?.data ?? [],
          judges: judges.byTrial.get(trialId) ?? [],
          officials: officials.data,
          volunteers: volunteers.data ?? [],
        })
      )
    : [];

  return {
    days,
    isLoading: active && !hasData && !isError,
    isError,
    readiness: {
      hasData,
      isPlaceholderData: false,
      fetchStatus: hasData ? 'idle' : onlineManager.isOnline() ? 'fetching' : 'paused',
      isError,
    },
    refetch: () => {
      judges.refetch();
      volunteers.refetch();
      void officials.refetch();
      orders.forEach(q => void q.refetch());
    },
  };
}
