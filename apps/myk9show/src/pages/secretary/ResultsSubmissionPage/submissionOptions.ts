import type { ResultFormatter } from '@myk9/secretary';
import { formatFormatterLabel } from './helpers';

export type SubmissionMode = 'electronic' | 'manual';

export interface OfficialResourceLink {
  href: string;
  label: string;
}

export interface RegistrySubmissionOption {
  formatter?: ResultFormatter;
  guidance: {
    officialLinks: OfficialResourceLink[];
    preservation: string;
    reportsQuery?: string;
    steps: string[];
    summary: string;
  };
  key: string;
  label: string;
  mode: SubmissionMode;
  organization: string;
  sportType: string;
}

const UKC_NOSEWORK_OPTION: RegistrySubmissionOption = {
  key: 'UKC:nosework',
  label: 'UKC Nosework',
  mode: 'manual',
  organization: 'UKC',
  sportType: 'nosework',
  guidance: {
    officialLinks: [
      {
        href: 'https://www.ukcdogs.com/nosework-forms-rules',
        label: 'UKC Nosework Forms & Rules',
      },
    ],
    preservation:
      'After you send the UKC paperwork packet, mark it submitted here so the club history shows when the packet left myK9.',
    reportsQuery: 'report=trial-secretary-report',
    steps: [
      'Open Reports and download the UKC Trial Report plus any entry, change-entry, judges book, and score sheet PDFs needed for the packet.',
      'Use UKC Nosework Forms & Rules for the current paperwork prep and submission instructions.',
      'Keep the downloaded packet with the club records, then mark the submission here after it is sent.',
    ],
    summary:
      'UKC Nosework closeout is a paperwork packet. myK9 prepares the packet in Reports and records the submission here.',
  },
};

const ASCA_SCENT_DETECTION_OPTION: RegistrySubmissionOption = {
  key: 'ASCA:scent_detection',
  label: 'ASCA Scent Detection',
  mode: 'manual',
  organization: 'ASCA',
  sportType: 'scent_detection',
  guidance: {
    officialLinks: [
      {
        href: 'https://asca.org/online-event-sanctioning/',
        label: 'ASCA Online Results and Payment Upload',
      },
    ],
    preservation:
      'After uploading through ASCA, mark it submitted here so the club has a myK9 closeout record. No XML file is generated for ASCA in this release.',
    steps: [
      'Prepare the ASCA Scent Detection packet from the official ASCA forms until myK9 packet generation is wired.',
      'Upload results and gross receipt payment through ASCA Online Results and Payment Upload.',
      'Keep the uploaded packet with club records, then mark the submission here after ASCA accepts it.',
    ],
    summary:
      'ASCA Scent Detection uses ASCA online results/payment upload. myK9 records the outside submission here.',
  },
};

export function buildRegistrySubmissionOptions(
  formatters: readonly ResultFormatter[]
): RegistrySubmissionOption[] {
  const electronicOptions = formatters.map(formatter => ({
    formatter,
    guidance: buildElectronicGuidance(formatter),
    key: submissionOptionKey(formatter.organization, formatter.sportType),
    label: formatFormatterLabel(formatter),
    mode: 'electronic' as const,
    organization: formatter.organization,
    sportType: formatter.sportType,
  }));

  return [...electronicOptions, UKC_NOSEWORK_OPTION, ASCA_SCENT_DETECTION_OPTION];
}

export function chooseDefaultSubmissionOptionKey(
  showOrganization: string | null | undefined,
  options: readonly RegistrySubmissionOption[]
): string {
  const registry = normalizeShowOrganization(showOrganization);
  const matchingManualOption = options.find(option => option.organization === registry);
  if (matchingManualOption) return matchingManualOption.key;

  return options[0]?.key ?? '';
}

export function submissionOptionKey(organization: string, sportType: string): string {
  return `${organization}:${sportType}`;
}

function buildElectronicGuidance(formatter: ResultFormatter): RegistrySubmissionOption['guidance'] {
  return {
    officialLinks: [
      {
        href: 'https://www.akc.org/downloadable-forms/',
        label: 'AKC Downloadable Forms',
      },
    ],
    preservation:
      'When myK9 sends the XML successfully, it records the submission automatically. If you file outside myK9, mark it submitted here after sending.',
    steps: [
      `Review the ${formatFormatterLabel(formatter)} readiness checklist.`,
      'Send the XML from myK9 when ready, or download a copy for manual email filing.',
      'Keep the downloaded XML and generated reports with the club records.',
    ],
    summary: `${formatFormatterLabel(formatter)} supports electronic XML generation from myK9.`,
  };
}

function normalizeShowOrganization(showOrganization: string | null | undefined): string {
  const value = showOrganization?.trim().toUpperCase() ?? '';
  if (value.includes('UKC')) return 'UKC';
  if (value.includes('ASCA')) return 'ASCA';
  return 'AKC';
}
