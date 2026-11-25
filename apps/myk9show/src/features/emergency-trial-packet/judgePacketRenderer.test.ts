// @vitest-environment node
//
// The shared judge-packet code (collation, cover sheet, footer, assembly) runs under Deno in the
// edge function, so it is exercised here under node with jsPDF and pdf-lib passed in, the way
// the edge function will pass them (MYK9-2085).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { formatClockTime } from '@myk9/core';
import { describe, expect, it } from 'vitest';

import {
  pageContentStreams,
  shownText,
} from '../show-map/cockpit/trialPacket/pdfPageStreams.testHelper';
import { buildEmergencyPacketModel } from './emergencyTrialPacket';
import {
  collateJudgePackets,
  summarizeClassSheets,
  type PacketClassSheets,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketCollation.ts';
import {
  buildJudgeCoverModel,
  formatCoverDate,
  formatPacketClockTime,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/judgeCoverSheet.ts';
import {
  assembleJudgePacketPdf,
  mergePdfParts,
  winAnsiSafe,
} from '../../../../../supabase/functions/_shared/trialPacket/renderer/judgePacketPdf.ts';
import { buildEmergencyTrialPacketPdf } from './buildEmergencyTrialPacketPdf';
import type { EmergencyPacketClass, EmergencyPacketInput, PacketReportEntry } from './types';

function packetClass(
  id: string,
  overrides: Partial<EmergencyPacketClass> = {}
): EmergencyPacketClass {
  return {
    id,
    trialId: 't1',
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

function dog(id: string, classId: string, armband: string, runOrder: number): PacketReportEntry {
  return {
    id,
    classId,
    trialId: 't1',
    armband,
    runOrder,
    callName: `Dog ${armband}`,
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: null,
    section: null,
  };
}

const INPUT: EmergencyPacketInput = {
  generatedAt: '2026-12-06T18:00:00.000Z',
  show: { id: 's1', name: 'Winter Trial', startDate: '2026-12-07', endDate: '2026-12-07' },
  trials: [{ id: 't1', date: '2026-12-07', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' }],
  classes: [
    packetClass('late', { startTime: '09:00 AM', judgeName: 'Pat Donovan' }),
    packetClass('early', {
      startTime: '08:00 AM',
      judgeName: 'Pat Donovan',
      timeLimitSeconds: 240,
    }),
    packetClass('other', { startTime: '10:00 AM', judgeName: 'Sam Lee' }),
    packetClass('nobody', { startTime: '11:00 AM', judgeName: '' }),
    packetClass('empty', { startTime: '12:00 PM', judgeName: 'Sam Lee' }),
  ],
  entries: [
    dog('e1', 'late', '101', 1),
    dog('e2', 'late', '102', 2),
    dog('e3', 'early', '401', 1),
    dog('e4', 'other', '201', 1),
    dog('e5', 'nobody', '301', 1),
  ],
};

function parseMinutes(stored: string | null): number | null {
  const match = /^(\d+):(\d+) (AM|PM)$/.exec(stored ?? '');
  if (!match) return null;
  return ((Number(match[1]) % 12) + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
}

function sheetsFor(classItem: EmergencyPacketClass): PacketClassSheets | null {
  const model = buildEmergencyPacketModel(
    {
      ...INPUT,
      classes: [classItem],
      entries: INPUT.entries.filter(entry => entry.classId === classItem.id),
    },
    { snapshotMarker: false }
  );
  return summarizeClassSheets(model);
}

function collate() {
  const packet = collateJudgePackets(INPUT, {
    trialId: 't1',
    trialLabel: 'Trial 1',
    registryName: 'American Kennel Club',
    parseStartMinutes: parseMinutes,
    compareProgression: () => 0,
    sheetsFor,
  });
  if (!packet) throw new Error('trial not found');
  return packet;
}

describe('collateJudgePackets', () => {
  it('groups by judge, orders classes by start time, and puts the unassigned packet last', () => {
    const packet = collate();
    expect(packet.judges.map(judge => judge.judgeName)).toEqual(['Pat Donovan', 'Sam Lee', null]);
    expect(packet.judges[0]?.classes.map(item => item.classId)).toEqual(['early', 'late']);
    expect(packet.judges[2]?.key).toBe('no-judge');
  });

  it('carries each class’s label, start, time limit, run order and totals', () => {
    const pat = collate().judges[0]!;
    expect(pat.classes[0]).toMatchObject({
      label: 'Container Novice',
      startMinutes: 480,
      maxTime: '4:00',
      dogCount: 1,
      runOrder: ['401'],
    });
    expect(pat.dogTotal).toBe(3);
    expect(pat.sheetTotal).toBe(
      1 + pat.classes.reduce((n, c) => n + c.checkInPages + c.scoreSheetPages, 0)
    );
  });

  it('counts a class with no dogs as empty and leaves it out', () => {
    const packet = collate();
    expect(packet.emptyClassCount).toBe(1);
    const every = packet.judges.flatMap(judge => judge.classes.map(item => item.classId));
    expect(every).not.toContain('empty');
  });

  it('puts a class whose stored judge is "TBD" in the unassigned packet (MYK9-2377)', () => {
    const input: EmergencyPacketInput = {
      ...INPUT,
      classes: [
        packetClass('nobody', { judgeName: '' }),
        packetClass('legacy', { judgeName: 'TBD' }),
      ],
      entries: [dog('e1', 'nobody', '301', 1), dog('e2', 'legacy', '302', 1)],
    };
    const packet = collateJudgePackets(input, {
      trialId: 't1',
      trialLabel: 'Trial 1',
      registryName: 'American Kennel Club',
      parseStartMinutes: parseMinutes,
      compareProgression: () => 0,
      sheetsFor: classItem =>
        summarizeClassSheets(
          buildEmergencyPacketModel(
            {
              ...input,
              classes: [classItem],
              entries: input.entries.filter(entry => entry.classId === classItem.id),
            },
            { snapshotMarker: false }
          )
        ),
    });
    expect(packet?.judges).toHaveLength(1);
    expect(packet?.judges[0]).toMatchObject({ key: 'no-judge', judgeName: null });
  });

  it('returns nothing for a trial that is not in the input', () => {
    expect(
      collateJudgePackets(INPUT, {
        trialId: 'missing',
        trialLabel: '',
        registryName: '',
        parseStartMinutes: parseMinutes,
        compareProgression: () => 0,
        sheetsFor,
      })
    ).toBeNull();
  });
});

describe('judge cover sheet', () => {
  it('reads a trial date as a calendar date', () => {
    expect(formatCoverDate('2026-12-07')).toBe('Mon, Dec 7');
    expect(formatCoverDate(null)).toBe('');
  });

  it('formats a clock time the way @myk9/core does, for every minute of the day', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      expect(formatPacketClockTime(minutes)).toBe(formatClockTime(minutes));
    }
  });

  it('states the packet’s own counts', () => {
    const packet = collate();
    const cover = buildJudgeCoverModel(
      { trialLabel: packet.trialLabel, trialDate: '2026-12-07', registryName: packet.registryName },
      packet.judges[0]!,
      'Winter Trial'
    );
    expect(cover.rows[0]).toEqual({
      classLabel: 'Container Novice',
      start: '8:00 AM',
      dogs: 1,
      maxTime: '4:00',
    });
    expect(cover.totalDogs).toBe(3);
    expect(cover.dateText).toBe('Mon, Dec 7');
  });
});

describe('assembleJudgePacketPdf', () => {
  const pdfLib = { PDFDocument, StandardFonts, rgb };

  function classParts(classId: string): Uint8Array[] {
    const model = buildEmergencyPacketModel(
      {
        ...INPUT,
        classes: INPUT.classes.filter(item => item.id === classId),
        entries: INPUT.entries.filter(entry => entry.classId === classId),
      },
      { snapshotMarker: false }
    );
    return [buildEmergencyTrialPacketPdf(model, jsPDF)];
  }

  it('is the cover, then the class pages, with the footer on every page', async () => {
    const packet = collate();
    const judge = packet.judges[0]!;
    const bytes = await assembleJudgePacketPdf({
      pdfLib,
      JsPdf: jsPDF,
      packet: {
        trialLabel: packet.trialLabel,
        trialDate: '2026-12-07',
        registryName: packet.registryName,
      },
      judge,
      showName: 'Winter Trial',
      classParts: judge.classes.flatMap(item => classParts(item.classId)),
      printedAt: new Date('2026-12-06T18:00:00Z'),
      timeZone: 'America/New_York',
    });
    const pages = await pageContentStreams(bytes);
    expect(pages.length).toBeGreaterThan(2);
    expect(shownText(pages[0]!.join(' '))).toContain('Pat Donovan');
    pages.forEach((streams, index) => {
      const footer = shownText(streams.at(-1) ?? '');
      expect(footer).toContain(
        'Pat Donovan. Printed Dec 6, 1:00 PM. Later changes are in the app.'
      );
      expect(footer).toContain(`Packet page ${index + 1} of ${pages.length}`);
    });
  });

  it('still builds the packet for a judge whose name the standard font cannot encode', async () => {
    const packet = collate();
    const judge = { ...packet.judges[0]!, judgeName: 'Łukasz Wójcik-Nguyễn 李' };
    const bytes = await assembleJudgePacketPdf({
      pdfLib,
      JsPdf: jsPDF,
      packet: {
        trialLabel: packet.trialLabel,
        trialDate: '2026-12-07',
        registryName: packet.registryName,
      },
      judge,
      showName: 'Winter Trial',
      classParts: judge.classes.flatMap(item => classParts(item.classId)),
      printedAt: new Date('2026-12-06T18:00:00Z'),
      timeZone: 'America/New_York',
    });
    const pages = await pageContentStreams(bytes);
    expect(shownText(pages[0]!.at(-1) ?? '')).toContain('Lukasz Wójcik-Nguyen ?. Printed');
  });

  it('keeps WinAnsi text as it is and replaces only what the font cannot draw', () => {
    expect(winAnsiSafe('Renée O’Brien – Zoë Šimić')).toBe('Renée O’Brien – Zoë Šimic');
    expect(winAnsiSafe('Łódź 李')).toBe('Lódz ?');
  });

  it('reads a decomposed accent as the letter it belongs to', () => {
    // "Renée" with the accent stored as its own character, as imported text can carry it.
    expect(winAnsiSafe('Rene\u0301e')).toBe('Renée');
    // An accent WinAnsi has no composed letter for drops to the base letter.
    expect(winAnsiSafe('Nguye\u0302\u0303n')).toBe('Nguyen');
    // An accent with no letter before it is dropped, not printed as "?".
    expect(winAnsiSafe('\u0301Pat')).toBe('Pat');
  });

  it('merges parts in order into one document', async () => {
    const [a, b] = [classParts('late'), classParts('early')];
    const merged = await mergePdfParts(pdfLib, [...a, ...b]);
    const count = async (parts: Uint8Array[]) =>
      (await Promise.all(parts.map(part => PDFDocument.load(part)))).reduce(
        (sum, doc) => sum + doc.getPageCount(),
        0
      );
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(await count([...a, ...b]));
  });
});
