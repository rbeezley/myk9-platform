import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PDFDocument } from 'pdf-lib';

import { buildPages } from '@/pages/secretary/ReportsPage/reportPreviewPages';
import { getReportById } from '@/lib/reports/reportRegistry';

import { buildClassSheetParts, buildJudgePacketPdf } from './buildJudgePacketPdf';
import { collateTrialPacket, NO_JUDGE_KEY } from './collateTrialPacket';
import { buildJudgeCoverModel, formatCoverDate } from './judgeCoverSheet';
import { formatPrintedAt } from './packetFooter';
import { pageContentStreams, shownText } from './pdfPageStreams.testHelper';
import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

function collate(classes = CLASSES, entries = ENTRIES) {
  const packet = collateTrialPacket({
    show: SHOW,
    trials: [TRIAL],
    classes,
    entries,
    trialId: TRIAL.id,
  });
  if (!packet) throw new Error('trial not found');
  return packet;
}

describe('collateTrialPacket', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-06T18:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups classes by judge, with the class nobody judges in its own packet last', () => {
    const packet = collate();
    expect(packet.judges.map(judge => judge.judgeName)).toEqual(['Pat Donovan', 'Sam Lee', null]);
    expect(packet.judges[2]?.key).toBe(NO_JUDGE_KEY);
    expect(packet.judges[2]?.classes.map(item => item.classId)).toEqual(['c-buried']);
  });

  it('orders a judge’s classes by the schedule, not by how the rows arrived', () => {
    const pat = collate().judges[0];
    expect(pat?.classes.map(item => item.classId)).toEqual(['c-interior', 'c-container']);
    expect(pat?.classes.map(item => item.label)).toEqual(['Interior Novice', 'Container Novice']);
  });

  it('lists each class’s dogs in run order', () => {
    const pat = collate().judges[0];
    const container = pat?.classes.find(item => item.classId === 'c-container');
    expect(container?.runOrder).toEqual(['101', '102', '103']);
    const interior = pat?.classes.find(item => item.classId === 'c-interior');
    expect(interior?.runOrder).toEqual(['401', '402']);
  });

  it('leaves out a class with no dogs and says how many', () => {
    const packet = collate();
    expect(packet.emptyClassCount).toBe(1);
    const everyClass = packet.judges.flatMap(judge => judge.classes.map(item => item.classId));
    expect(everyClass).not.toContain('c-empty');
  });

  it('keeps another trial’s classes out of the packet', () => {
    const other = { ...CLASSES[1], id: 'c-other', trial_id: 'trial-2' } as (typeof CLASSES)[number];
    const packet = collate(
      [...CLASSES, other],
      [
        ...ENTRIES,
        { ...ENTRIES[3], id: 'e-other', class_id: 'c-other' } as (typeof ENTRIES)[number],
      ]
    );
    const everyClass = packet.judges.flatMap(judge => judge.classes.map(item => item.classId));
    expect(everyClass).not.toContain('c-other');
  });

  it('returns nothing for a trial that is not in the show', () => {
    expect(
      collateTrialPacket({
        show: SHOW,
        trials: [TRIAL],
        classes: CLASSES,
        entries: ENTRIES,
        trialId: 'missing',
      })
    ).toBeNull();
  });

  it('prints each class’s sheets exactly as the single-class print does', async () => {
    const packet = collate();
    for (const judge of packet.judges) {
      for (const item of judge.classes) {
        const single = buildPages(TRIAL.id, item.classId, [TRIAL], CLASSES, ENTRIES);
        const expected = ['check-in-sheet', 'scoresheet'].map(id => {
          const report = getReportById(id);
          return report?.buildPdf?.({ show: SHOW, pages: single }, 'run-order');
        });
        const packetParts = buildClassSheetParts(item);
        expect(packetParts).toHaveLength(2);
        for (const [index, part] of packetParts.entries()) {
          // The same renderer on the same rows. jsPDF stamps a random file id in the trailer, so
          // the bytes differ; every page's drawn content is compared instead.
          const singlePages = await pageContentStreams(expected[index] as Uint8Array);
          const partPages = await pageContentStreams(part);
          expect(partPages.length).toBeGreaterThan(0);
          expect(partPages).toEqual(singlePages);
        }
      }
    }
  });

  it('carries each class’s pages in the judge’s packet unchanged, apart from the footer', async () => {
    const packet = collate();
    const judge = packet.judges[0]!;
    const packetPages = await pageContentStreams(
      await buildJudgePacketPdf(packet, judge, SHOW.name)
    );
    const expectedPages = (
      await Promise.all(judge.classes.flatMap(buildClassSheetParts).map(pageContentStreams))
    ).flat();
    // Page 1 is the cover. Stamping wraps a page's own streams in a save/restore pair (`q` first,
    // `Q` last) and adds the footer after them, so the class's content is what lies between.
    const classPages = packetPages.slice(1).map(streams => streams.slice(1, -2));
    expect(classPages).toEqual(expectedPages);
    // And they are the class's own sheets: its first armband is drawn on them.
    const drawn = classPages.flat().map(shownText).join(' ');
    expect(drawn).toContain(judge.classes[0]?.runOrder[0] ?? 'missing');
  });

  it('leaves a cancelled class out of the packet, and counts it', () => {
    const cancelled = CLASSES.map(item =>
      item.id === 'c-container' ? ({ ...item, status: 'cancelled' } as typeof item) : item
    );
    const packet = collate(cancelled);
    const everyClass = packet.judges.flatMap(judge => judge.classes.map(item => item.classId));
    expect(everyClass).not.toContain('c-container');
    expect(packet.cancelledClassCount).toBe(1);
    expect(packet.judges[0]?.dogTotal).toBe(2);
    expect(collate().cancelledClassCount).toBe(0);
  });
});

describe('judge cover sheet', () => {
  it('counts each class’s dogs and the packet’s totals from the collated report data', () => {
    const packet = collate();
    const pat = packet.judges[0]!;
    const cover = buildJudgeCoverModel(packet, pat, SHOW.name);
    expect(cover.judgeName).toBe('Pat Donovan');
    expect(cover.rows).toEqual([
      { classLabel: 'Interior Novice', start: '8:00 AM', dogs: 2, maxTime: '4:00' },
      { classLabel: 'Container Novice', start: '9:00 AM', dogs: 3, maxTime: '3:00' },
    ]);
    expect(cover.totalDogs).toBe(5);
    // Per class: one check-in sheet and one scoresheet page per five dogs (the renderer's page size).
    expect(cover.sheetCount).toBe(pat.sheetTotal - 1);
    expect(cover.sheetCount).toBe(
      pat.classes.reduce((sum, item) => sum + item.checkInPages + item.scoreSheetPages, 0)
    );
    expect(cover.dateText).toBe('Mon, Dec 7');
    expect(cover.trialLabel).toBe(packet.trialLabel);
    expect(cover.registryName).toBe('American Kennel Club');
  });

  it('names the packet for classes with no judge', () => {
    const packet = collate();
    const cover = buildJudgeCoverModel(packet, packet.judges[2]!, SHOW.name);
    expect(cover.judgeName).toBe('No judge assigned');
    expect(cover.totalDogs).toBe(2);
    expect(cover.rows[0]?.start).toBe('11:00 AM');
  });

  it('reads a trial date as a calendar date', () => {
    expect(formatCoverDate('2026-12-07')).toBe('Mon, Dec 7');
    expect(formatCoverDate(null)).toBe('');
  });
});

describe('judge packet PDF', () => {
  it('is the cover sheet, then each class’s sheets, with the page count the panel quotes', async () => {
    const packet = collate();
    for (const judge of packet.judges) {
      const bytes = await buildJudgePacketPdf(packet, judge, SHOW.name);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(judge.sheetTotal);
    }
  });

  it('stamps the judge, the print time and Page n of N on every page', async () => {
    const packet = collate();
    const printedAt = new Date('2026-12-06T18:00:00Z');
    for (const judge of packet.judges) {
      const bytes = await buildJudgePacketPdf(packet, judge, SHOW.name, printedAt);
      const pages = await pageContentStreams(bytes);
      expect(pages).toHaveLength(judge.sheetTotal);
      const name = judge.judgeName ?? 'No judge assigned';
      pages.forEach((streams, index) => {
        const footer = shownText(streams[streams.length - 1] ?? '');
        expect(footer).toContain(
          `${name}. Printed ${formatPrintedAt(printedAt)}. Later changes are in the app.`
        );
        expect(footer).toContain(`Page ${index + 1} of ${pages.length}`);
      });
    }
  });
});
