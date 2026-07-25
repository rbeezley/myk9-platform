import type { ReportDefinition, ReportScope } from './types';

export function resolveReportScope(input: {
  showId: string;
  trialId?: string | null;
  classId?: string | null;
}): ReportScope {
  const trialId = input.trialId?.trim();
  const classId = input.classId?.trim();
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
  return params;
}
