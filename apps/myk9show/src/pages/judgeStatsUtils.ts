export interface JudgeClass {
  id: string;
  showId: string;
  trialId: string;
  classId: string;
  name: string;
  element: string;
  level: string;
  /** Trial date as a local-calendar ISO string (yyyy-mm-dd), used to bucket today vs upcoming. */
  trialDate: string;
  scheduledTime: Date;
  /** Rings are not modeled on classes yet; null hides the ring label. */
  ringNumber: number | null;
  totalEntries: number;
  completedEntries: number;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface JudgeAssignmentBuckets {
  today: JudgeClass[];
  upcoming: JudgeClass[];
  completed: JudgeClass[];
}

/** Local-calendar date (yyyy-mm-dd) — trials.date is the show's local date, so UTC slicing would mis-bucket evening trials. */
export function localIsoDate(epochMs: number): string {
  const d = new Date(epochMs);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function splitJudgeAssignments(
  assignments: JudgeClass[],
  todayIso: string
): JudgeAssignmentBuckets {
  return {
    today: assignments.filter(c => c.trialDate === todayIso),
    upcoming: assignments.filter(c => c.trialDate > todayIso),
    // Past non-completed classes land here too, so unfinished work from an
    // earlier show day stays reachable instead of vanishing from every tab.
    completed: assignments.filter(c => c.status === 'completed' || c.trialDate < todayIso),
  };
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
