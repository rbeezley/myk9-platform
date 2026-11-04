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

export interface HospitalityTrialRef {
  id: string;
  /** The trial's calendar date; trials sharing one are planned as one day. */
  date: string | null | undefined;
}

/**
 * Host-side read for the Hospitality plan report (MYK9-1695): the same four sources the Show Desk
 * Lunch orders list reads (judges, officials, volunteers, saved lunch rows), so both agree.
 * Two trials on one calendar date make ONE day, so shared workers are counted once.
 * All four are online-only planning reads; nothing is fetched unless the report is selected.
 */
export function useHospitalityPlan(
  showId: string | undefined,
  trials: readonly HospitalityTrialRef[],
  enabled: boolean
): HospitalityPlanData {
  const active = enabled && Boolean(showId);
  const trialIds = trials.map(trial => trial.id);
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
  const isFetching =
    judges.isFetching ||
    volunteers.isFetching ||
    officials.isFetching ||
    orders.some(q => q.isFetching);

  const days: HospitalityPlanDay[] = [];
  if (hasData) {
    const byDate = new Map<string, HospitalityTrialRef[]>();
    for (const trial of trials) {
      const date = trial.date ?? '';
      byDate.set(date, [...(byDate.get(date) ?? []), trial]);
    }
    for (const [date, sameDate] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
      days.push(
        buildHospitalityPlanDay(
          date,
          sameDate.map(trial => ({
            trialId: trial.id,
            saved: orders[trialIds.indexOf(trial.id)]?.data ?? [],
            judges: judges.byTrial.get(trial.id) ?? [],
            officials: officials.data,
            volunteers: volunteers.data ?? [],
          }))
        )
      );
    }
  }

  return {
    days,
    isLoading: active && !hasData && !isError,
    isError,
    readiness: {
      hasData,
      isPlaceholderData: false,
      // A refetch over cached rows reads 'fetching' so Print waits for the fresh answer.
      fetchStatus: isFetching
        ? 'fetching'
        : hasData || onlineManager.isOnline()
          ? 'idle'
          : 'paused',
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
