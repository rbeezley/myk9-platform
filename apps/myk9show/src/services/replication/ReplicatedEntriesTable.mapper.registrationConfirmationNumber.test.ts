/**
 * MYK9-659: the view-row -> `ReplicatedEntry` hop, which is the one link in the
 * offline receipt's chain that nothing else covers.
 *
 * Every other test on this change starts from a `ReplicatedEntry` fixture that
 * already HAS `registrationConfirmationNumber` set, so a typo in the
 * `optionalColumn(row, 'registration_confirmation_number')` string literal would
 * leave them all green, typecheck green (the argument is a bare `string`, and
 * the generated row type does not know the column), and the offline receipt
 * blank forever — the exact failure this change exists to fix.
 */
import { describe, expect, it } from 'vitest';

import { rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';

/** The smallest row `rowToEntry` accepts; only the id is load-bearing here. */
const minimalRow = { id: 'entry-1' } as unknown as EntryRow;

describe('rowToEntry — registration_confirmation_number', () => {
  it('reads the order reference off the view row, under the column name the view projects', () => {
    const entry = rowToEntry({
      ...minimalRow,
      registration_confirmation_number: 'MK9-000146',
    } as unknown as EntryRow);

    expect(entry.registrationConfirmationNumber).toBe('MK9-000146');
    // The snake alias is this interface's convention for every replicated
    // column, and both keys come from the SAME read — they can never disagree.
    expect(entry.registration_confirmation_number).toBe('MK9-000146');
  });

  it('yields undefined when the column is absent, so a pre-push replica row still maps', () => {
    // Migration 20260918193700 is what puts the column on the views. Until it
    // is pushed the key simply is not there, and the receipt must print no
    // reference at all rather than a raw enrollment UUID (MYK9-631).
    const entry = rowToEntry(minimalRow);

    expect(entry.registrationConfirmationNumber).toBeUndefined();
    expect(entry.registration_confirmation_number).toBeUndefined();
  });

  it('ignores a non-string value rather than passing it on as a reference', () => {
    const entry = rowToEntry({
      ...minimalRow,
      registration_confirmation_number: null,
    } as unknown as EntryRow);

    expect(entry.registrationConfirmationNumber).toBeUndefined();
  });
});
