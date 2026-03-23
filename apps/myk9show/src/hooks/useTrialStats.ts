import { useMemo } from 'react';
import type { TrialStatisticsData } from '@/components/trials/TrialDetail/TrialStatistics';
import type { TrialClass } from '@/components/trials/types/trial.types';

interface TrialForStats {
  status?: string;
  classes?: TrialClass[];
}

interface EntryForStats {
  classId: string;
  status?: string;
}

const EMPTY_STATS: TrialStatisticsData = {
  judges: { total: 0, active: 0, onBreak: 0, percentChange: 0 },
  classes: { total: 0, upcoming: 0, completed: 0, percentChange: 0 },
  entries: { total: 0, upcoming: 0, completed: 0, percentChange: 0 },
  qualifiedRate: { percent: 0, qualified: 0, total: 0, percentChange: 0 },
};

export function useTrialStats(
  trial: TrialForStats | undefined,
  allEntries: EntryForStats[]
): TrialStatisticsData {
  return useMemo(() => {
    if (!trial?.classes) return EMPTY_STATS;

    const totalClasses = trial.classes.length;
    const completedClasses = trial.classes.filter(
      (c: TrialClass) => c.status === 'Completed'
    ).length;
    const upcomingClasses = totalClasses - completedClasses;

    const totalEntries = trial.classes.reduce(
      (sum: number, c: TrialClass) => sum + (c.entries || 0),
      0
    );
    const completedEntries = trial.classes
      .filter((c: TrialClass) => c.status === 'Completed')
      .reduce((sum: number, c: TrialClass) => sum + (c.entries || 0), 0);
    const upcomingEntries = totalEntries - completedEntries;

    // Count unique judges from class assignments
    const uniqueJudges = new Set(
      trial.classes.map((c: TrialClass) => c.judgeId).filter((id: string) => id && id !== 'TBD')
    );
    const totalJudges = uniqueJudges.size;
    const activeJudges =
      trial.status === 'In Progress'
        ? trial.classes
            .filter((c: TrialClass) => c.status === 'In Progress')
            .reduce((judges: Set<string>, c: TrialClass) => {
              if (c.judgeId && c.judgeId !== 'TBD') judges.add(c.judgeId);
              return judges;
            }, new Set<string>()).size
        : 0;

    // Count qualified entries from actual competition results
    const trialEntries = allEntries.filter(e =>
      trial.classes!.some((c: TrialClass) => c.id === e.classId)
    );
    const qualifiedEntries = trialEntries.filter(e => e.status === 'Qualified').length;
    const scoredEntries = trialEntries.filter(
      e => e.status === 'Qualified' || e.status === 'Not Qualified'
    ).length;

    return {
      judges: {
        total: totalJudges,
        active: activeJudges,
        onBreak: 0,
        percentChange: totalJudges > 0 ? Math.round((activeJudges / totalJudges) * 100) : 0,
      },
      classes: {
        total: totalClasses,
        upcoming: upcomingClasses,
        completed: completedClasses,
        percentChange: totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0,
      },
      entries: {
        total: totalEntries,
        upcoming: upcomingEntries,
        completed: completedEntries,
        percentChange: totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0,
      },
      qualifiedRate: {
        percent: scoredEntries > 0 ? Math.round((qualifiedEntries / scoredEntries) * 100) : 0,
        qualified: qualifiedEntries,
        total: scoredEntries,
        percentChange: scoredEntries > 0 ? Math.round((qualifiedEntries / scoredEntries) * 100) : 0,
      },
    };
  }, [trial, allEntries]);
}
