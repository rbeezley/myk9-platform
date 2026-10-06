import { useMemo } from 'react';

import {
  buildJudgeDayOptions,
  filterReportDataToJudgeDay,
  type JudgeDayOption,
} from '@/lib/reports/judgeDayScope';
import type { ReportScope } from '@/lib/reports/types';

/** The control value a `?judgeId=&date=` deep link opens on (the Show Map's marked catalog). */
export function judgeDayValueFromParams(params: URLSearchParams): string {
  const judgeId = params.get('judgeId')?.trim();
  const date = params.get('date')?.trim();
  return judgeId && date ? `${judgeId}|${date}` : 'all';
}

/** `'all'`, or `${judgeId}|${date}` — the Reports page's judge-day control value. */
export function parseJudgeDayValue(value: string): { judgeId?: string; date?: string } {
  if (value === 'all') return {};
  const [judgeId, date] = value.split('|');
  return judgeId && date ? { judgeId, date } : {};
}

/**
 * MYK9-1030: the report rows for the page's scope. A judge-day scope narrows the show-wide rows to
 * that judge's classes on that date, across trials; any other scope passes them through. Also
 * lists every judge's day the rows hold, for the control.
 */
export function useJudgeDayReportRows<T, C, E>(input: {
  scope: ReportScope;
  trials: T[] | undefined;
  classes: C[] | undefined;
  entries: E[] | undefined;
}): {
  trials: T[] | undefined;
  classes: C[] | undefined;
  entries: E[] | undefined;
  options: JudgeDayOption[];
} {
  const { scope, trials, classes, entries } = input;
  const options = useMemo(
    () =>
      buildJudgeDayOptions(
        (trials ?? []) as unknown as Parameters<typeof buildJudgeDayOptions>[0],
        (classes ?? []) as unknown as Parameters<typeof buildJudgeDayOptions>[1]
      ),
    [classes, trials]
  );
  const rows = useMemo(() => {
    if (scope.kind !== 'judge-day' || !trials || !classes || !entries) {
      return { trials, classes, entries };
    }
    type Rows = Parameters<typeof filterReportDataToJudgeDay>[0];
    const narrowed = filterReportDataToJudgeDay(
      { trials, classes, entries } as unknown as Rows,
      scope
    );
    return narrowed as unknown as { trials: T[]; classes: C[]; entries: E[] };
  }, [classes, entries, scope, trials]);
  return { ...rows, options };
}
