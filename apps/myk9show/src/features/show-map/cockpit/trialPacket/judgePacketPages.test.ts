import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildJudgePacketPdf } from './buildJudgePacketPdf';
import { collateTrialPacket } from './collateTrialPacket';
import { pageContentStreams, shownText } from './pdfPageStreams.testHelper';
import { CLASSES, ENTRIES, SHOW, TRIAL, classRow, entryRow } from './trialPacketFixtures';

/**
 * Pins the whole judge packet: page order and every page's shown text, footer included. The
 * packet's collation, cover, footer and assembly moved into the shared renderer (MYK9-2085);
 * this is the page-for-page record that the browser's output did not change.
 */
describe('judge packet pages', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-06T18:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function recordPackets(classes: typeof CLASSES, entries: typeof ENTRIES) {
    const packet = collateTrialPacket({
      show: SHOW,
      trials: [TRIAL],
      classes,
      entries,
      trialId: TRIAL.id,
    });
    if (!packet) throw new Error('trial not found');
    const printedAt = new Date('2026-12-06T18:00:00Z');
    const record: Record<string, string[]> = {};
    for (const judge of packet.judges) {
      const pages = await pageContentStreams(
        await buildJudgePacketPdf(packet, judge, SHOW.name, printedAt)
      );
      record[judge.key] = pages.map(streams =>
        // The sheets' own "Generated" stamp prints in the machine's zone; the packet footer is
        // the trial's, so only the sheet stamp is masked.
        streams
          .map(shownText)
          .join(' | ')
          .replace(/Generated .*? (?=Winter Trial)/g, 'Generated <stamp> ')
      );
    }
    return { record, cancelled: packet.cancelledClassCount, empty: packet.emptyClassCount };
  }

  it('keeps the page order and the text on every page, for every judge', async () => {
    expect((await recordPackets(CLASSES, ENTRIES)).record).toMatchSnapshot();
  });

  it('never prints TBD on a class nobody judges; the line reads Judge to be announced (MYK9-2377)', async () => {
    const { record } = await recordPackets(CLASSES, ENTRIES);
    const printed = Object.values(record).flat().join(' ');
    expect(printed).toContain('Buried Novice · Judge to be announced');
    expect(printed).not.toContain('Judge: Judge');
    expect(printed).not.toMatch(/\bTBD\b/);
  });

  it('keeps the edges too: cancelled, ties, no start, midnight and noon, no time limit, judge spelling', async () => {
    const judge = (first: string, last: string) => [
      { people: { first_name: first, last_name: last } },
    ];
    const classes = [
      classRow('e-cancelled', {
        element: 'Interior',
        level: 'Advanced',
        start_time: '07:00:00',
        status: 'cancelled',
        judge_assignments: judge('Pat', 'Donovan'),
      }),
      classRow('e-tie-a', {
        element: 'Container',
        level: 'Advanced',
        section: 'A',
        start_time: '12:00:00',
        display_order: 5,
        name: null,
        judge_assignments: judge('Pat', 'Donovan'),
      }),
      classRow('e-tie-b', {
        element: 'Container',
        level: 'Advanced',
        section: 'B',
        start_time: '12:00:00',
        display_order: 5,
        name: 'Container Advanced B',
        judge_assignments: judge(' pat ', 'DONOVAN '),
      }),
      classRow('e-midnight', {
        element: 'Exterior',
        level: 'Advanced',
        start_time: '00:00:00',
        display_order: 6,
        time_limit_seconds: null,
        judge_assignments: judge('Sam', 'Lee'),
      }),
      classRow('e-nostart', {
        element: 'Buried',
        level: 'Advanced',
        start_time: null,
        display_order: 7,
        time_limit_seconds: 0,
        judge_assignments: judge('Sam', 'Lee'),
      }),
    ];
    const entries = [
      entryRow('x1', 'e-cancelled', 501, 1),
      entryRow('x2', 'e-tie-a', 502, 1),
      entryRow('x3', 'e-tie-b', 503, 1),
      entryRow('x4', 'e-midnight', 504, null),
      entryRow('x5', 'e-nostart', 505, 1),
    ];
    expect(await recordPackets(classes, entries)).toMatchSnapshot();
  });
});
