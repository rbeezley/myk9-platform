import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import { buildEmergencyPacketModel } from './emergencyTrialPacket';
import jsPDF from 'jspdf';
import {
  buildEmergencyTrialPacketPdf,
  layoutDetailLines,
  MAX_EMERGENCY_PACKET_BYTES,
} from './buildEmergencyTrialPacketPdf';
import type { EmergencyPacketInput } from './types';

function reportEntry(id: string, classId: string, trialId: string, armband: number): ReportEntry {
  return {
    id,
    armband,
    breed: 'All-American Dog',
    callName: `Dog ${armband}`,
    checkInStatus: null,
    classId,
    finalPlacement: null,
    handler: `Handler ${armband}`,
    isScored: false,
    registrationNumber: `REG-${armband}`,
    resultText: null,
    runOrder: armband,
    searchTimeSeconds: null,
    section: null,
    totalFaults: null,
    trialId,
  };
}

const fixture: EmergencyPacketInput = {
  generatedAt: '2026-10-01T23:00:00.000Z',
  show: {
    id: 'show-pdf',
    name: 'Prairie Fall Trial',
    clubName: 'Prairie Dog Club',
    organization: 'AKC',
    startDate: '2026-10-03',
    endDate: '2026-10-04',
  },
  trials: [
    { id: 't1', date: '2026-10-03', name: 'Saturday', trialNumber: '1', registryId: 'AKC' },
    { id: 't2', date: '2026-10-04', name: 'Sunday', trialNumber: '2', registryId: 'AKC' },
  ],
  classes: [
    {
      id: 'c1',
      trialId: 't1',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      classNumber: '101',
      displayOrder: 1,
      judgeName: 'Judge One',
      ringLabel: 'Ring 1',
      startTime: '08:00',
      timeLimitSeconds: 120,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
    },
    {
      id: 'c2',
      trialId: 't2',
      name: 'Interior Advanced',
      element: 'Interior',
      level: 'Advanced',
      section: null,
      classNumber: '201',
      displayOrder: 1,
      judgeName: 'Judge Two',
      ringLabel: 'Ring 2',
      startTime: '09:30',
      timeLimitSeconds: 180,
      timeLimitArea2Seconds: 120,
      timeLimitArea3Seconds: 90,
      numAreas: null,
    },
  ],
  entries: [
    reportEntry('e1', 'c1', 't1', 101),
    reportEntry('e2', 'c1', 't1', 102),
    reportEntry('e3', 'c2', 't2', 201),
  ],
};

/**
 * Read the text jsPDF actually drew.
 *
 * This suite previously asserted only page count, page size and title — none of
 * which can tell whether a field reached the paper. That blind spot is exactly
 * how the class time limit came to be read from the DB, mapped by the adapter,
 * carried in the type and rendered nowhere for the life of the feature
 * (MYK9-198 mock-trial-day audit). Content streams are Flate-compressed, so a
 * grep of the raw bytes finds nothing and silently passes; they have to be
 * decoded.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const chunks: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFRawStream ? [contents] : [];
    for (const stream of streams) {
      chunks.push(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
    }
  }
  // jsPDF emits show-text operators as `(literal) Tj`.
  return chunks
    .join('\n')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')');
}

describe('buildEmergencyTrialPacketPdf', () => {
  it('creates one bounded vector PDF page for every modeled paper page', async () => {
    const model = buildEmergencyPacketModel(fixture);
    const bytes = buildEmergencyTrialPacketPdf(model);
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect(pdf.getPageCount()).toBe(model.pages.length);
    for (const page of pdf.getPages()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
    }
    expect(pdf.getTitle()).toBe('Prairie Fall Trial — Emergency Trial Packet');
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_EMERGENCY_PACKET_BYTES);
  });

  it('prints the class maximum on the pages a judge writes on', async () => {
    const model = buildEmergencyPacketModel(fixture);
    const text = await extractPdfText(buildEmergencyTrialPacketPdf(model));

    // Single-area class.
    expect(text).toContain('Max time 2:00');
    // Multi-area class: a sheet showing only area 1 is wrong at areas 2 and 3.
    expect(text).toContain('Area 1 3:00');
    expect(text).toContain('Area 2 2:00');
    expect(text).toContain('Area 3 1:30');
  });

  it('wraps rather than clips when the detail line overflows', async () => {
    // The time limit sits LAST on that line, so truncating it away is the
    // failure mode that matters: a long class name must not cost the judge the
    // one number the ring runs on.
    // `classLabel` builds from element/level/section and the judge name — NOT
    // from `name` — so overflow has to be forced through the fields that
    // actually reach the line.
    const long = structuredClone(fixture) as EmergencyPacketInput;
    long.classes[1].element = 'Interior and Exterior Combined Championship';
    long.classes[1].level = 'Advanced Qualifying Round';
    long.classes[1].judgeName = 'Alexandra Featherstonehaugh-Willoughby';
    const text = await extractPdfText(buildEmergencyTrialPacketPdf(buildEmergencyPacketModel(long)));

    expect(text).toContain('Area 3 1:30');
    expect(text).not.toContain('...');
  });

  describe('layoutDetailLines', () => {
    // Row batching is fixed in the model, so a taller header eats the table's
    // space rather than repaginating. The header therefore has to be bounded.
    const doc = () => new jsPDF({ unit: 'mm', format: 'letter' });
    const absurd = 'Interior and Exterior Combined Championship Qualifying Round'.repeat(12);

    it('never exceeds the height the fixed row batches leave room for', () => {
      expect(layoutDetailLines(doc(), [absurd], 'Max time 3:00').length).toBeLessThanOrEqual(4);
      expect(
        layoutDetailLines(doc(), [absurd], `Max time — ${'Area 1 3:00 · '.repeat(10)}`).length
      ).toBeLessThanOrEqual(4);
    });

    it('truncates identity rather than the time limit', () => {
      const lines = layoutDetailLines(doc(), [absurd], 'Max time 3:00');
      expect(lines.at(-1)).toBe('Max time 3:00');
      expect(lines.some(line => line.endsWith('...'))).toBe(true);
    });

    it('leaves a short header untouched', () => {
      expect(layoutDetailLines(doc(), ['Trial 1', '2026-10-03'], 'Max time 2:00')).toEqual([
        'Trial 1 · 2026-10-03',
        'Max time 2:00',
      ]);
    });
  });
});
