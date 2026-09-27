import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildSelectedEntriesExportCsv,
  buildSelectedEntryExportRow,
  SELECTED_ENTRIES_EXPORT_HEADERS,
} from '../entrySelectionExport';

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '#12',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Fido',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [
      { id: 'class-1', name: 'Novice A', number: '101', fee: 25, status: 'entered' },
      { id: 'class-2', name: 'Open B', number: '102', fee: 25, status: 'entered' },
    ],
    totalFee: 50,
    paidAmount: 50,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    armbandNumber: '12',
    confirmationNumber: 'CONF-1',
    ...overrides,
  };
}

describe('buildSelectedEntryExportRow', () => {
  it('maps the fields already on the client entry type, joining multiple classes', () => {
    expect(buildSelectedEntryExportRow(makeEntry())).toEqual([
      '12',
      'Fido',
      'Jane Smith',
      'jane@example.com',
      'Jane Smith',
      EntryStatus.ACCEPTED,
      PaymentStatus.PAID_ONLINE,
      '50',
      '50',
      'CONF-1',
      'Novice A; Open B',
    ]);
  });

  it('falls back from armband to entry number when no armband is assigned yet', () => {
    const row = buildSelectedEntryExportRow(makeEntry({ armbandNumber: undefined }));
    expect(row[0]).toBe('#12');
  });
});

describe('buildSelectedEntriesExportCsv', () => {
  it('leads with the header row and escapes a formula-looking dog name', () => {
    const csv = buildSelectedEntriesExportCsv([makeEntry({ dogName: '=SUM(A1:A2)' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(SELECTED_ENTRIES_EXPORT_HEADERS.join(','));
    expect(lines[1]).toContain('"\t=SUM(A1:A2)"');
  });
});
