/**
 * MYK9-1031: one entry's results line (the unit `mark_class_results_verified` hashes), built from
 * the replica entry through `entryToSupabaseRow`, the exact row the upload writes. The legacy
 * snake_case aliases can be stale (a placement recalculation updates `finalPlacement` alone, and a
 * non-qualified result uploads no placement), so the line is never built from them directly.
 *
 * The secretary read carries this line on each row (`SecretaryEntry.results_line`), so the paper
 * check's fingerprint is hashed from the very rows that were on screen.
 */
import {
  entryResultsLine,
  type ClassResultsFingerprintEntry,
} from '@/features/show-map/classResultsFingerprint';
import { entryToSupabaseRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

export function replicatedEntryResultsLine(entry: ReplicatedEntry): string | null {
  const row = entryToSupabaseRow(entry) as Omit<ClassResultsFingerprintEntry, 'id'>;
  return entryResultsLine({ ...row, id: entry.id } as ClassResultsFingerprintEntry);
}
