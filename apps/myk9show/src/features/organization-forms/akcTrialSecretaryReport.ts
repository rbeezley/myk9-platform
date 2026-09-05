import type { ReportProps } from '@/lib/reports/types';
import { AKC_TRIAL_SECRETARY_REPORT_FIELDS } from './akcTrialSecretaryReportFields';
import type { PdfFormFillValues } from './pdfForm';
import { formattedTrialDate, textOrUndefined, trialEventNumber } from './reportValueHelpers';
import { resolveAKCTrialSecretaryReportPolicy } from './akcTrialSecretaryReportPolicy';

export function buildAKCTrialSecretaryReportValues(props: ReportProps): PdfFormFillValues {
  const trialDate = formattedTrialDate(props);
  const policy = resolveAKCTrialSecretaryReportPolicy(props.trial?.date, props.entries);
  const text: NonNullable<PdfFormFillValues['text']> = {
    [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing]: props.entries.length,
  };

  if (policy.ok) {
    text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn] = policy.excludedRuns;
    text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid] = policy.paidRuns;
    text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee] = policy.formattedTotal;
  }

  const clubName = textOrUndefined(props.clubName);
  if (clubName) text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.club] = clubName;

  const eventNumber = trialEventNumber(props);
  if (eventNumber) text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber] = eventNumber;

  const hasUsableDate = policy.ok || policy.reason === 'unsupported';
  if (trialDate && hasUsableDate) {
    text[AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate] = trialDate;
  }

  return {
    text,
  };
}
