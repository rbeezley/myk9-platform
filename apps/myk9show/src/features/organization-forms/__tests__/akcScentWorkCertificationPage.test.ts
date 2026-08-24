import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportProps } from '@/lib/reports/types';
import {
  buildAKCScentWorkCertificationPageFilename,
  buildAKCScentWorkCertificationPagePdfBytes,
  buildAKCScentWorkCertificationPageValues,
} from '../akcScentWorkCertificationPage';
import { AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS } from '../akcScentWorkCertificationPageFields';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const templatePath = resolve(repoRoot, 'docs/AKC-forms/SW-CertificationPage.pdf');

const props = {
  showId: 'show-1',
  showName: 'Spring Scent Trial',
  clubName: 'Demo Scent Work Club',
  trial: {
    date: '2026-04-12',
    eventNumber: '2026123401',
    judgeName: 'Multiple judges',
    registryId: 'AKC',
    trialNumber: '1',
  },
  allClasses: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Container',
      level: 'Novice',
      judgeName: 'Pat Judge',
    },
    {
      id: 'class-2',
      trialId: 'trial-1',
      element: 'Interior',
      level: 'Advanced',
      judgeName: 'Pat Judge',
    },
    {
      id: 'class-3',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Master',
      judgeName: 'Sam Judge',
    },
  ],
  entries: [
    {
      id: 'entry-1',
      armband: '101',
      runOrder: 1,
      callName: 'Star',
      breed: 'Golden Retriever',
      handler: 'Sarah Johnson',
      registrationNumber: null,
      checkInStatus: 'present',
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: 12,
      totalFaults: 0,
      finalPlacement: 1,
      classElement: 'Container',
      judgeName: 'Pat Judge',
    },
    {
      id: 'entry-2',
      armband: '102',
      runOrder: 2,
      callName: 'Rocket',
      breed: 'Beagle',
      handler: 'Jamie Walker',
      registrationNumber: null,
      checkInStatus: 'present',
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: 18,
      totalFaults: 2,
      finalPlacement: 9996,
      classElement: 'Interior',
      judgeName: 'Pat Judge',
    },
    {
      id: 'entry-3',
      armband: '103',
      runOrder: 3,
      callName: 'Dash',
      breed: 'Border Collie',
      handler: 'Alex Lee',
      registrationNumber: null,
      checkInStatus: 'withdrawn',
      section: null,
      isScored: false,
      resultText: 'withdrawn',
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      classElement: 'Buried',
      judgeName: 'Sam Judge',
    },
  ],
  sortOrder: '',
} satisfies ReportProps;

describe('AKC Scent Work Certification Page PDF', () => {
  it('builds one value set per judge using judge-specific and trial-wide totals', () => {
    const [pat, sam] = buildAKCScentWorkCertificationPageValues(props);

    expect(pat?.judgeName).toBe('Pat Judge');
    expect(pat?.values.text).toMatchObject({
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.judgeName]: 'Pat Judge',
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.containerQualifying]: 1,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.interiorQualifying]: 0,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.exteriorQualifying]: 'X',
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.buriedQualifying]: 'X',
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.judgeTotalQualifying]: 1,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalEntries]: 3,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalRuns]: 2,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalWithdrawn]: 1,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.totalQualifying]: 1,
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.eventNumber]: '2026123401',
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.clubName]: 'Demo Scent Work Club',
      [AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.eventDate]: '4/12/2026',
    });

    expect(sam?.judgeName).toBe('Sam Judge');
    expect(sam?.values.text?.[AKC_SCENT_WORK_CERTIFICATION_PAGE_FIELDS.buriedQualifying]).toBe(0);
  });

  it('builds a flattened official PDF page for each judge', async () => {
    const bytes = await buildAKCScentWorkCertificationPagePdfBytes({
      props,
      templateBytes: new Uint8Array(await readFile(templatePath)),
    });
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toEqual([]);
  });

  it('uses the event number in the filename', () => {
    expect(buildAKCScentWorkCertificationPageFilename(props)).toBe(
      'akc-certification-page-2026123401.pdf'
    );
  });
});
