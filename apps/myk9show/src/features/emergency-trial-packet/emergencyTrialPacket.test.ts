import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import {
  buildEmergencyPacketFilename,
  buildEmergencyPacketModel,
  buildEmergencyPacketStoragePath,
  emergencyPacketAvailability,
  formatEmergencyPacketPageLabel,
} from './emergencyTrialPacket';
import type { EmergencyPacketInput } from './types';

function entry(overrides: Partial<ReportEntry> & Pick<ReportEntry, 'id'>): ReportEntry {
  return {
    armband: 100,
    breed: 'Border Collie',
    callName: 'Maple',
    checkInStatus: null,
    finalPlacement: null,
    handler: 'A. Handler',
    isScored: false,
    registrationNumber: 'DN123',
    resultText: null,
    runOrder: null,
    searchTimeSeconds: null,
    section: null,
    totalFaults: null,
    ...overrides,
  };
}

const input: EmergencyPacketInput = {
  generatedAt: '2026-08-20T20:15:00.000Z',
  show: {
    id: 'show-1',
    name: 'Old School Scent Work Trial',
    clubName: 'Prairie Dog Club',
    organization: 'AKC',
    startDate: '2026-10-03',
    endDate: '2026-10-04',
  },
  trials: [
    {
      id: 'trial-sunday',
      date: '2026-10-04',
      name: 'Sunday Trial',
      trialNumber: '2',
      registryId: 'AKC',
    },
    {
      id: 'trial-saturday',
      date: '2026-10-03',
      name: 'Saturday Trial',
      trialNumber: '1',
      registryId: 'AKC',
    },
  ],
  classes: [
    {
      id: 'class-master',
      trialId: 'trial-sunday',
      name: 'Interior Master',
      element: 'Interior',
      level: 'Master',
      section: null,
      classNumber: '201',
      displayOrder: 2,
      judgeName: 'Judge Sunday',
      ringLabel: 'Ring 2',
      startTime: '10:00',
      timeLimitSeconds: 240,
    },
    {
      id: 'class-novice',
      trialId: 'trial-saturday',
      name: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      classNumber: '101',
      displayOrder: 1,
      judgeName: 'Judge Saturday',
      ringLabel: 'Ring 1',
      startTime: '08:00',
      timeLimitSeconds: 120,
    },
  ],
  entries: [
    entry({
      id: 'entry-master',
      armband: 202,
      classId: 'class-master',
      trialId: 'trial-sunday',
      runOrder: 2,
    }),
    entry({
      id: 'entry-novice-no-order',
      armband: 102,
      callName: 'Paper',
      classId: 'class-novice',
      trialId: 'trial-saturday',
      runOrder: null,
    }),
    entry({
      id: 'entry-novice-first',
      armband: 101,
      callName: 'Pencil',
      classId: 'class-novice',
      trialId: 'trial-saturday',
      runOrder: 1,
    }),
  ],
};

describe('emergency trial packet model', () => {
  it('sorts trial days, classes, and run order deterministically while including every entry', () => {
    const model = buildEmergencyPacketModel(input);

    expect(model.trials.map(trial => trial.id)).toEqual(['trial-saturday', 'trial-sunday']);
    expect(
      model.pages
        .filter(page => page.kind === 'check-in')
        .flatMap(page => page.entries.map(item => item.id))
    ).toEqual(['entry-novice-first', 'entry-novice-no-order', 'entry-master']);
    expect(
      model.pages
        .filter(page => page.kind === 'score-recording')
        .flatMap(page => page.entries.map(item => item.id))
    ).toEqual(['entry-novice-first', 'entry-novice-no-order', 'entry-master']);
  });

  it('keeps unknown show-day values writable instead of claiming live state', () => {
    const model = buildEmergencyPacketModel(input);
    const noOrder = model.pages
      .flatMap(page => page.entries)
      .find(item => item.id === 'entry-novice-no-order');

    expect(noOrder).toMatchObject({ checkInMark: '', runOrderDisplay: '', resultMark: '' });
  });

  it('gives every page a visible snapshot and reconstruction label', () => {
    const model = buildEmergencyPacketModel(input);

    expect(model.pages.every(page => page.marker === 'SNAPSHOT — NOT LIVE')).toBe(true);
    expect(model.pages.every(page => page.generatedAt === input.generatedAt)).toBe(true);
    expect(
      model.pages
        .filter(page => page.kind === 'check-in' || page.kind === 'score-recording')
        .every(page =>
          formatEmergencyPacketPageLabel(page).includes(
            `${page.context.trialDate} · ${page.context.ringLabel} · ${page.context.classLabel}`
          )
        )
    ).toBe(true);
  });

  it('requires real trial, class, and entry data', () => {
    expect(emergencyPacketAvailability({ ...input, trials: [] })).toEqual({
      available: false,
      reason: 'Add a trial before preparing the emergency packet.',
    });
    expect(emergencyPacketAvailability({ ...input, classes: [] }).available).toBe(false);
    expect(emergencyPacketAvailability({ ...input, entries: [] }).available).toBe(false);
    expect(emergencyPacketAvailability(input)).toEqual({ available: true });
  });

  it('builds stable human filenames and immutable show-prefixed paths', () => {
    expect(buildEmergencyPacketFilename(input.show.name, input.generatedAt)).toBe(
      'old-school-scent-work-trial-emergency-packet-2026-08-20T20-15-00Z.pdf'
    );
    expect(buildEmergencyPacketStoragePath('show-1', 'snapshot-123')).toBe(
      'show-1/snapshot-123.pdf'
    );
  });
});
