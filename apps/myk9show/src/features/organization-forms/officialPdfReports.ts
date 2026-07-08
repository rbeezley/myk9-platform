import type { ReportProps } from '@/lib/reports/types';
import { buildASCAScentDetectionGrossReceiptsValues } from './ascaScentDetectionGrossReceipts';
import { buildASCAScentDetectionPostEventEvaluationValues } from './ascaScentDetectionPostEventEvaluation';
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
  | 'trial-secretary-report'
  | 'asca-scent-detection-entry-form'
  | 'asca-scent-detection-trial-report'
  | 'asca-scent-detection-trial-roster'
  | 'asca-scent-detection-score-sheet'
  | 'asca-scent-detection-gross-receipts'
  | 'asca-scent-detection-post-event-evaluation'
  | 'ukc-nosework-judges-book-element'
  | 'ukc-nosework-judges-book-handler-discrimination'
  | 'ukc-nosework-trial-score-sheet';

export interface OfficialPdfReportConfig {
  actionLabel: string;
  downloadMode?: 'fillable' | 'static';
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

const UKC_JUDGES_BOOK_ELEMENT_CONFIG = {
  actionLabel: 'Download UKC Element Judges Book PDF',
  downloadMode: 'static',
  filenamePrefix: 'ukc-element-judges-book',
  templateId: 'ukc-nosework-judges-book-element',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const UKC_JUDGES_BOOK_HANDLER_DISCRIMINATION_CONFIG = {
  actionLabel: 'Download UKC Handler Discrimination Judges Book PDF',
  downloadMode: 'static',
  filenamePrefix: 'ukc-handler-discrimination-judges-book',
  templateId: 'ukc-nosework-judges-book-handler-discrimination',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const UKC_TRIAL_SCORE_SHEET_CONFIG = {
  actionLabel: 'Download UKC Trial Score Sheet PDF',
  downloadMode: 'static',
  filenamePrefix: 'ukc-trial-score-sheet',
  templateId: 'ukc-nosework-trial-score-sheet',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_ENTRY_FORM_CONFIG = {
  actionLabel: 'Download ASCA Entry Form PDF',
  downloadMode: 'static',
  filenamePrefix: 'asca-scent-detection-entry-form',
  templateId: 'asca-scent-detection-entry-form',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_TRIAL_REPORT_CONFIG = {
  actionLabel: 'Download ASCA Trial Report PDF',
  downloadMode: 'static',
  filenamePrefix: 'asca-scent-detection-trial-report',
  templateId: 'asca-scent-detection-trial-report',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_TRIAL_ROSTER_CONFIG = {
  actionLabel: 'Download ASCA Trial Roster PDF',
  downloadMode: 'static',
  filenamePrefix: 'asca-scent-detection-trial-roster',
  templateId: 'asca-scent-detection-trial-roster',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_SCORE_SHEET_CONFIG = {
  actionLabel: 'Download ASCA Score Sheet PDF',
  downloadMode: 'static',
  filenamePrefix: 'asca-scent-detection-score-sheet',
  templateId: 'asca-scent-detection-score-sheet',
  values: emptyPdfValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_GROSS_RECEIPTS_CONFIG = {
  actionLabel: 'Download ASCA Gross Receipts PDF',
  filenamePrefix: 'asca-scent-detection-gross-receipts',
  templateId: 'asca-scent-detection-gross-receipts',
  values: buildASCAScentDetectionGrossReceiptsValues,
} as const satisfies OfficialPdfReportConfig;

const ASCA_POST_EVENT_EVALUATION_CONFIG = {
  actionLabel: 'Download ASCA Post-Event Evaluation PDF',
  filenamePrefix: 'asca-scent-detection-post-event-evaluation',
  templateId: 'asca-scent-detection-post-event-evaluation',
  values: buildASCAScentDetectionPostEventEvaluationValues,
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
    case 'asca-scent-detection-entry-form':
      return ASCA_ENTRY_FORM_CONFIG;
    case 'asca-scent-detection-trial-report':
      return ASCA_TRIAL_REPORT_CONFIG;
    case 'asca-scent-detection-trial-roster':
      return ASCA_TRIAL_ROSTER_CONFIG;
    case 'asca-scent-detection-score-sheet':
      return ASCA_SCORE_SHEET_CONFIG;
    case 'asca-scent-detection-gross-receipts':
      return ASCA_GROSS_RECEIPTS_CONFIG;
    case 'asca-scent-detection-post-event-evaluation':
      return ASCA_POST_EVENT_EVALUATION_CONFIG;
    case 'ukc-nosework-judges-book-element':
      return UKC_JUDGES_BOOK_ELEMENT_CONFIG;
    case 'ukc-nosework-judges-book-handler-discrimination':
      return UKC_JUDGES_BOOK_HANDLER_DISCRIMINATION_CONFIG;
    case 'ukc-nosework-trial-score-sheet':
      return UKC_TRIAL_SCORE_SHEET_CONFIG;
    case 'akc-judge-report':
      return AKC_JUDGE_REPORT_CONFIG;
    case 'trial-chairman-report':
      return AKC_TRIAL_CHAIRMAN_CONFIG;
    default:
      return assertNever(reportId);
  }
}

export function getOfficialPdfMissingFieldLabels(reportId: string, props: ReportProps): string[] {
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
    reportId === 'trial-secretary-report' ||
    reportId === 'asca-scent-detection-entry-form' ||
    reportId === 'asca-scent-detection-trial-report' ||
    reportId === 'asca-scent-detection-trial-roster' ||
    reportId === 'asca-scent-detection-score-sheet' ||
    reportId === 'asca-scent-detection-gross-receipts' ||
    reportId === 'asca-scent-detection-post-event-evaluation' ||
    reportId === 'ukc-nosework-judges-book-element' ||
    reportId === 'ukc-nosework-judges-book-handler-discrimination' ||
    reportId === 'ukc-nosework-trial-score-sheet'
  );
}

function isUKCTrial(props: ReportProps | null | undefined): boolean {
  return props?.trial?.registryId?.trim().toUpperCase() === 'UKC';
}

function emptyPdfValues(): PdfFormFillValues {
  return {};
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
