import { AKC_JUDGE_REPORT_REQUIRED_FIELDS } from './akcJudgeReportFields';
import { AKC_SCENT_WORK_CERTIFICATION_PAGE_REQUIRED_FIELDS } from './akcScentWorkCertificationPageFields';
import { AKC_SCENT_WORK_ENTRY_FORM_REQUIRED_FIELDS } from './akcScentWorkEntryFormFields';
import { AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS } from './akcScentWorkTransferFormFields';
import { AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS } from './akcTrialSecretaryReportFields';
import { AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS } from './akcTrialChairmanReportFields';
import { ASCA_SCENT_DETECTION_GROSS_RECEIPTS_REQUIRED_FIELDS } from './ascaScentDetectionGrossReceiptsFields';
import { ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_REQUIRED_FIELDS } from './ascaScentDetectionPostEventEvaluationFields';
import { UKC_NOSEWORK_CHANGE_ENTRY_FORM_REQUIRED_FIELDS } from './ukcNoseworkChangeEntryFormFields';
import { UKC_NOSEWORK_ENTRY_FORM_REQUIRED_FIELDS } from './ukcNoseworkEntryFormFields';
import { UKC_NOSEWORK_TRIAL_REPORT_REQUIRED_FIELDS } from './ukcNoseworkTrialReportFields';

export type OrganizationFormRegistry = 'AKC' | 'UKC' | 'ASCA';

export type OrganizationFormTemplateId =
  | 'akc-scent-work-entry-form'
  | 'akc-scent-work-score-sheet'
  | 'akc-scent-work-certification-page'
  | 'akc-scent-work-transfer-form'
  | 'akc-scent-work-trial-secretary-report'
  | 'akc-scent-work-judge-report'
  | 'akc-scent-work-trial-chairman-report'
  | 'ukc-nosework-entry-form'
  | 'ukc-nosework-change-entry-form'
  | 'ukc-nosework-judges-book-element'
  | 'ukc-nosework-judges-book-handler-discrimination'
  | 'ukc-nosework-trial-score-sheet'
  | 'ukc-nosework-trial-report'
  | 'asca-scent-detection-entry-form'
  | 'asca-scent-detection-trial-report'
  | 'asca-scent-detection-trial-roster'
  | 'asca-scent-detection-score-sheet'
  | 'asca-scent-detection-gross-receipts'
  | 'asca-scent-detection-post-event-evaluation';

export interface OrganizationFormTemplate {
  id: OrganizationFormTemplateId;
  label: string;
  registry: OrganizationFormRegistry;
  // Repo-relative path used by inventory tests and field audits.
  sourcePath: string;
  requiredFields: readonly string[];
}

export const ORGANIZATION_FORM_TEMPLATES = [
  {
    id: 'akc-scent-work-entry-form',
    label: 'AKC Scent Work Entry Form',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-EntryForm.pdf',
    requiredFields: AKC_SCENT_WORK_ENTRY_FORM_REQUIRED_FIELDS,
  },
  {
    id: 'akc-scent-work-score-sheet',
    label: 'AKC Scent Work Score Sheet',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-Scoresheet.pdf',
    requiredFields: [],
  },
  {
    id: 'akc-scent-work-certification-page',
    label: 'AKC Scent Work Certification Page',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-CertificationPage.pdf',
    requiredFields: AKC_SCENT_WORK_CERTIFICATION_PAGE_REQUIRED_FIELDS,
  },
  {
    id: 'akc-scent-work-transfer-form',
    label: 'AKC Scent Work Class Transfer Form',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-Transfer.pdf',
    requiredFields: AKC_SCENT_WORK_TRANSFER_FORM_REQUIRED_FIELDS,
  },
  {
    id: 'akc-scent-work-trial-secretary-report',
    label: 'AKC Scent Work Trial Secretary Report',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-TSReport.pdf',
    requiredFields: AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS,
  },
  {
    id: 'akc-scent-work-judge-report',
    label: 'AKC Scent Work Judge Report',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-JudgeReport.pdf',
    requiredFields: AKC_JUDGE_REPORT_REQUIRED_FIELDS,
  },
  {
    id: 'akc-scent-work-trial-chairman-report',
    label: 'AKC Scent Work Trial Chairman Report',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-TCReport.pdf',
    requiredFields: AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS,
  },
  {
    id: 'ukc-nosework-entry-form',
    label: 'UKC Nosework Entry Form',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-Entry.pdf',
    requiredFields: UKC_NOSEWORK_ENTRY_FORM_REQUIRED_FIELDS,
  },
  {
    id: 'ukc-nosework-change-entry-form',
    label: 'UKC Nosework Change Entry Form',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-ChangeEntry.pdf',
    requiredFields: UKC_NOSEWORK_CHANGE_ENTRY_FORM_REQUIRED_FIELDS,
  },
  {
    id: 'ukc-nosework-judges-book-element',
    label: 'UKC Nosework Judges Book: Element Trial',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-JudgesBook-Element.pdf',
    requiredFields: [],
  },
  {
    id: 'ukc-nosework-judges-book-handler-discrimination',
    label: 'UKC Nosework Judges Book: Handler Discrimination',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-JudgesBook-HandlerDiscrimination.pdf',
    requiredFields: [],
  },
  {
    id: 'ukc-nosework-trial-score-sheet',
    label: 'UKC Nosework Trial Score Sheet',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-TrialScoreSheet.pdf',
    requiredFields: [],
  },
  {
    id: 'ukc-nosework-trial-report',
    label: 'UKC Nosework Trial Report',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-TrialReport.pdf',
    requiredFields: UKC_NOSEWORK_TRIAL_REPORT_REQUIRED_FIELDS,
  },
  {
    id: 'asca-scent-detection-entry-form',
    label: 'ASCA Scent Detection Entry Form',
    registry: 'ASCA',
    sourcePath: 'docs/rulebooks/asca-scent-detection-forms/ASCA_Scent-Entry-Form.pdf',
    requiredFields: [],
  },
  {
    id: 'asca-scent-detection-trial-report',
    label: 'ASCA Scent Detection Trial Report',
    registry: 'ASCA',
    sourcePath: 'docs/rulebooks/asca-scent-detection-forms/ASCA_Scent-Trial-Report.pdf',
    requiredFields: [],
  },
  {
    id: 'asca-scent-detection-trial-roster',
    label: 'ASCA Scent Detection Trial Roster',
    registry: 'ASCA',
    sourcePath: 'docs/rulebooks/asca-scent-detection-forms/ASCA_SD-Trial-Roster.pdf',
    requiredFields: [],
  },
  {
    id: 'asca-scent-detection-score-sheet',
    label: 'ASCA Scent Detection Score Sheet',
    registry: 'ASCA',
    sourcePath: 'docs/rulebooks/asca-scent-detection-forms/ASCA_SD-Scoresheet.pdf',
    requiredFields: [],
  },
  {
    id: 'asca-scent-detection-gross-receipts',
    label: 'ASCA Scent Detection Gross Receipts Report',
    registry: 'ASCA',
    sourcePath:
      'docs/rulebooks/asca-scent-detection-forms/ASCA_ScentDetectionGrossReceiptsReport.pdf',
    requiredFields: ASCA_SCENT_DETECTION_GROSS_RECEIPTS_REQUIRED_FIELDS,
  },
  {
    id: 'asca-scent-detection-post-event-evaluation',
    label: 'ASCA Scent Detection Post-Event Evaluation',
    registry: 'ASCA',
    sourcePath: 'docs/rulebooks/asca-scent-detection-forms/ASCA_scentpostevaluationform.pdf',
    requiredFields: ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_REQUIRED_FIELDS,
  },
] as const satisfies readonly OrganizationFormTemplate[];

const ORGANIZATION_FORM_TEMPLATE_URLS: Record<OrganizationFormTemplateId, string> = {
  'akc-scent-work-entry-form': new URL(
    '../../../../../docs/AKC-forms/SW-EntryForm.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-score-sheet': new URL(
    '../../../../../docs/AKC-forms/SW-Scoresheet.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-certification-page': new URL(
    '../../../../../docs/AKC-forms/SW-CertificationPage.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-transfer-form': new URL(
    '../../../../../docs/AKC-forms/SW-Transfer.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-trial-secretary-report': new URL(
    '../../../../../docs/AKC-forms/SW-TSReport.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-judge-report': new URL(
    '../../../../../docs/AKC-forms/SW-JudgeReport.pdf',
    import.meta.url
  ).href,
  'akc-scent-work-trial-chairman-report': new URL(
    '../../../../../docs/AKC-forms/SW-TCReport.pdf',
    import.meta.url
  ).href,
  'ukc-nosework-entry-form': new URL('../../../../../docs/UKC-forms/NW-Entry.pdf', import.meta.url)
    .href,
  'ukc-nosework-change-entry-form': new URL(
    '../../../../../docs/UKC-forms/NW-ChangeEntry.pdf',
    import.meta.url
  ).href,
  'ukc-nosework-judges-book-element': new URL(
    '../../../../../docs/UKC-forms/NW-JudgesBook-Element.pdf',
    import.meta.url
  ).href,
  'ukc-nosework-judges-book-handler-discrimination': new URL(
    '../../../../../docs/UKC-forms/NW-JudgesBook-HandlerDiscrimination.pdf',
    import.meta.url
  ).href,
  'ukc-nosework-trial-score-sheet': new URL(
    '../../../../../docs/UKC-forms/NW-TrialScoreSheet.pdf',
    import.meta.url
  ).href,
  'ukc-nosework-trial-report': new URL(
    '../../../../../docs/UKC-forms/NW-TrialReport.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-entry-form': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_Scent-Entry-Form.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-trial-report': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_Scent-Trial-Report.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-trial-roster': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_SD-Trial-Roster.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-score-sheet': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_SD-Scoresheet.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-gross-receipts': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_ScentDetectionGrossReceiptsReport.pdf',
    import.meta.url
  ).href,
  'asca-scent-detection-post-event-evaluation': new URL(
    '../../../../../docs/rulebooks/asca-scent-detection-forms/ASCA_scentpostevaluationform.pdf',
    import.meta.url
  ).href,
};

export function getOrganizationFormTemplate(
  id: OrganizationFormTemplateId
): OrganizationFormTemplate {
  const template = ORGANIZATION_FORM_TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error(`Unknown organization form template: ${id}`);
  return template;
}

export function getOrganizationFormTemplateUrl(id: OrganizationFormTemplateId): string {
  return ORGANIZATION_FORM_TEMPLATE_URLS[id];
}
