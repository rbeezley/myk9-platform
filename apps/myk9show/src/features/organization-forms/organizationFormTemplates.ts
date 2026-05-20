import { AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS } from './akcTrialSecretaryReportFields';

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
    requiredFields: [
      'Location',
      'EventNumbers',
      'EventDates',
      'ClubName',
      'JudgeName',
      'JudgeEmail',
    ],
  },
  {
    id: 'akc-scent-work-trial-chairman-report',
    label: 'AKC Scent Work Trial Chairman Report',
    registry: 'AKC',
    sourcePath: 'docs/AKC-forms/SW-TCReport.pdf',
    requiredFields: ['TrialDates', 'EventNumbers', 'ClubName', 'TrialChair'],
  },
  {
    id: 'ukc-nosework-trial-report',
    label: 'UKC Nosework Trial Report',
    registry: 'UKC',
    sourcePath: 'docs/UKC-forms/NW-TrialReport.pdf',
    requiredFields: [
      'EVENT DATE',
      'Club Name do not abbreviate',
      'Number of PreEntries',
      'Number of DayOfShow Entries',
      'Total Entries',
      'Grand Total due to UKC',
    ],
  },
] as const satisfies readonly OrganizationFormTemplate[];

const ORGANIZATION_FORM_TEMPLATE_URLS: Partial<Record<OrganizationFormTemplateId, string>> = {
  'akc-scent-work-trial-secretary-report': new URL(
    '../../../../../docs/AKC-forms/SW-TSReport.pdf',
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
  const url = ORGANIZATION_FORM_TEMPLATE_URLS[id];
  if (!url) throw new Error(`No runtime URL configured for organization form template: ${id}`);
  return url;
}
