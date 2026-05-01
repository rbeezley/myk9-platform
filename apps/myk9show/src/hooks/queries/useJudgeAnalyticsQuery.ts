import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  judgeAnalyticsQueries,
  judgeQualificationQueries,
  type JudgeUtilizationFilters,
} from '@/services/database/judges';

export function useJudgeRosterSummary() {
  return useQuery({
    queryKey: queryKeys.judges.rosterSummary(),
    queryFn: () => judgeAnalyticsQueries.getRosterSummary(),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeUtilizationStats(filters?: JudgeUtilizationFilters) {
  return useQuery({
    queryKey: queryKeys.judges.utilization(filters as Record<string, unknown> | undefined),
    queryFn: () => judgeAnalyticsQueries.getUtilizationStats(filters),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeQualificationAlerts(withinDays: number = 30) {
  return useQuery({
    queryKey: queryKeys.judges.alerts(withinDays),
    queryFn: () => judgeAnalyticsQueries.getQualificationAlerts(withinDays),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeAssignmentTrends(year?: number) {
  return useQuery({
    queryKey: queryKeys.judges.trends(year),
    queryFn: () => judgeAnalyticsQueries.getAssignmentTrends(year),
    ...cacheStrategies.moderate,
  });
}

export function useMyJudgeStats(personId: string | undefined, year?: number) {
  return useQuery({
    queryKey: queryKeys.judges.myStats(personId ?? '', year),
    queryFn: () => judgeAnalyticsQueries.getMyStats(personId!, year),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}

export function useUpcomingJudgeAssignments(personId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judges.upcoming(personId ?? ''),
    queryFn: () => judgeAnalyticsQueries.getUpcomingAssignments(personId!),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}

export function useJudgeQualificationSummary(personId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judges.qualificationSummary(personId ?? ''),
    queryFn: () => judgeQualificationQueries.getSummary(personId!),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}
