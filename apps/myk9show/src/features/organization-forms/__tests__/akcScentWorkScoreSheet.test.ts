import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportProps } from '@/lib/reports/types';
import {
  buildAKCScentWorkScoreSheetFilename,
  buildAKCScentWorkScoreSheetPdfBytes,
  buildAKCScentWorkScoreSheetValues,
} from '../akcScentWorkScoreSheet';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const baseProps = {
  showId: 'show-1',
  showName: 'Spring Scent Trial',
  trial: {
    date: '2026-04-12',
    eventNumber: '2026123401',
    registryId: 'AKC',
    trialNumber: '1',
  },
  classData: {
    element: 'Buried',
    level: 'Novice',
    section: '',
    timeLimitSeconds: 120,
    timeLimitArea2Seconds: null,
    timeLimitArea3Seconds: null,
    areaCount: 1,
  },
  entries: [
    {
      id: 'entry-1',
      armband: 102,
      runOrder: 2,
      callName: 'Star',
      breed: 'Golden Retriever',
      handler: 'Sarah Johnson',
    },
    {
      id: 'entry-2',
      armband: 101,
      runOrder: 1,
      callName: 'Rocket',
      breed: 'Beagle',
      handler: 'Jamie Walker',
    },
    {
      id: 'entry-3',
      armband: 103,
      runOrder: 3,
      callName: 'Dash',
      breed: 'Border Collie',
      handler: 'Alex Lee',
    },
  ],
  sortOrder: 'run-order',
} satisfies ReportProps;

async function readScoreSheetTemplate(): Promise<Uint8Array> {
  const buffer = await readFile(resolve(repoRoot, 'docs/AKC-forms/SW-Scoresheet.pdf'));
  return new Uint8Array(buffer);
}

describe('AKC Scent Work score sheet PDF', () => {
  it('builds the header values used on each half-sheet', () => {
    expect(buildAKCScentWorkScoreSheetValues(baseProps)).toEqual([
      {
        armNumber: '101',
        breed: 'Beagle',
        callName: 'Rocket',
        className: 'Buried Novice',
        date: '4/12/2026',
        eventNumber: '2026123401',
        timeLimits: '2 min',
      },
      {
        armNumber: '102',
        breed: 'Golden Retriever',
        callName: 'Star',
        className: 'Buried Novice',
        date: '4/12/2026',
        eventNumber: '2026123401',
        timeLimits: '2 min',
      },
      {
        armNumber: '103',
        breed: 'Border Collie',
        callName: 'Dash',
        className: 'Buried Novice',
        date: '4/12/2026',
        eventNumber: '2026123401',
        timeLimits: '2 min',
      },
    ]);
  });

  it('uses one landscape page for every two entries', async () => {
    const bytes = await buildAKCScentWorkScoreSheetPdfBytes({
      props: baseProps,
      templateBytes: await readScoreSheetTemplate(),
    });
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();

    expect(pages).toHaveLength(2);
    expect(pages[0]?.getWidth()).toBe(792);
    expect(pages[0]?.getHeight()).toBe(612);
  });

  it('includes the event and class in the generated filename', () => {
    expect(buildAKCScentWorkScoreSheetFilename(baseProps)).toBe(
      'akc-score-sheets-2026123401-Buried-Novice.pdf'
    );
  });
});
