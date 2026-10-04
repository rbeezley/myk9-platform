/**
 * MYK9-969: `results_private` on the replica path — view row -> replica ->
 * read row — and never back up to the server.
 *
 * The server already NULLed the result columns of a row whose people keep their
 * results private; this flag is only how an offline screen says "Results
 * private" instead of "Not Set". It is a view column, not an `entries` column,
 * so a whole-row upload that carried it would fail the write.
 */
import { describe, expect, it } from 'vitest';

import { entryToSupabaseRow, rowToEntry, type EntryRow } from './ReplicatedEntriesTable.mapper';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';

const minimalRow = { id: 'entry-1' } as unknown as EntryRow;

describe('results_private on the replica path', () => {
  it('reads the flag off the view row under both casings', () => {
    const entry = rowToEntry({ ...minimalRow, results_private: true } as unknown as EntryRow);
    expect(entry.resultsPrivate).toBe(true);
    expect(entry.results_private).toBe(true);
  });

  it('is undefined when the view does not have the column yet (pre-push)', () => {
    const entry = rowToEntry(minimalRow);
    expect(entry.resultsPrivate).toBeUndefined();
  });

  it('reaches the read row the class table renders from', () => {
    const entry = rowToEntry({ ...minimalRow, results_private: true } as unknown as EntryRow);
    expect(mapReplicatedEntryToDbRow(entry).results_private).toBe(true);
  });

  it('is never written back to entries on a whole-row upload', () => {
    const entry = rowToEntry({ ...minimalRow, results_private: true } as unknown as EntryRow);
    const upload = entryToSupabaseRow(entry);
    expect(upload).not.toHaveProperty('results_private');
    expect(upload).not.toHaveProperty('resultsPrivate');
  });
});
