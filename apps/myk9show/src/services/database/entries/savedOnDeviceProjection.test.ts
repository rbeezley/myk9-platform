/**
 * MYK9-1930: "saved on this device only" must survive the warm projection into
 * `EntryManagementEntry`, or the late entry's card cannot say why it has no payment controls.
 * The replica marks a row created on this device and not uploaded yet with `_localOnly`; the
 * upload clears it (packages/replication mutation-row-sync.ts), and the server gives the entry
 * its form on that INSERT.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: vi.fn(),
  supabase: { from: vi.fn() },
}));

import { toSecretaryEntry } from './secretaryReadReplication';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';

const EMPTY_RELATIONS = {
  dogsMap: new Map(),
  classesMap: new Map(),
  armbandsByEntryId: new Map(),
  armbandsByDogId: new Map(),
  peopleMap: new Map(),
  enrollmentsMap: new Map(),
  trialsMap: new Map(),
  pullMetadataMap: new Map(),
} as unknown as Parameters<typeof toSecretaryEntry>[1];

const lateEntry = {
  id: 'late-1',
  dogId: 'dog-1',
  classId: 'class-1',
  showId: 'show-1',
  entryStatus: 'confirmed',
  entryFee: 35,
  paymentStatus: 'pending',
  paymentMethod: 'cash',
};

describe('saved on this device reaches Entry Management (MYK9-1930)', () => {
  it('marks a desk entry not uploaded yet', () => {
    const secretaryRow = toSecretaryEntry(
      { ...lateEntry, _localOnly: true } as never,
      EMPTY_RELATIONS
    );

    expect(secretaryRow.saved_on_device_only).toBe(true);
    expect(mapSecretaryEntryToEntryManagementEntry(secretaryRow, null).savedOnDeviceOnly).toBe(
      true
    );
  });

  it('leaves the mark off once the entry is on the server', () => {
    for (const row of [lateEntry, { ...lateEntry, _localOnly: false }]) {
      const secretaryRow = toSecretaryEntry(row as never, EMPTY_RELATIONS);
      expect(secretaryRow.saved_on_device_only).toBeUndefined();
      expect(
        mapSecretaryEntryToEntryManagementEntry(secretaryRow, null).savedOnDeviceOnly
      ).toBeUndefined();
    }
  });
});
