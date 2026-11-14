/**
 * MYK9-1809: a row the entry lifecycle says will not run is flagged for the list, which then offers
 * no check-in control on it. `status` reads Pulled for these whatever the check-in column holds.
 */
import { describe, it, expect } from 'vitest';
import { transformEntry } from './atShowDataAdapter';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const row = (overrides: Partial<ReplicatedEntry>) =>
  transformEntry({ id: 'entry-1', ...overrides } as ReplicatedEntry, null);

describe('transformEntry notRunningByEntryStatus', () => {
  it.each(['scratched', 'withdrawn'])('flags a %s entry and shows it as Pulled', entryStatus => {
    const entry = row({ entry_status: entryStatus, check_in_status: 'checked-in' });
    expect(entry.notRunningByEntryStatus).toBe(true);
    expect(entry.status).toBe('pulled');
  });

  it('does not flag a dog pulled only through the check-in column', () => {
    const entry = row({ entry_status: 'confirmed', check_in_status: 'pulled' });
    expect(entry.status).toBe('pulled');
    expect(entry.notRunningByEntryStatus).toBeUndefined();
  });

  it('does not flag a running dog', () => {
    expect(
      row({ entry_status: 'confirmed', check_in_status: 'at-gate' }).notRunningByEntryStatus
    ).toBe(undefined);
  });
});

describe('transformEntry notRunningReason (MYK9-1940)', () => {
  it.each([
    ['moved', 'confirmed', 'moved'],
    ['absent', 'confirmed', 'absent'],
    ['withdrawn', 'confirmed', 'withdrawn'],
    ['scratched', 'confirmed', 'pulled'],
    ['confirmed', 'pulled', 'pulled'],
    ['moved', 'pulled', 'moved'],
    ['absent', 'pulled', 'absent'],
  ])('%s entry with check-in %s reads %s', (entryStatus, checkIn, reason) => {
    const entry = row({
      entry_status: entryStatus,
      check_in_status: checkIn as ReplicatedEntry['check_in_status'],
    });
    expect(entry.notRunningReason).toBe(reason);
  });

  it('gives a running dog no reason', () => {
    expect(row({ entry_status: 'confirmed', check_in_status: 'at-gate' }).notRunningReason).toBe(
      undefined
    );
  });
});
