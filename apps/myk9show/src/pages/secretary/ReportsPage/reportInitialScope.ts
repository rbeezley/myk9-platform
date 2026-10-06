import { getReportById } from '@/lib/reports/reportRegistry';
import { judgeDayValueFromParams } from './useJudgeDayReportRows';

const DEFAULT_REPORT_ID = 'check-in-sheet';

export interface InitialReportScope {
  trialId: string;
  classId: string;
  dogId: string;
  /** MYK9-1030: `'all'` or `${judgeId}|${date}` (from `?judgeId=&date=`). */
  judgeDay: string;
}

function nonEmptyParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

// Kept out of the page component so the deep-link logic is testable without
// asserting against shadcn SelectValue render internals.
export function resolveInitialReportId(queryParam: string | null): string {
  if (!queryParam) return DEFAULT_REPORT_ID;
  const candidate = getReportById(queryParam);
  return candidate?.enabled ? queryParam : DEFAULT_REPORT_ID;
}

export function resolveInitialReportScope(params: URLSearchParams): InitialReportScope {
  return {
    trialId: nonEmptyParam(params, 'trialId') ?? 'all',
    classId: nonEmptyParam(params, 'classId') ?? 'all',
    dogId: nonEmptyParam(params, 'dogId') ?? 'all',
    judgeDay: judgeDayValueFromParams(params),
  };
}
