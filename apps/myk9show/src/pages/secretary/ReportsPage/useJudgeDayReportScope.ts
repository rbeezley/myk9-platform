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

import type { ReportDataState } from '@/hooks/queries/useReportData';
import {
  filterToJudgeDay,
  listReportJudgeDays,
  type ReportJudgeDay,
  type ReportJudgeDayClassRow,
  type ReportJudgeDayTrialRow,
} from '@/lib/reports/judgeDayScope';

const JUDGE_DAY_REPORT_ID = 'result-catalog';
const ALL = 'all';
const LOADING = 'loading';
const UNRESOLVED = 'unresolved';

/** What the controls bar needs to draw the picker; the hook owns every value and string. */
export interface JudgeDayControl {
  /** The "All judges" choice first, then one option per judge day. */
  options: ReadonlyArray<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
  /** The trigger text: always a human label, never the raw value. */
  selectedLabel: string;
  /** Shown beside the picker when the linked judge day is not in this show. */
  notice?: string | undefined;
}

interface SelectedJudgeDay {
  judgeId: string;
  date: string;
}

export const JUDGE_DAY_NOT_FOUND_MESSAGE =
  "That judge's day isn't in this show. Pick another from Judge's day.";

function selectedFromParams(params: URLSearchParams): SelectedJudgeDay | null {
  const judgeId = params.get('judgeId')?.trim();
  const date = params.get('day')?.trim();
  return judgeId && date ? { judgeId, date } : null;
}

export function useJudgeDayReportScope<
  C extends ReportJudgeDayClassRow,
  E extends { class_id?: string | null },
>(input: {
  reportType: string;
  /** Read once, on mount: a deep link names the judge and day. */
  searchParams: URLSearchParams;
  classes: readonly C[] | undefined;
  entries: readonly E[] | undefined;
  trials: readonly ReportJudgeDayTrialRow[] | undefined;
  dataState: ReportDataState;
}) {
  const { reportType, searchParams, classes, entries, trials, dataState } = input;
  const [selected, setSelected] = useState<SelectedJudgeDay | null>(() =>
    selectedFromParams(searchParams)
  );
  const enabled = reportType === JUDGE_DAY_REPORT_ID;

  const days = useMemo<ReportJudgeDay[]>(
    () => (enabled ? listReportJudgeDays(classes ?? [], trials ?? []) : []),
    [enabled, classes, trials]
  );
  const active = selected
    ? days.find(day => day.judgeId === selected.judgeId && day.date === selected.date)
    : undefined;
  const isFiltering = enabled && selected !== null;
  // "Not found" is only a fact once the classes have loaded; before that it is just not here yet.
  const notFound = isFiltering && !active && dataState === 'ready';

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

  const options = useMemo(
    () => [
      { key: ALL, label: 'All judges' },
      ...days.map(day => ({ key: day.key, label: day.label })),
    ],
    [days]
  );
  const value = active ? active.key : isFiltering ? (notFound ? UNRESOLVED : LOADING) : ALL;
  const selectedLabel =
    options.find(option => option.key === value)?.label ??
    (value === UNRESOLVED ? 'Judge and day not found' : 'Loading judges…');

  const control: JudgeDayControl | undefined = enabled
    ? {
        options,
        value,
        onChange: select,
        selectedLabel,
        notice: notFound ? JUDGE_DAY_NOT_FOUND_MESSAGE : undefined,
      }
    : undefined;

  return {
    isFiltering,
    scoped,
    clear,
    control,
    notFoundMessage: notFound ? JUDGE_DAY_NOT_FOUND_MESSAGE : null,
  };
}
