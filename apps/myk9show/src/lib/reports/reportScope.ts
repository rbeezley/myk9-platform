import type { ReportDefinition, ReportScope } from './types';

export function resolveReportScope(input: {
  showId: string;
  trialId?: string | null;
  classId?: string | null;
  /** MYK9-1030: a judge's day; used only when no trial is picked. */
  judgeId?: string | null;
  date?: string | null;
}): ReportScope {
  const trialId = input.trialId?.trim();
  const classId = input.classId?.trim();
  const judgeId = input.judgeId?.trim();
  const date = input.date?.trim();
  if ((!trialId || trialId === 'all') && judgeId && judgeId !== 'all' && date) {
    return { kind: 'judge-day', showId: input.showId, judgeId, date };
  }
  if (trialId && trialId !== 'all' && classId && classId !== 'all') {
    return { kind: 'class', showId: input.showId, trialId, classId };
  }
  if (trialId && trialId !== 'all') {
    return { kind: 'trial', showId: input.showId, trialId };
  }
  return { kind: 'show', showId: input.showId };
}

export function isReportScopeSupported(
  report: Pick<ReportDefinition, 'scopes'> | null | undefined,
  scope: ReportScope
): boolean {
  return report?.scopes.includes(scope.kind) ?? false;
}

export function getReportScopeSearchParams(scope: ReportScope): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.kind === 'trial' || scope.kind === 'class') params.set('trialId', scope.trialId);
  if (scope.kind === 'class') params.set('classId', scope.classId);
  if (scope.kind === 'judge-day') {
    params.set('judgeId', scope.judgeId);
    params.set('date', scope.date);
  }
  return params;
}
