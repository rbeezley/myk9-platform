import type { ReportProps } from '@/lib/reports/types';
import { buildAKCJudgeReportValues } from './akcJudgeReport';
import { buildAKCTrialChairmanReportValues } from './akcTrialChairmanReport';
import { buildAKCTrialSecretaryReportValues } from './akcTrialSecretaryReport';
import {
  getOrganizationFormTemplate,
  type OrganizationFormTemplateId,
} from './organizationFormTemplates';
import { findMissingPdfRequiredFieldLabels } from './pdfFormCompleteness';
import type { PdfFormFillValues } from './pdfForm';
import { buildUKCNoseworkTrialReportValues } from './ukcNoseworkTrialReport';

type ReportIdWithOfficialPdf =
  | 'akc-judge-report'
  | 'trial-chairman-report'
  | 'trial-secretary-report';

export interface OfficialPdfReportConfig {
  actionLabel: string;
  filenamePrefix: string;
  templateId: OrganizationFormTemplateId;
  values: (props: ReportProps) => PdfFormFillValues;
}

const AKC_TRIAL_SECRETARY_CONFIG = {
  actionLabel: 'Download AKC Trial Secretary PDF',
  filenamePrefix: 'akc-trial-secretary-report',
  templateId: 'akc-scent-work-trial-secretary-report',
  values: buildAKCTrialSecretaryReportValues,
} as const satisfies OfficialPdfReportConfig;

const UKC_TRIAL_REPORT_CONFIG = {
  actionLabel: 'Download UKC Trial Report PDF',
  filenamePrefix: 'ukc-nosework-trial-report',
  templateId: 'ukc-nosework-trial-report',
  values: buildUKCNoseworkTrialReportValues,
} as const satisfies OfficialPdfReportConfig;

const AKC_JUDGE_REPORT_CONFIG = {
  actionLabel: 'Download AKC Judge PDF',
  filenamePrefix: 'akc-judge-report',
  templateId: 'akc-scent-work-judge-report',
  values: buildAKCJudgeReportValues,
} as const satisfies OfficialPdfReportConfig;

const AKC_TRIAL_CHAIRMAN_CONFIG = {
  actionLabel: 'Download AKC Trial Chairman PDF',
  filenamePrefix: 'akc-trial-chairman-report',
  templateId: 'akc-scent-work-trial-chairman-report',
  values: buildAKCTrialChairmanReportValues,
} as const satisfies OfficialPdfReportConfig;

export function getOfficialPdfReportConfig(
  reportId: string,
  props?: ReportProps | null
): OfficialPdfReportConfig | null {
  if (!isReportIdWithOfficialPdf(reportId)) return null;

  switch (reportId) {
    case 'trial-secretary-report':
      return isUKCTrial(props) ? UKC_TRIAL_REPORT_CONFIG : AKC_TRIAL_SECRETARY_CONFIG;
    case 'akc-judge-report':
      return AKC_JUDGE_REPORT_CONFIG;
    case 'trial-chairman-report':
      return AKC_TRIAL_CHAIRMAN_CONFIG;
    default:
      return assertNever(reportId);
  }
}

export function getOfficialPdfMissingFieldLabels(
  reportId: string,
  props: ReportProps
): string[] {
  const config = getOfficialPdfReportConfig(reportId, props);
  if (!config) return [];

  const template = getOrganizationFormTemplate(config.templateId);
  return findMissingPdfRequiredFieldLabels(template.requiredFields, config.values(props));
}

export function buildOfficialPdfFilename(
  config: OfficialPdfReportConfig,
  props: ReportProps
): string {
  const trialNumber = sanitizeFilenameToken(props.trial?.trialNumber) || 'trial';
  return `${config.filenamePrefix}-${trialNumber}.pdf`;
}

function isReportIdWithOfficialPdf(reportId: string): reportId is ReportIdWithOfficialPdf {
  return (
    reportId === 'akc-judge-report' ||
    reportId === 'trial-chairman-report' ||
    reportId === 'trial-secretary-report'
  );
}

function isUKCTrial(props: ReportProps | null | undefined): boolean {
  return props?.trial?.registryId?.trim().toUpperCase() === 'UKC';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled official PDF report id: ${value}`);
}

function sanitizeFilenameToken(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
