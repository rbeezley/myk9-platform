/**
 * Data hooks for SecretaryDashboard
 */

import { useMemo } from 'react';
import { useShowStore } from '@/store/showStore';
import type { TrialOverview, DashboardStatistics } from './secretary-dashboard-types';

/**
 * Hook to transform shows data into trials format
 */
export function useTrialsData() {
  const { shows, isLoading } = useShowStore();

  const allTrials = useMemo(() => {
    const trials: TrialOverview[] = [];

    shows.forEach((show) => {
      if (show.trials && show.trials.length > 0) {
        show.trials.forEach((trial) => {
          trials.push({
            id: trial.id,
            showId: show.id,
            name: trial.name,
            date: new Date(trial.date),
            totalClasses: 0,
            completedClasses: 0,
            totalEntries: 0,
            processedEntries: 0,
            status: trial.status as 'upcoming' | 'active' | 'completed',
          });
        });
      } else {
        const showDate = new Date(show.startDate);
        const now = new Date();
        let status: 'upcoming' | 'active' | 'completed' = 'upcoming';

        if (showDate < now && new Date(show.endDate) > now) {
          status = 'active';
        } else if (new Date(show.endDate) < now) {
          status = 'completed';
        }

        trials.push({
          id: show.id,
          showId: show.id,
          name: show.name,
          date: showDate,
          totalClasses: 0,
          completedClasses: 0,
          totalEntries: 0,
          processedEntries: 0,
          status,
        });
      }
    });

    return trials;
  }, [shows]);

  const activeTrials = useMemo(
    () => allTrials.filter((t) => t.status === 'active'),
    [allTrials]
  );

  const upcomingTrials = useMemo(
    () => allTrials.filter((t) => t.status === 'upcoming'),
    [allTrials]
  );

  const completedTrials = useMemo(
    () => allTrials.filter((t) => t.status === 'completed'),
    [allTrials]
  );

  return {
    shows,
    isLoading,
    allTrials,
    activeTrials,
    upcomingTrials,
    completedTrials,
  };
}

/**
 * Hook to calculate dashboard statistics from trials data
 */
export function useStatistics(allTrials: TrialOverview[]) {
  return useMemo<DashboardStatistics>(() => {
    const activeTrialsCount = allTrials.filter((t) => t.status === 'active').length;
    const totalEntries = allTrials.reduce((sum, trial) => sum + trial.totalEntries, 0);
    const processedEntries = allTrials.reduce(
      (sum, trial) => sum + trial.processedEntries,
      0
    );
    const resultsPublished =
      totalEntries > 0 ? Math.round((processedEntries / totalEntries) * 100) : 0;

    const avgProcessing = activeTrialsCount > 0 ? 12 : 0;

    return {
      activeTrials: activeTrialsCount,
      totalEntries,
      resultsPublished,
      avgProcessing,
    };
  }, [allTrials]);
}

/**
 * Combined hook for all secretary dashboard data
 */
export function useSecretaryDashboardData() {
  const trialsData = useTrialsData();
  const statistics = useStatistics(trialsData.allTrials);

  return {
    ...trialsData,
    statistics,
  };
}
