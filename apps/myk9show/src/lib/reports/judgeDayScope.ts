/**
 * MYK9-1030: the Reports page's judge + day scope — every class one judge judged on one date,
 * across trials, so one marked Result Catalog prints per judge per day.
 *
 * The report rows arrive show-wide (no trial picked); this narrows them. A class's judge is its
 * judge assignment's `person_id` — the same id the Show Map keys a judge's day on — and its day is
 * its trial's date.
 */
import { formatJudgeDayDate, groupClassesByJudgeDay } from '@/features/show-map/judgeDay';
import { resolveClassJudgeName } from '@/utils/classJudgeDisplay';
import type { ReportScope } from './types';

interface ReportTrialLike {
  id: string;
  date?: string | null;
}

interface ReportClassLike {
  id: string;
  trial_id?: string | null;
  judge_assignments?: unknown;
}

interface ReportEntryLike {
  class_id?: string | null;
}

/** The class's judge (`people.id`): its confirmed assignment, else its first one. */
export function reportClassJudgeId(cls: ReportClassLike): string | undefined {
  const assignments = Array.isArray(cls.judge_assignments)
    ? (cls.judge_assignments as Array<Record<string, unknown>>)
    : [];
  const confirmed = assignments.find(row => row?.status === 'confirmed');
  const personId = (confirmed ?? assignments[0])?.person_id;
  return typeof personId === 'string' && personId ? personId : undefined;
}

export function filterReportDataToJudgeDay<
  T extends ReportTrialLike,
  C extends ReportClassLike,
  E extends ReportEntryLike,
>(
  data: { trials: readonly T[]; classes: readonly C[]; entries: readonly E[] },
  scope: Extract<ReportScope, { kind: 'judge-day' }>
): { trials: T[]; classes: C[]; entries: E[] } {
  const trials = data.trials.filter(trial => trial.date === scope.date);
  const trialIds = new Set(trials.map(trial => trial.id));
  const classes = data.classes.filter(
    cls => trialIds.has(cls.trial_id ?? '') && reportClassJudgeId(cls) === scope.judgeId
  );
  const classIds = new Set(classes.map(cls => cls.id));
  const keptTrialIds = new Set(classes.map(cls => cls.trial_id));
  return {
    trials: trials.filter(trial => keptTrialIds.has(trial.id)),
    classes,
    entries: data.entries.filter(entry => classIds.has(entry.class_id ?? '')),
  };
}

export interface JudgeDayOption {
  /** `${judgeId}|${date}` — what the Reports control stores. */
  value: string;
  judgeId: string;
  date: string;
  label: string;
}

/** Every judge's day in the show's report rows, by date then judge name. */
export function buildJudgeDayOptions(
  trials: readonly ReportTrialLike[],
  classes: readonly ReportClassLike[]
): JudgeDayOption[] {
  const dateByTrialId = new Map(trials.map(trial => [trial.id, trial.date ?? undefined]));
  const days = groupClassesByJudgeDay(
    classes.map(cls => ({
      id: cls.id,
      trialDate: dateByTrialId.get(cls.trial_id ?? ''),
      judgeId: reportClassJudgeId(cls),
      judgeName: resolveClassJudgeName(cls, [], ''),
    }))
  );
  const options: JudgeDayOption[] = [];
  for (const day of days.values()) {
    if (!day.judgeId || !day.date) continue;
    options.push({
      value: `${day.judgeId}|${day.date}`,
      judgeId: day.judgeId,
      date: day.date,
      label: `${day.judgeName || 'Judge'} · ${formatJudgeDayDate(day.date)}`,
    });
  }
  return options.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}
