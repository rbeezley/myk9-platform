import { describe, expect, it } from 'vitest';
import { QRScannerService } from './QRScannerService';
import { validateQRChecksum } from './OfflineCheckInService.helpers';
import type { CheckInEntry } from '@/types/offline-checkin-types';

const ENTRY: CheckInEntry = {
  id: 'entry-1',
  showId: 'show-1',
  classId: 'class-1',
  trialId: 'trial-1',
  dogId: 'dog-1',
  handlerId: 'handler-1',
  armband: '101',
  runOrder: 1,
  entryNumber: '1',
  dogName: 'Fido',
  dogCallName: 'Fido',
  dogBreed: 'Beagle',
  handlerName: 'Jane Handler',
  className: 'Interior Novice',
  classNumber: '1',
  ringNumber: 1,
  judgeName: 'Judge A',
  checkInStatus: 'no-status',
  createdAt: new Date('2026-09-02T12:00:00Z'),
  updatedAt: new Date('2026-09-02T12:00:00Z'),
  _sync: {
    _version: 1,
    _lastModified: '2026-09-02T12:00:00Z',
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  },
};

describe('QRScannerService', () => {
  it('generates checksums over the serialized QR payload, excluding metadata', async () => {
    const service = new QRScannerService();
    const parsed = JSON.parse(await service.generateQRCodeData(ENTRY)) as Record<string, unknown>;

    expect(validateQRChecksum(parsed)).toBe(true);
  });
});
