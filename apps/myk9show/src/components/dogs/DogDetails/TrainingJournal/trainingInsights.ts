export type TrainingProgress = 'excellent' | 'good' | 'fair' | 'needs_work';

export interface TrainingInsightEntry {
  date: Date;
  duration: number;
  skills: string[];
  progress: TrainingProgress;
}

export interface TrainingProgressReport {
  totalSessions: number;
  totalMinutes: number;
  bySkill: Array<{ skill: string; sessions: number; minutes: number }>;
  progressCounts: Record<TrainingProgress, number>;
  monthlyMinutes: Array<{ month: string; minutes: number; sessions: number }>;
}

const progressOrder: TrainingProgress[] = ['excellent', 'good', 'fair', 'needs_work'];

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

export const buildTrainingProgressReport = (
  entries: TrainingInsightEntry[]
): TrainingProgressReport => {
  const bySkill = new Map<string, { skill: string; sessions: number; minutes: number }>();
  const monthlyMinutes = new Map<string, { month: string; minutes: number; sessions: number }>();
  const progressCounts: Record<TrainingProgress, number> = {
    excellent: 0,
    good: 0,
    fair: 0,
    needs_work: 0,
  };

  entries.forEach(entry => {
    progressCounts[entry.progress] += 1;

    const month = getMonthLabel(entry.date);
    const currentMonth = monthlyMinutes.get(month) || { month, minutes: 0, sessions: 0 };
    currentMonth.minutes += entry.duration;
    currentMonth.sessions += 1;
    monthlyMinutes.set(month, currentMonth);

    const skills = entry.skills.length > 0 ? entry.skills : ['General'];
    skills.forEach(skill => {
      const currentSkill = bySkill.get(skill) || { skill, sessions: 0, minutes: 0 };
      currentSkill.sessions += 1;
      currentSkill.minutes += entry.duration;
      bySkill.set(skill, currentSkill);
    });
  });

  return {
    totalSessions: entries.length,
    totalMinutes: entries.reduce((sum, entry) => sum + entry.duration, 0),
    bySkill: Array.from(bySkill.values()).sort((a, b) => b.sessions - a.sessions),
    progressCounts,
    monthlyMinutes: Array.from(monthlyMinutes.values()).sort(
      (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime()
    ),
  };
};

export const getProgressReportRows = (report: TrainingProgressReport) =>
  progressOrder.map(progress => ({ progress, count: report.progressCounts[progress] }));
