import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import { buildJudgeRecordPdf, COVER_BOTTOM, renderJudgeRecordCover } from './buildJudgeRecordPdf';
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

describe('judge record cover with a long day', () => {
  const longDay = () =>
    buildJudgeRecords({
      rows: Array.from({ length: 60 }, (_, index) =>
        row(`c${index}`, 'Pat', {
          name: `Class ${index} ${'with a very long descriptive class name '.repeat(index % 4)}`.trim(),
          trialId: index < 30 ? 't1' : 't2',
          trialLabel: index < 30 ? 'Trial 1' : 'Trial 2',
        })
      ),
      entryInfo: [],
      correctionsByEntryId: new Map(),
    })[0]!;

  it('flows onto more cover pages and keeps every line above the bottom margin', async () => {
    const cover = renderJudgeRecordCover(longDay(), 'Winter Trial');
    const pages = await pageContentStreams(cover);

    expect(pages.length).toBeGreaterThan(1);
    const lowest = 792 - COVER_BOTTOM * (72 / 25.4);
    for (const streams of pages) {
      const ys = streams
        .join('\n')
        .split('\n')
        .map(line => /^[\d.-]+ ([\d.-]+) Td$/.exec(line)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number);
      expect(ys.length).toBeGreaterThan(0);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(lowest - 1);
    }
    const text = pages.map(streams => streams.map(shownText).join(' ')).join(' ');
    for (let index = 0; index < 60; index += 1) expect(text).toContain(`Class ${index}`);
    expect(text).toContain('Trial 1 (continued)');
  });

  it('builds the whole record with a footer on every page, cover pages included', async () => {
    const bytes = await buildJudgeRecordPdf(longDay(), 'Winter Trial', 'America/Los_Angeles');
    const pages = (await pageContentStreams(bytes)).map(streams =>
      streams.map(shownText).join(' ')
    );

    expect(pages.length).toBeGreaterThan(61);
    pages.forEach((page, index) =>
      expect(page).toContain(`Packet page ${index + 1} of ${pages.length}`)
    );
  });
});
