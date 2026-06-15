import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import {
  getJudgeAssignmentTrends,
  getJudgeQualificationAlerts,
  getJudgeQualificationSummary,
  getJudgeRosterSummary,
  getJudgeStats,
  getJudgeUpcomingAssignments,
  getJudgeUtilizationStats,
  type JudgeUtilizationFilters,
} from '@/services/database/judges';

export function useJudgeRosterSummary() {
  return useQuery({
    queryKey: queryKeys.judges.rosterSummary(),
    queryFn: () => getJudgeRosterSummary(),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeUtilizationStats(filters?: JudgeUtilizationFilters) {
  return useQuery({
    queryKey: queryKeys.judges.utilization(filters as Record<string, unknown> | undefined),
    queryFn: () => getJudgeUtilizationStats(filters),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeQualificationAlerts(withinDays: number = 30) {
  return useQuery({
    queryKey: queryKeys.judges.alerts(withinDays),
    queryFn: () => getJudgeQualificationAlerts(withinDays),
    ...cacheStrategies.moderate,
  });
}

export function useJudgeAssignmentTrends(year?: number) {
  return useQuery({
    queryKey: queryKeys.judges.trends(year),
    queryFn: () => getJudgeAssignmentTrends(year),
    ...cacheStrategies.moderate,
  });
}

export function useMyJudgeStats(personId: string | undefined, year?: number) {
  return useQuery({
    queryKey: queryKeys.judges.myStats(personId ?? '', year),
    queryFn: () => getJudgeStats(personId!, year),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}

export function useUpcomingJudgeAssignments(personId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judges.upcoming(personId ?? ''),
    queryFn: () => getJudgeUpcomingAssignments(personId!),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}

export function useJudgeQualificationSummary(personId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.judges.qualificationSummary(personId ?? ''),
    queryFn: () => getJudgeQualificationSummary(personId!),
    enabled: !!personId,
    ...cacheStrategies.moderate,
  });
}
