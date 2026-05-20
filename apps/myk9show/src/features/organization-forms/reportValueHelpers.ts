import type { ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';

export function textOrUndefined(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

export function formattedTrialDate(props: ReportProps): string | undefined {
  return props.trial?.date ? formatReportDate(props.trial.date) : undefined;
}

export function trialEventNumber(props: ReportProps): string | undefined {
  return textOrUndefined(props.trial?.trialNumber);
}

export function uniqueTrialJudgeNames(props: ReportProps): string[] {
  const names =
    props.allClasses
      ?.map(cls => textOrUndefined(cls.judgeName))
      .filter((name): name is string => Boolean(name)) ?? [];
  if (names.length === 0) {
    const fallback = textOrUndefined(props.trial?.judgeName);
    if (fallback) names.push(fallback);
  }

  return [...new Set(names)];
}
