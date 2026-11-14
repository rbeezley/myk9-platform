import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import { buildJudgeReviewPdf } from './buildJudgeReviewPdf';
import { buildJudgeReviews } from './judgeReview';
import { pageContentStreams, shownText } from './pdfPageStreams.testHelper';

const ROW = {
  id: 'c1',
  trialId: 't1',
  trialDate: '2026-12-07',
  trialLabel: 'Trial 1',
  name: 'Container Novice',
  judgeName: 'Pat Donovan',
  judgeId: 'j1',
  judgeSignedOffAt: null,
  registryId: 'AKC',
  runFinished: true,
  takesJudgeSignOff: true,
  entries: [
    {
      entryId: 'e1',
      armband: '101',
      dogName: 'Juni',
      handlerName: 'Jamie Walker',
      placement: 1,
      resultLabel: 'Q',
      qualified: true,
      timeLabel: '0:41.25',
      faults: 0,
    },
  ],
} as unknown as ResultsClassRow;

async function pageTexts(registryId: string): Promise<string[]> {
  const [judge] = buildJudgeReviews({
    rows: [{ ...ROW, registryId }],
    entryInfo: [],
    correctionsByEntryId: new Map([
      ['e1', [{ fieldLabel: 'time', was: '0:38.50', now: '0:41.25', at: '10:42 AM' }]],
    ]),
  });
  const bytes = await buildJudgeReviewPdf(
    judge!,
    'Winter Trial',
    'America/Los_Angeles',
    new Date()
  );
  return (await pageContentStreams(bytes)).map(streams => streams.map(shownText).join(' '));
}

describe('buildJudgeReviewPdf', () => {
  it('is a cover then one results page, with the packet footer on both', async () => {
    const pages = await pageTexts('AKC');

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Pat Donovan · 1 class · 1 page to initial');
    expect(pages[0]).toContain('Chapter 4, Section 17');
    expect(pages[0]).toContain('Packet page 1 of 2');
    expect(pages[1]).toContain('Packet page 2 of 2');
  });

  it('prints the result line, the correction note and the initials line on the results page', async () => {
    const [, results] = await pageTexts('AKC');

    expect(results).toContain('Container Novice');
    expect(results).toContain('Juni');
    expect(results).toContain('Q, 1st');
    expect(results).toContain('0:41.25');
    expect(results).toContain(
      'Changed after you submitted: time was 0:38.50, corrected by the secretary at 10:42 AM'
    );
    expect(results).toContain('I have compared this page with my scoresheets.');
    expect(results).toContain('Initials');
  });

  it('asks for a signature, and cites no AKC rule, outside AKC', async () => {
    const [cover, results] = await pageTexts('UKC');

    expect(cover).not.toContain('Chapter 4');
    expect(cover).toContain('sign the page');
    expect(results).toContain('Signature');
    expect(results).not.toContain('Initials ____');
  });
});
