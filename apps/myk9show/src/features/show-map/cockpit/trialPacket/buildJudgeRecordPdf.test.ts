import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import { buildJudgeRecordPdf } from './buildJudgeRecordPdf';
import { buildJudgeRecords } from './judgeRecord';
import { pageContentStreams, shownText } from './pdfPageStreams.testHelper';

function row(id: string, judgeName: string, overrides: Partial<ResultsClassRow> = {}) {
  return {
    id,
    trialId: 't1',
    trialDate: '2026-12-07',
    trialLabel: 'Trial 1',
    name: `Class ${id}`,
    judgeName,
    judgeId: `id-${judgeName}`,
    judgeSignedOffAt: '2026-12-07T21:00:00Z',
    registryId: 'AKC',
    runFinished: true,
    takesJudgeSignOff: true,
    entries: [
      {
        entryId: `e-${id}`,
        armband: '101',
        dogName: `Dog of ${id}`,
        handlerName: 'Jamie Walker',
        placement: 1,
        resultLabel: 'Q',
        qualified: true,
        timeLabel: '0:41.25',
        faults: 0,
      },
    ],
    ...overrides,
  } as unknown as ResultsClassRow;
}

async function pageTexts(judgeName: string): Promise<string[]> {
  const records = buildJudgeRecords({
    rows: [
      row('a', 'Pat'),
      row('b', 'Sam'),
      row('c', 'Pat', { trialId: 't2', trialLabel: 'Trial 2' }),
    ],
    entryInfo: [],
    correctionsByEntryId: new Map(),
  });
  const bytes = await buildJudgeRecordPdf(
    records.find(record => record.judgeName === judgeName)!,
    'Winter Trial',
    'America/Los_Angeles',
    new Date()
  );
  return (await pageContentStreams(bytes)).map(streams => streams.map(shownText).join(' '));
}

describe('buildJudgeRecordPdf', () => {
  it('is a cover, then each class on its own page, with the footer on every page', async () => {
    const pages = await pageTexts('Pat');

    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("Judge's record");
    expect(pages[0]).toContain('Pat Donovan'.replace(' Donovan', ''));
    expect(pages[0]).toContain('Trial 1');
    expect(pages[0]).toContain('Trial 2');
    expect(pages[0]).toContain(
      'This is a convenience copy. The signed paper is the official record.'
    );
    expect(pages[0]).toContain('Keep this file for one year.');
    pages.forEach((page, index) => expect(page).toContain(`Packet page ${index + 1} of 3`));
  });

  it("contains no other judge's classes or dogs", async () => {
    const text = (await pageTexts('Pat')).join(' ');

    expect(text).toContain('Dog of a');
    expect(text).toContain('Dog of c');
    expect(text).not.toContain('Class b');
    expect(text).not.toContain('Dog of b');
  });

  it('leaves off the initials box, since the pages are already initialled', async () => {
    const text = (await pageTexts('Sam')).join(' ');

    expect(text).toContain('Dog of b');
    expect(text).not.toContain('I have compared this page');
    expect(text).not.toContain('Initials');
  });
});
