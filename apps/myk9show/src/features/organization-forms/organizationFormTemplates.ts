import { AKC_JUDGE_REPORT_REQUIRED_FIELDS } from './akcJudgeReportFields';
import { AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS } from './akcTrialSecretaryReportFields';
import { AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS } from './akcTrialChairmanReportFields';
import { UKC_NOSEWORK_TRIAL_REPORT_REQUIRED_FIELDS } from './ukcNoseworkTrialReportFields';

export type OrganizationFormRegistry = 'AKC' | 'UKC';

export type OrganizationFormTemplateId =
  | 'akc-scent-work-trial-secretary-report'
  | 'akc-scent-work-judge-report'
  | 'akc-scent-work-trial-chairman-report'
  | 'ukc-nosework-trial-report';

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
    id: 'ukc-nosework-trial-report',
    label: 'UKC Nosework Trial Report',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-TrialReport.pdf',
    requiredFields: UKC_NOSEWORK_TRIAL_REPORT_REQUIRED_FIELDS,
  },
] as const satisfies readonly OrganizationFormTemplate[];

const ORGANIZATION_FORM_TEMPLATE_URLS: Record<OrganizationFormTemplateId, string> = {
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
  'ukc-nosework-trial-report': new URL(
    '../../../../../docs/UKC-forms/NW-TrialReport.pdf',
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
