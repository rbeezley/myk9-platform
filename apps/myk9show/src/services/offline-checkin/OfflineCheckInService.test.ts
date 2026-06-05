import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { CheckInEntry } from '@/types/offline-checkin-types';

const mockSyncAddToQueue = vi.hoisted(() => vi.fn());
const mockUpdateReplicatedCheckInStatus = vi.hoisted(() => vi.fn());

vi.mock('../sync/syncService', () => ({
  syncService: {
    addToQueue: (...args: unknown[]) => mockSyncAddToQueue(...args),
  },
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (...args: unknown[]) =>
    mockUpdateReplicatedCheckInStatus(...args),
}));

import { OfflineCheckInService } from './OfflineCheckInService';

function makeEntry(): Omit<CheckInEntry, 'id' | 'createdAt' | 'updatedAt' | '_sync'> {
  return {
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
  };
}

describe('OfflineCheckInService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSyncAddToQueue.mockResolvedValue(undefined);
    mockUpdateReplicatedCheckInStatus.mockResolvedValue('mutation-1');
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('syncs online check-in status through the replicated entry writer', async () => {
    const service = new OfflineCheckInService({ syncInterval: 0, enableTimeSync: false });
    const entry = await service.addEntry(makeEntry());

    await service.checkInEntry(entry.id, 'checked-in', 'steward-1', {
      method: 'manual_entry',
      gateId: 'gate-1',
    });

    await waitFor(() =>
      expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith(entry.id, 'checked-in')
    );
    expect(mockSyncAddToQueue).not.toHaveBeenCalled();
  });
});
