/**
 * MYK9-1036: the Result Catalog's judge + day scope — every class one judge judged on one date,
 * across trials, so the judge can initial one marked catalog at the end of the day.
 *
 * ONE source feeds the picker's options, their labels and the printed classes: `listReportJudgeDays`.
 * The judge is the Show Map's identity: the confirmed assignment's person id, resolved by
 * `resolveClassJudgeFields` (never a name match, and never an invited/declined assignment). The
 * grouping is `groupClassesByJudgeDay`, the same one the sign-off uses. The day is the trial's
 * calendar date, as the Show Map reads it, never the browser's date.
 */
import {
  formatJudgeDayDate,
  groupClassesByJudgeDay,
  trialCalendarDate,
} from '@/features/show-map/judgeDay';
import { resolveClassJudgeFields } from '@/services/database/_shared/classJudgeFields';

export interface ReportJudgeDayClassRow {
  id: string;
  trial_id?: string | null | undefined;
  judge_assignments?: unknown;
}

export interface ReportJudgeDayTrialRow {
  id: string;
  date?: string | null | undefined;
}

export interface ReportJudgeDay {
  /** The Show Map's `judgeDayKey`: the judge id and the date. */
  key: string;
  judgeId: string;
  judgeName?: string | undefined;
  /** `YYYY-MM-DD`, the trial date. */
  date: string;
  /** "Pat Lee · Sat, Oct 10": the picker option, naming the judge the catalog prints. */
  label: string;
  classIds: string[];
}

const JUDGE_NAME_UNAVAILABLE = 'Judge name unavailable';

/** Every judge's day among the show's classes, in class order; a class with no judge is in none. */
export function listReportJudgeDays(
  classes: readonly ReportJudgeDayClassRow[],
  trials: readonly ReportJudgeDayTrialRow[]
): ReportJudgeDay[] {
  const dateByTrialId = new Map(
    trials.map(trial => [trial.id, trialCalendarDate(trial.date)] as const)
  );
  const resolved = classes.flatMap(row => {
    const judge = resolveClassJudgeFields({ judge_assignments: row.judge_assignments });
    const trialDate = row.trial_id ? dateByTrialId.get(row.trial_id) : undefined;
    return judge.personId && trialDate
      ? [{ id: row.id, trialDate, judgeId: judge.personId, judgeName: judge.name }]
      : [];
  });
  // One name per judge id, so every class of a judge (and so the label) names the same person
  // even when only some of that judge's class rows carried the name.
  const nameByJudgeId = new Map<string, string>();
  for (const item of resolved) {
    if (item.judgeName && !nameByJudgeId.has(item.judgeId)) {
      nameByJudgeId.set(item.judgeId, item.judgeName);
    }
  }
  const days = groupClassesByJudgeDay(
    resolved.map(item => ({ ...item, judgeName: nameByJudgeId.get(item.judgeId) }))
  );
  return [...days.values()].flatMap(day =>
    day.judgeId && day.date
      ? [
          {
            key: day.key,
            judgeId: day.judgeId,
            judgeName: day.judgeName,
            date: day.date,
            label: `${day.judgeName ?? JUDGE_NAME_UNAVAILABLE} · ${formatJudgeDayDate(day.date)}`,
            classIds: day.classIds,
          },
        ]
      : []
  );
}

/** The day's classes, and only the entries in them. */
export function filterToJudgeDay<C extends { id: string }, E extends { class_id?: string | null }>(
  day: ReportJudgeDay,
  classes: readonly C[],
  entries: readonly E[]
): { classes: C[]; entries: E[] } {
  const ids = new Set(day.classIds);
  return {
    classes: classes.filter(row => ids.has(row.id)),
    entries: entries.filter(entry => (entry.class_id ? ids.has(entry.class_id) : false)),
  };
}
