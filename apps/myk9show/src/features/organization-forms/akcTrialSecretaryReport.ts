import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { formatReportDate } from '@/lib/reports/reportUtils';
import { AKC_SCENT_WORK_REPORT_FEE_PER_RUN } from '@/lib/reports/reportConstants';
import { AKC_TRIAL_SECRETARY_REPORT_FIELDS } from './akcTrialSecretaryReportFields';
import type { PdfFormFillValues } from './pdfForm';

export { AKC_SCENT_WORK_REPORT_FEE_PER_RUN as AKC_TRIAL_SECRETARY_REPORT_FEE_PER_RUN };

function isWithdrawn(entry: ReportEntry): boolean {
  const statuses = [entry.checkInStatus, entry.resultText]
    .map(status => status?.trim().toLowerCase())
    .filter((status): status is string => Boolean(status));

  return statuses.some(
    status => status === 'wd' || status.includes('withdrawn') || status.includes('pulled')
  );
}

export function buildAKCTrialSecretaryReportValues(props: ReportProps): PdfFormFillValues {
  const trialDate = props.trial?.date ? formatReportDate(props.trial.date) : '';
  const withdrawn = props.entries.filter(isWithdrawn).length;
  const runsPaid = Math.max(0, props.entries.length - withdrawn);
  const totalFee = (runsPaid * AKC_SCENT_WORK_REPORT_FEE_PER_RUN).toFixed(2);

  return {
    text: {
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.club]: props.clubName ?? props.showName,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate]: trialDate,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber]: props.trial?.trialNumber ?? '',
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing]: props.entries.length,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn]: withdrawn,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid]: runsPaid,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee]: totalFee,
      [AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialSecretary]: '',
    },
  };
}
