// @vitest-environment node
//
// The trial-day packet the edge function saves (MYK9-2079) is built by shared Deno-safe code, so
// it runs here under node with jsPDF and pdf-lib passed in, the way the function passes them.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { parseStoredClockTime } from '@myk9/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import { getRegistry, listRegistries, type RegistryId } from '@/features/registries';
import { getScentWorkSport, scentWorkLevelOrder } from '@/features/registries/scentWork';
import { buildEmergencyPacketData } from '@/pages/secretary/ReportsPage/reportDataMapping';
import { buildClassSheetParts as buildBrowserClassSheetParts } from '../show-map/cockpit/trialPacket/buildJudgePacketPdf';
import { buildJudgePacketPdf } from '../show-map/cockpit/trialPacket/buildJudgePacketPdf';
import { collateTrialPacket } from '../show-map/cockpit/trialPacket/collateTrialPacket';
import {
  pageContentStreams,
  shownText,
} from '../show-map/cockpit/trialPacket/pdfPageStreams.testHelper';
import { CLASSES, ENTRIES, SHOW, TRIAL } from '../show-map/cockpit/trialPacket/trialPacketFixtures';
import {
  buildClassSheetParts,
  buildTrialDayPacketPdf,
  classSheetModel,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketDay.ts';
import {
  comparePacketClassProgression,
  packetRegistryName,
  parsePacketClockTime,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/packetClassOrder.ts';
import type { EmergencyPacketClass, EmergencyPacketInput, PacketReportEntry } from './types';

const pdfLib = { PDFDocument, StandardFonts, rgb };
const PRINTED_AT = new Date('2026-12-06T18:00:00Z');

function packetClass(
  id: string,
  trialId: string,
  overrides: Partial<EmergencyPacketClass> = {}
): EmergencyPacketClass {
  return {
    id,
    trialId,
    name: id,
    element: 'Container',
    level: 'Novice',
    section: null,
    classNumber: null,
    displayOrder: null,
    judgeName: 'Pat Donovan',
    ringLabel: null,
    startTime: null,
    timeLimitSeconds: 180,
    timeLimitArea2Seconds: null,
    timeLimitArea3Seconds: null,
    numAreas: null,
    numHides: null,
    distractionCount: null,
    ...overrides,
  };
}

function dog(id: string, classId: string, trialId: string, armband: string): PacketReportEntry {
  return {
    id,
    classId,
    trialId,
    armband,
    runOrder: Number(armband) % 100,
    callName: `Dog ${armband}`,
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: null,
    section: null,
  };
}

/** Two trials on one day: Pat and Sam judge, one class has nobody, one has no dogs. */
const DAY: EmergencyPacketInput = {
  generatedAt: '2026-12-06T18:00:00.000Z',
  show: { id: 's1', name: 'Winter Trial', startDate: '2026-12-07', endDate: '2026-12-07' },
  trials: [
    { id: 't2', date: '2026-12-07', name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
    { id: 't1', date: '2026-12-07', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
  ],
  classes: [
    packetClass('t1-pat', 't1', { element: 'Container', startTime: '09:00 AM' }),
    packetClass('t1-sam', 't1', {
      element: 'Exterior',
      judgeName: 'Sam Lee',
      startTime: '08:00 AM',
    }),
    packetClass('t1-nobody', 't1', { element: 'Buried', judgeName: '', startTime: '10:00 AM' }),
    packetClass('t1-empty', 't1', { element: 'Handler Discrimination', judgeName: 'Sam Lee' }),
    packetClass('t2-pat', 't2', { element: 'Interior', startTime: '09:00 AM' }),
  ],
  entries: [
    dog('e1', 't1-pat', 't1', '101'),
    dog('e2', 't1-pat', 't1', '102'),
    dog('e3', 't1-sam', 't1', '201'),
    dog('e4', 't1-nobody', 't1', '301'),
    dog('e5', 't2-pat', 't2', '401'),
  ],
};

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pages = await pageContentStreams(bytes);
  return pages.map(streams => streams.map(shownText).join(' | '));
}

/** What a page is, read off its text: a judge's page, or one of the emergency packet's. */
function pageRole(text: string): string {
  const footer = /(.+?)\. Printed [^|]*Later changes are in the app\./.exec(text);
  if (footer) return `judge:${footer[1]?.split('|').at(-1)?.trim()}`;
  if (text.includes('Judge & Secretary Certification')) return 'certification';
  if (text.includes('Entry Catalog')) return 'catalog';
  if (text.includes('Paper Results Recovery')) return 'recovery';
  return 'other';
}

describe('buildTrialDayPacketPdf', () => {
  it('lays a day out as each trial’s judge packets, its catalog and certification, then recovery', async () => {
    const { bytes, pageCount } = await buildTrialDayPacketPdf({
      input: DAY,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const texts = await pageTexts(bytes);
    expect(pageCount).toBe(texts.length);

    const roles = texts.map(pageRole);
    const sections = roles.filter((role, index) => role !== roles[index - 1]);
    expect(sections).toEqual([
      // Trial 1 sorts first, whatever order the trials arrive in.
      'judge:Sam Lee',
      'judge:Pat Donovan',
      'judge:No judge assigned',
      'catalog',
      'certification',
      'judge:Pat Donovan',
      'catalog',
      'certification',
      'recovery',
    ]);
    expect(roles).not.toContain('other');
  });

  it('keeps the snapshot marker on the appended pages and leaves it off the judge packets', async () => {
    const { bytes } = await buildTrialDayPacketPdf({
      input: DAY,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const texts = await pageTexts(bytes);
    for (const text of texts) {
      const role = pageRole(text);
      expect(text.includes('SNAPSHOT')).toBe(!role.startsWith('judge:'));
    }
  });

  it('prints the footer on the show’s clock and counts each judge’s own pages', async () => {
    const input: EmergencyPacketInput = {
      ...DAY,
      trials: DAY.trials.map(trial => ({ ...trial, timezone: 'America/Los_Angeles' })),
    };
    const { bytes } = await buildTrialDayPacketPdf({
      input,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const texts = await pageTexts(bytes);
    const sam = texts.filter(text => pageRole(text) === 'judge:Sam Lee');
    expect(sam.length).toBeGreaterThan(1);
    sam.forEach((text, index) => {
      expect(text).toContain('Printed Dec 6, 10:00 AM.');
      expect(text).toContain(`Packet page ${index + 1} of ${sam.length}`);
    });
  });

  it('falls back to Eastern time for a time zone it cannot read', async () => {
    const input: EmergencyPacketInput = {
      ...DAY,
      trials: DAY.trials.map(trial => ({ ...trial, timezone: 'Not/AZone' })),
    };
    const { bytes } = await buildTrialDayPacketPdf({
      input,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    expect((await pageTexts(bytes)).join(' ')).toContain('Printed Dec 6, 1:00 PM.');
  });

  it('gives a class with no dogs no sheets and no row on the cover', async () => {
    const { bytes } = await buildTrialDayPacketPdf({
      input: DAY,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const texts = await pageTexts(bytes);
    const sam = texts.filter(text => pageRole(text) === 'judge:Sam Lee');
    expect(sam.join(' ')).toContain('Exterior Novice');
    expect(sam.join(' ')).not.toContain('Handler Discrimination');
  });

  it('still prints a trial’s catalog and certification when none of its classes has a dog', async () => {
    const input: EmergencyPacketInput = {
      ...DAY,
      entries: DAY.entries.filter(entry => entry.trialId === 't2'),
    };
    const { bytes } = await buildTrialDayPacketPdf({
      input,
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const roles = (await pageTexts(bytes)).map(pageRole);
    expect(roles.filter(role => role === 'certification')).toHaveLength(2);
    expect(roles.at(-1)).toBe('recovery');
  });
});

describe('one class’s sheets', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PRINTED_AT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The same classes the browser's packet prints, as the packet source returns them. */
  function sourceInput(): EmergencyPacketInput {
    const mapped = buildEmergencyPacketData({
      show: SHOW,
      trials: [TRIAL],
      classes: CLASSES,
      entries: ENTRIES,
    });
    const judges: Record<string, string> = {
      'c-container': 'Pat Donovan',
      'c-interior': 'Pat Donovan',
      'c-empty': 'Pat Donovan',
      'c-exterior': 'Sam Lee',
      'c-buried': '',
    };
    return {
      ...mapped,
      generatedAt: PRINTED_AT.toISOString(),
      classes: mapped.classes.map(item => ({ ...item, judgeName: judges[item.id] ?? '' })),
    };
  }

  it('prints the pages the browser’s class sheets print, check-in sheet then scoresheet', async () => {
    const input = sourceInput();
    const browser = collateTrialPacket({
      show: SHOW,
      trials: [TRIAL],
      classes: CLASSES,
      entries: ENTRIES,
      trialId: TRIAL.id,
    });
    if (!browser) throw new Error('trial not found');

    for (const judgeClass of browser.judges.flatMap(judge => judge.classes)) {
      const classItem = input.classes.find(item => item.id === judgeClass.classId)!;
      const model = classSheetModel(input, input.trials[0]!, classItem);
      const server = (await Promise.all(buildClassSheetParts(model, jsPDF).map(pageTexts))).flat();
      const app = (
        await Promise.all(buildBrowserClassSheetParts(judgeClass).map(pageTexts))
      ).flat();
      expect(server.length).toBeGreaterThan(1);
      expect(server).toEqual(app);
    }
  });

  it('builds the same judge packet pages as the browser, cover and footer included', async () => {
    const browser = collateTrialPacket({
      show: SHOW,
      trials: [TRIAL],
      classes: CLASSES,
      entries: ENTRIES,
      trialId: TRIAL.id,
    });
    if (!browser) throw new Error('trial not found');
    const { bytes } = await buildTrialDayPacketPdf({
      input: sourceInput(),
      pdfLib,
      JsPdf: jsPDF,
      printedAt: PRINTED_AT,
    });
    const serverTexts = await pageTexts(bytes);

    let offset = 0;
    for (const judge of browser.judges) {
      const expected = await pageTexts(
        await buildJudgePacketPdf(browser, judge, SHOW.name, PRINTED_AT)
      );
      expect(serverTexts.slice(offset, offset + expected.length)).toEqual(expected);
      offset += expected.length;
    }
    expect(pageRole(serverTexts[offset] ?? '')).toBe('catalog');
  });
});

describe('mirrors of app code, pinned to the original', () => {
  const CLOCK_TEXTS = [
    '9:00 AM',
    '09:00 AM',
    '12:00 AM',
    '12:30 PM',
    '1:05 pm',
    '1:05 p.m.',
    '13:30',
    '09:00:00',
    '23:59',
    '24:00',
    '0:00 AM',
    '13:00 PM',
    '9:60 AM',
    '9:00 XM',
    '',
    '  7:15  ',
    'noon',
    '2026-12-07T09:00:00Z',
  ];

  it('reads a stored clock time as @myk9/core does', () => {
    for (const text of [...CLOCK_TEXTS, null, undefined]) {
      expect(parsePacketClockTime(text)).toBe(parseStoredClockTime(text));
    }
  });

  it('orders classes as the registry progression does, for every registry', () => {
    const registries = listRegistries() as RegistryId[];
    expect(registries.sort()).toEqual(['AKC', 'ASCA', 'UKC']);
    for (const registryId of registries) {
      const levels = [
        ...scentWorkLevelOrder(getScentWorkSport(registryId)),
        'Masters',
        'novice a',
        'Custom',
        'Zebra',
        '',
      ];
      const classes = ['Buried', 'Container', 'Interior'].flatMap(element =>
        levels.flatMap(level => [null, 'A', 'B'].map(section => ({ element, level, section })))
      );
      for (const a of classes) {
        for (const b of classes) {
          expect(
            Math.sign(comparePacketClassProgression(a, b, registryId)),
            `${registryId} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
          ).toBe(Math.sign(compareClassesByProgression(a, b, registryId)));
        }
      }
    }
  });

  it('reads a blank or unknown registry as AKC, as getTrialRegistry does', () => {
    const a = { element: 'Container', level: 'Novice B', section: null };
    const b = { element: 'Container', level: 'Novice A', section: null };
    for (const registryId of ['', '  ', 'FCI', null, undefined]) {
      expect(Math.sign(comparePacketClassProgression(a, b, registryId))).toBe(
        Math.sign(compareClassesByProgression(a, b, 'AKC'))
      );
    }
  });

  it('names each registry as the registry does', () => {
    for (const registryId of listRegistries() as RegistryId[]) {
      expect(packetRegistryName(registryId)).toBe(getRegistry(registryId).name);
    }
    expect(packetRegistryName('')).toBe(getRegistry('AKC').name);
  });
});
