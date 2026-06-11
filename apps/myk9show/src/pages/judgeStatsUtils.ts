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
  /** IANA timezone of the trial; "today" is computed in this zone, not the device's. */
  trialTimezone: string;
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

/**
 * Current calendar date (yyyy-mm-dd) in a given IANA timezone. Near midnight a
 * judge whose device is in a different zone from the show would otherwise see
 * today's class bucketed as Upcoming. Falls back to device-local on bad input.
 */
export function currentDateInTimeZone(epochMs: number, timeZone: string): string {
  try {
    // en-CA renders ISO-style yyyy-mm-dd.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(epochMs);
  } catch {
    return localIsoDate(epochMs);
  }
}

export function splitJudgeAssignments(
  assignments: JudgeClass[],
  nowMs: number
): JudgeAssignmentBuckets {
  // Bucket each class against "today" in its OWN trial timezone, since a judge
  // can hold assignments across shows in different zones.
  const todayFor = (c: JudgeClass) => currentDateInTimeZone(nowMs, c.trialTimezone);
  return {
    today: assignments.filter(c => c.trialDate === todayFor(c)),
    upcoming: assignments.filter(c => c.trialDate > todayFor(c)),
    // Past non-completed classes land here too, so unfinished work from an
    // earlier show day stays reachable instead of vanishing from every tab.
    completed: assignments.filter(c => c.status === 'completed' || c.trialDate < todayFor(c)),
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
