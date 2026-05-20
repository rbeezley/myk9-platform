import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';
import type { PdfFormFillValues } from './pdfForm';

export const AKC_TRIAL_SECRETARY_REPORT_FEE_PER_RUN = 3.5;

function isWithdrawn(entry: ReportEntry): boolean {
  const status = `${entry.checkInStatus ?? ''} ${entry.resultText ?? ''}`.toLowerCase();
  return status.includes('withdrawn') || status.includes('pulled');
}

export function buildAKCTrialSecretaryReportValues(props: ReportProps): PdfFormFillValues {
  const trialDate = props.trial?.date ? formatReportDate(props.trial.date) : '';
  const withdrawn = props.entries.filter(isWithdrawn).length;
  const runsPaid = Math.max(0, props.entries.length - withdrawn);
  const totalFee = (runsPaid * AKC_TRIAL_SECRETARY_REPORT_FEE_PER_RUN).toFixed(2);

  return {
    text: {
      Club: props.clubName ?? props.showName,
      TrialDate: trialDate,
      EventNumber: props.trial?.trialNumber ?? '',
      TotalRunsAtClosing: props.entries.length,
      Withdrawn: withdrawn,
      RunsPaid: runsPaid,
      TotalFee: totalFee,
      TrialSecretary: '',
    },
  };
}

