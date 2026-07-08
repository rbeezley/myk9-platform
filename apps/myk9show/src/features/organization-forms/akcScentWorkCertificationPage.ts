import { PDFDocument } from 'pdf-lib';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { countQualified, formatReportDate, isQualified } from '@/lib/reports/reportUtils';
import { fillPdfForm, type PdfFormFillValues } from './pdfForm';
import { trialEventNumber } from './reportValueHelpers';
import { AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS } from './akcScentWorkCertificationPageFields';

type CertificationElement =
  | 'Container'
  | 'Interior'
  | 'Exterior'
  | 'Buried'
  | 'Handler Discrimination'
  | 'Detective';

export interface CertificationPageValues {
  judgeName: string;
  values: PdfFormFillValues;
}

const ELEMENT_FIELDS: Record<CertificationElement, string> = {
  Container: AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.containerQualifying,
  Interior: AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.interiorQualifying,
  Exterior: AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.exteriorQualifying,
  Buried: AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.buriedQualifying,
  'Handler Discrimination':
    AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.handlerDiscriminationQualifying,
  Detective: AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.detectiveQualifying,
};

const ELEMENTS = Object.keys(ELEMENT_FIELDS) as CertificationElement[];
const UNKNOWN_JUDGE = 'Unknown Judge';

export function buildAKCScentWorkCertificationPageFilename(props: ReportProps): string {
  const trialToken = sanitizeFilenameToken(trialEventNumber(props) ?? props.trial?.trialNumber ?? '');
  return `akc-certification-page-${trialToken || 'trial'}.pdf`;
}

export function buildAKCScentWorkCertificationPageValues(
  props: ReportProps
): CertificationPageValues[] {
  const judges = certificationJudges(props);
  return judges.map(judgeName => ({
    judgeName,
    values: buildJudgeCertificationValues(props, judgeName),
  }));
}

export async function buildAKCScentWorkCertificationPagePdfBytes(input: {
  props: ReportProps;
  templateBytes: Uint8Array;
}): Promise<Uint8Array> {
  const outputPdf = await PDFDocument.create();

  for (const pageValues of buildAKCScentWorkCertificationPageValues(input.props)) {
    const filledBytes = await fillPdfForm(input.templateBytes, pageValues.values, {
      flatten: true,
    });
    const filledPdf = await PDFDocument.load(filledBytes);
    const copiedPages = await outputPdf.copyPages(filledPdf, filledPdf.getPageIndices());
    for (const page of copiedPages) {
      outputPdf.addPage(page);
    }
  }

  return outputPdf.save();
}

function buildJudgeCertificationValues(
  props: ReportProps,
  judgeName: string
): PdfFormFillValues {
  const text: NonNullable<PdfFormFillValues['text']> = {
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.judgeName]: judgeName,
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.judgeTotalQualifying]:
      qualifyingEntriesForJudge(props.entries, judgeName).length,
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalEntries]: props.entries.length,
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalRuns]: totalRuns(props.entries),
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalWithdrawn]: totalWithdrawn(props.entries),
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalQualifying]: countQualified(props.entries),
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.eventNumber]: trialEventNumber(props) ?? '',
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.clubName]: props.clubName ?? props.showName,
    [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.eventDate]: props.trial?.date
      ? formatReportDate(props.trial.date)
      : '',
  };

  const judgedElements = elementsJudgedBy(props, judgeName);
  for (const element of ELEMENTS) {
    text[ELEMENT_FIELDS[element]] = judgedElements.has(element)
      ? qualifyingEntriesForJudgeAndElement(props.entries, judgeName, element).length
      : 'X';
  }

  return { text };
}

function certificationJudges(props: ReportProps): string[] {
  const classJudges = new Set(
    (props.allClasses ?? [])
      .map(cls => cleanJudgeName(cls.judgeName))
      .filter((name): name is string => Boolean(name))
  );

  if (classJudges.size > 0) return [...classJudges].sort((a, b) => a.localeCompare(b));

  return [cleanJudgeName(props.trial?.judgeName) ?? UNKNOWN_JUDGE];
}

function elementsJudgedBy(props: ReportProps, judgeName: string): Set<CertificationElement> {
  return new Set(
    (props.allClasses ?? [])
      .filter(cls => cleanJudgeName(cls.judgeName) === judgeName)
      .map(cls => normalizeElement(cls.element))
      .filter((element): element is CertificationElement => Boolean(element))
  );
}

function qualifyingEntriesForJudge(entries: ReportEntry[], judgeName: string): ReportEntry[] {
  return entries.filter(entry => isQualified(entry) && cleanJudgeName(entry.judgeName) === judgeName);
}

function qualifyingEntriesForJudgeAndElement(
  entries: ReportEntry[],
  judgeName: string,
  element: CertificationElement
): ReportEntry[] {
  return qualifyingEntriesForJudge(entries, judgeName).filter(
    entry => normalizeElement(entry.classElement) === element
  );
}

function totalRuns(entries: ReportEntry[]): number {
  return entries.filter(entry => entry.checkInStatus === 'present').length;
}

function totalWithdrawn(entries: ReportEntry[]): number {
  return entries.filter(
    entry =>
      entry.checkInStatus === 'withdrawn' ||
      entry.resultText?.trim().toLowerCase() === 'withdrawn'
  ).length;
}

function cleanJudgeName(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean || clean === 'TBD' || clean === 'Multiple judges') return null;
  return clean;
}

function normalizeElement(value: string | null | undefined): CertificationElement | null {
  const clean = value?.trim().toLowerCase();
  switch (clean) {
    case 'container':
      return 'Container';
    case 'interior':
      return 'Interior';
    case 'exterior':
      return 'Exterior';
    case 'buried':
      return 'Buried';
    case 'handler discrimination':
      return 'Handler Discrimination';
    case 'detective':
      return 'Detective';
    default:
      return null;
  }
}

function sanitizeFilenameToken(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trial'
  );
}
