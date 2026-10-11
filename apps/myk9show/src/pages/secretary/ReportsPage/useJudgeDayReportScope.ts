/**
 * MYK9-1036: the Result Catalog's "one judge, one day" scope, as the Reports page holds it.
 *
 * A filter over the show-wide read, not a new report scope: the catalog for a judge's day spans
 * trials, and print tracking (paperwork prints) knows only show/trial/class. The picker's options,
 * their labels and the classes the catalog prints all come from `listReportJudgeDays`, so the
 * label and the printout can never name different judges. A deep link names the judge by id
 * (`?judgeId=&day=`), the Show Map's identity, never a name.
 */
import { useCallback, useMemo, useState } from 'react';

import {
  filterToJudgeDay,
  findReportJudgeDay,
  listReportJudgeDays,
  type ReportJudgeDay,
  type ReportJudgeDayClassRow,
  type ReportJudgeDayTrialRow,
} from '@/lib/reports/judgeDayScope';

export const JUDGE_DAY_ALL = 'all';
export const JUDGE_DAY_UNRESOLVED = 'unresolved';
const JUDGE_DAY_REPORT_ID = 'result-catalog';

interface SelectedJudgeDay {
  judgeId: string;
  date: string;
}

export function resolveInitialJudgeDay(params: URLSearchParams): SelectedJudgeDay | null {
  const judgeId = params.get('judgeId')?.trim();
  const date = params.get('day')?.trim();
  return judgeId && date ? { judgeId, date } : null;
}

export function useJudgeDayReportScope<
  C extends ReportJudgeDayClassRow,
  E extends { class_id?: string | null },
>(input: {
  reportType: string;
  initial: SelectedJudgeDay | null;
  classes: readonly C[] | undefined;
  entries: readonly E[] | undefined;
  trials: readonly ReportJudgeDayTrialRow[] | undefined;
}) {
  const { reportType, initial, classes, entries, trials } = input;
  const [selected, setSelected] = useState<SelectedJudgeDay | null>(initial);
  const enabled = reportType === JUDGE_DAY_REPORT_ID;

  const days = useMemo<ReportJudgeDay[]>(
    () => (enabled ? listReportJudgeDays(classes ?? [], trials ?? []) : []),
    [enabled, classes, trials]
  );
  const active = enabled ? findReportJudgeDay(days, selected?.judgeId, selected?.date) : undefined;
  const isFiltering = enabled && selected !== null;

  // A selected day that the loaded classes do not contain prints NOTHING rather than the whole show.
  const scoped = useMemo(() => {
    if (!isFiltering) return null;
    return active
      ? filterToJudgeDay(active, classes ?? [], entries ?? [])
      : { classes: [] as C[], entries: [] as E[] };
  }, [isFiltering, active, classes, entries]);

  const select = useCallback(
    (key: string) => {
      const day = days.find(item => item.key === key);
      setSelected(day ? { judgeId: day.judgeId, date: day.date } : null);
    },
    [days]
  );
  const clear = useCallback(() => setSelected(null), []);

  return {
    isFiltering,
    options: days.map(day => ({ key: day.key, label: day.label })),
    value: active ? active.key : isFiltering ? JUDGE_DAY_UNRESOLVED : JUDGE_DAY_ALL,
    select,
    clear,
    scoped,
  };
}
