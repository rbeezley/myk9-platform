/**
 * MYK9-1162: `awaiting_registration_number` on the replica path, view row ->
 * replica -> ringside entry, and never back up to the server. The server
 * computes it, so a ringside device that cannot read dog_registrations still
 * knows. Absent (a row cached before the migration) reads as not held.
 */
import { describe, expect, it } from 'vitest';

import { entryToSupabaseRow, rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';
import { transformEntry } from '@/features/at-show/atShowDataAdapter';

const minimalRow = { id: 'entry-1' } as unknown as EntryRow;
const withFlag = (value: unknown) =>
  ({ ...minimalRow, awaiting_registration_number: value }) as unknown as EntryRow;

describe('awaiting_registration_number on the replica path', () => {
  it('reads the flag under both casings', () => {
    const entry = rowToEntry(withFlag(true));
    expect(entry.awaitingRegistrationNumber).toBe(true);
    expect(entry.awaiting_registration_number).toBe(true);
    expect(rowToEntry(withFlag(false)).awaitingRegistrationNumber).toBe(false);
  });

  it('is undefined when the view lacks the column or carries a non-boolean', () => {
    expect(rowToEntry(minimalRow).awaitingRegistrationNumber).toBeUndefined();
    expect(rowToEntry(withFlag(null)).awaitingRegistrationNumber).toBeUndefined();
  });

  it('is never written back to entries on a whole-row upload', () => {
    const upload = entryToSupabaseRow(rowToEntry(withFlag(true)));
    expect(upload).not.toHaveProperty('awaiting_registration_number');
    expect(upload).not.toHaveProperty('awaitingRegistrationNumber');
  });

  it('reaches the ringside entry the entry list renders from', () => {
    expect(transformEntry(rowToEntry(withFlag(true)), null).awaitingRegistrationNumber).toBe(true);
  });

  it('leaves the ringside entry unflagged when false or unknown', () => {
    expect(transformEntry(rowToEntry(withFlag(false)), null)).not.toHaveProperty(
      'awaitingRegistrationNumber'
    );
    expect(transformEntry(rowToEntry(minimalRow), null)).not.toHaveProperty(
      'awaitingRegistrationNumber'
    );
  });
});
