import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { AKC_SCENT_WORK_REPORT_FEE_PER_RUN } from '@/lib/reports/reportConstants';
import { AKC_TRIAL_SECRETARY_REPORT_FIELDS } from './akcTrialSecretaryReportFields';
import type { PdfFormFillValues } from './pdfForm';

const WITHDRAWN_RUN_STATUS_CODES = new Set([
  'pulled',
  'scratch',
  'scratched',
  'no show',
  'no-show',
  'wd',
  'withdrawn',
]);

function isWithdrawn(entry: ReportEntry): boolean {
  const statuses = [entry.checkInStatus, entry.resultText]
    .map(status => status?.trim().toLowerCase())
    .filter((status): status is string => Boolean(status));

  return statuses.some(status => WITHDRAWN_RUN_STATUS_CODES.has(status));
}

function textOrUndefined(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

export function buildAKCTrialSecretaryReportValues(props: ReportProps): PdfFormFillValues {
  const trialDate = props.trial?.date ? formatReportDate(props.trial.date) : '';
  const withdrawn = props.entries.filter(isWithdrawn).length;
  const runsPaid = Math.max(0, props.entries.length - withdrawn);
  const totalFee = (runsPaid * AKC_SCENT_WORK_REPORT_FEE_PER_RUN).toFixed(2);
  const text: NonNullable<PdfFormFillValues['text']> = {
    [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing]: props.entries.length,
    [AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn]: withdrawn,
    [AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid]: runsPaid,
    [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee]: totalFee,
  };

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.club] = clubName;

  const eventNumber = textOrUndefined(props.trial?.trialNumber);
  if (eventNumber) text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber] = eventNumber;

  if (trialDate) text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate] = trialDate;

  return {
    text,
  };
}
