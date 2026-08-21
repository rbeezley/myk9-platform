import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import { buildEmergencyPacketModel } from './emergencyTrialPacket';
import { buildEmergencyTrialPacketPdf, MAX_EMERGENCY_PACKET_BYTES } from './buildEmergencyTrialPacketPdf';
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
    },
  ],
  entries: [
    reportEntry('e1', 'c1', 't1', 101),
    reportEntry('e2', 'c1', 't1', 102),
    reportEntry('e3', 'c2', 't2', 201),
  ],
};

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
});
