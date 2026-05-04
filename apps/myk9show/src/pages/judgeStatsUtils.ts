export interface JudgeClass {
  id: string;
  showId: string;
  trialId: string;
  classId: string;
  name: string;
  element: string;
  level: string;
  scheduledTime: Date;
  ringNumber: number;
  totalEntries: number;
  completedEntries: number;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface JudgeDashboardStats {
  completedCount: number;
  totalEntries: number;
  judgedEntries: number;
  completionRate: number | null;
  nextClass: JudgeClass | undefined;
  minutesUntilNext: number | null;
}

export function deriveJudgeDashboardStats(
  assignments: JudgeClass[],
  now: number
): JudgeDashboardStats {
  const completedCount = assignments.filter(c => c.status === 'completed').length;
  const totalEntries = assignments.reduce((sum, c) => sum + c.totalEntries, 0);
  const judgedEntries = assignments.reduce((sum, c) => sum + c.completedEntries, 0);
  const completionRate = totalEntries > 0 ? Math.round((judgedEntries / totalEntries) * 100) : null;
  const nextClass = assignments
    .filter(c => c.status !== 'completed')
    .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())[0];
  const minutesUntilNext = nextClass
    ? Math.max(0, Math.round((nextClass.scheduledTime.getTime() - now) / 60000))
    : null;
  return {
    completedCount,
    totalEntries,
    judgedEntries,
    completionRate,
    nextClass,
    minutesUntilNext,
  };
}
