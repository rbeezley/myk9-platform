import { describe, expect, it } from 'vitest';
import { buildDeliveredPacketRows } from './deliveredPacketRows';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';

const packetData: Omit<EmergencyPacketInput, 'generatedAt'> = {
  show: { id: 'show-1', name: 'Heartland', startDate: '2026-10-03', endDate: '2026-10-04' },
  trials: [
    { id: 't1', date: '2026-10-03', name: 'Sat', trialNumber: '1', registryId: 'AKC' },
    { id: 't2', date: '2026-10-04', name: 'Sun', trialNumber: '2', registryId: 'AKC' },
  ],
  classes: [
    {
      id: 'c1',
      trialId: 't1',
      name: 'Interior',
      element: 'Interior',
      level: 'Novice',
      section: null,
      classNumber: null,
      displayOrder: 0,
      judgeName: 'J',
      ringLabel: null,
      startTime: null,
      timeLimitSeconds: 180,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: 1,
      numHides: null,
      distractionCount: null,
    },
    {
      id: 'c2',
      trialId: 't2',
      name: 'Interior',
      element: 'Interior',
      level: 'Novice',
      section: null,
      classNumber: null,
      displayOrder: 0,
      judgeName: 'J',
      ringLabel: null,
      startTime: null,
      timeLimitSeconds: 180,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: 1,
      numHides: null,
      distractionCount: null,
    },
  ],
  entries: [
    {
      id: 'e1',
      armband: '1',
      runOrder: 1,
      callName: 'A',
      breed: 'BC',
      handler: 'H',
      registrationNumber: null,
      section: null,
      classId: 'c1',
      trialId: 't1',
    },
    {
      id: 'e2',
      armband: '2',
      runOrder: 1,
      callName: 'B',
      breed: 'BC',
      handler: 'H',
      registrationNumber: null,
      section: null,
      classId: 'c2',
      trialId: 't2',
    },
  ],
};

const snapshot = (
  trialDate: string | null,
  snapshotId: string,
  generatedAt: string,
  createdAt = generatedAt
) => ({ snapshotId, trialDate, generatedAt, createdAt, pageCount: 12 });

describe('buildDeliveredPacketRows', () => {
  it('offers a print action for a packet this session did not generate', () => {
    // The whole point: cron made it overnight, so `preparedPackets` is empty
    // and the old panel showed no button at all.
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot('2026-10-04', 'snap-sun', '2026-10-03T22:00:00Z')],
      confirmations: [],
      packetData,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].printState).toBe('unconfirmed');
    expect(rows[0].descriptor?.reportId).toBe('emergency-trial-packet');
    expect(rows[0].descriptor?.coverage.snapshotId).toBe('snap-sun');
    expect(rows[0].descriptor?.coverage.trialDate).toBe('2026-10-04');
  });

  it('decides "newest" on the server clock, not the browser one', () => {
    // `generated_at` is minted by the browser on the manual path. A laptop a
    // few minutes slow makes the LATER packet look older; the server orders by
    // created_at, and if the two disagree the confirmation names one snapshot
    // while the reminder checks another, so the chase never stops.
    const rows = buildDeliveredPacketRows({
      snapshots: [
        snapshot('2026-10-04', 'cron', '2026-10-03T22:00:00Z', '2026-10-03T22:00:00Z'),
        snapshot('2026-10-04', 'manual-slow-clock', '2026-10-03T21:50:00Z', '2026-10-03T22:05:00Z'),
      ],
      confirmations: [],
      packetData,
    });
    expect(rows.map(r => r.snapshotId)).toEqual(['manual-slow-clock']);
  });

  it('keeps only the newest packet per day', () => {
    const rows = buildDeliveredPacketRows({
      snapshots: [
        snapshot('2026-10-04', 'old', '2026-10-02T22:00:00Z'),
        snapshot('2026-10-04', 'new', '2026-10-03T22:00:00Z'),
      ],
      confirmations: [],
      packetData,
    });
    expect(rows.map(r => r.snapshotId)).toEqual(['new']);
  });

  it('separates "printed" from "printed, then superseded"', () => {
    // Telling someone who printed Thursday's copy that it is simply
    // unconfirmed invites a second identical stack; the distinction is what
    // makes the reprint legible.
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot('2026-10-04', 'snap-friday', '2026-10-03T22:00:00Z')],
      confirmations: [
        {
          reportId: 'emergency-trial-packet',
          coverage: { trialDate: '2026-10-04', snapshotId: 'snap-thursday' },
        },
      ],
      packetData,
    });
    expect(rows[0].printState).toBe('superseded');
  });

  it('goes quiet once the current packet is confirmed', () => {
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot('2026-10-04', 'snap-friday', '2026-10-03T22:00:00Z')],
      confirmations: [
        {
          reportId: 'emergency-trial-packet',
          coverage: { trialDate: '2026-10-04', snapshotId: 'snap-friday' },
        },
      ],
      packetData,
    });
    expect(rows[0].printState).toBe('printed');
  });

  it('ignores a voided confirmation and another report entirely', () => {
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot('2026-10-04', 'snap-1', '2026-10-03T22:00:00Z')],
      confirmations: [
        {
          reportId: 'emergency-trial-packet',
          coverage: { trialDate: '2026-10-04', snapshotId: 'snap-1' },
          voidedAt: '2026-10-03T23:00:00Z',
        },
        { reportId: 'check-in-sheet', coverage: { trialDate: '2026-10-04', snapshotId: 'snap-1' } },
      ],
      packetData,
    });
    expect(rows[0].printState).toBe('unconfirmed');
  });

  it('drops whole-show packets, which no reminder can address', () => {
    // Written before the per-day split; `trial_date` is null, so there is no
    // day for a confirmation or a chase to key on.
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot(null, 'legacy', '2026-09-01T22:00:00Z')],
      confirmations: [],
      packetData,
    });
    expect(rows).toEqual([]);
  });

  it('offers no button when the day has no live report data to fingerprint', () => {
    const rows = buildDeliveredPacketRows({
      snapshots: [snapshot('2026-12-25', 'snap-x', '2026-12-24T22:00:00Z')],
      confirmations: [],
      packetData,
    });
    expect(rows[0].descriptor).toBeNull();
    expect(rows[0].printState).toBe('unconfirmed');
  });
});
