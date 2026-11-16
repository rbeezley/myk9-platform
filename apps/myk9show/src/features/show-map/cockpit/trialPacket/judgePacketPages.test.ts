import { describe, expect, it } from 'vitest';

import { buildJudgePacketPdf } from './buildJudgePacketPdf';
import { collateTrialPacket } from './collateTrialPacket';
import { pageContentStreams, shownText } from './pdfPageStreams.testHelper';
import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

/**
 * Pins the whole judge packet: page order and every page's shown text, footer included. The
 * packet's collation, cover, footer and assembly moved into the shared renderer (MYK9-2085);
 * this is the page-for-page record that the browser's output did not change.
 */
describe('judge packet pages', () => {
  it('keeps the page order and the text on every page, for every judge', async () => {
    const packet = collateTrialPacket({
      show: SHOW,
      trials: [TRIAL],
      classes: CLASSES,
      entries: ENTRIES,
      trialId: TRIAL.id,
    });
    if (!packet) throw new Error('trial not found');
    const printedAt = new Date('2026-12-06T18:00:00Z');
    const record: Record<string, string[]> = {};
    for (const judge of packet.judges) {
      const pages = await pageContentStreams(
        await buildJudgePacketPdf(packet, judge, SHOW.name, printedAt)
      );
      record[judge.key] = pages.map(streams => streams.map(shownText).join(' | '));
    }
    expect(record).toMatchSnapshot();
  });
});
