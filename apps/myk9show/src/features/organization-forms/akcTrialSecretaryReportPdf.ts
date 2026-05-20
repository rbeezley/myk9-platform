import type { ReportProps } from '@/lib/reports/types';
import { buildAKCTrialSecretaryReportValues } from './akcTrialSecretaryReport';
import { getOrganizationFormTemplateUrl } from './organizationFormTemplates';
import { fillPdfForm } from './pdfForm';

const templateUrl = getOrganizationFormTemplateUrl('akc-scent-work-trial-secretary-report');

export async function buildAKCTrialSecretaryReportPdf(props: ReportProps): Promise<Uint8Array> {
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error('Unable to load the AKC Trial Secretary Report template.');
  }

  // Keep AcroForm fields editable so secretaries can add official notes before submission.
  return fillPdfForm(
    new Uint8Array(await response.arrayBuffer()),
    buildAKCTrialSecretaryReportValues(props),
    {
      flatten: false,
    }
  );
}

export function buildAKCTrialSecretaryReportFilename(props: ReportProps): string {
  const trialNumber = sanitizeFilenameToken(props.trial?.trialNumber) || 'trial';
  return `akc-trial-secretary-report-${trialNumber}.pdf`;
}

function sanitizeFilenameToken(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
