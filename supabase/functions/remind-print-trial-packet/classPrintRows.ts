import type { PaperworkClassRow, PaperworkEntryRow } from '../_shared/paperwork/rowDescriptors.ts';

/**
 * The class and entry rows the print fingerprints are rebuilt from, shaped EXACTLY as the app
 * hands them to `buildReportPaperworkDescriptor` (MYK9-2086 part B). The fingerprint hashes the
 * text of every fact, so `null`, `undefined` and `'no-status'` are three different prints.
 *
 * The app's rows come from the replica: `rowToClass` then `mapReplicatedClassToDbRow` for a
 * class, `rowToEntry` then `mapReplicatedEntryToDbRow` for an entry. Their rules, copied here and
 * pinned against the real mappers by `classPrintRows.parity.test.ts` in the app's tests:
 * - a class column the replica lacks reads `null` (`mapFields`), never `undefined`;
 * - `judge_name` and `num_hides` are NOT on the app's class row at all (the column was dropped
 *   and the hide count is an official-only RPC the row mapper never writes), so both hash as
 *   `undefined`. They are deliberately not read here: reading the real values would make every
 *   print the app wrote look stale. The app's `judgeName` and `hides` facts therefore never
 *   change; that is the app's current behaviour, not a choice made here;
 * - an entry with no check-in status reads `'no-status'`, other missing columns `null`.
 */
export const CLASS_FINGERPRINT_COLUMNS =
  'id, trial_id, element, level, section, status, time_limit_seconds, num_areas';
export const ENTRY_FINGERPRINT_COLUMNS =
  'id, class_id, dog_id, armband, run_order, check_in_status, entry_status';

type Raw = Record<string, unknown>;

const orNull = (value: unknown) => value ?? null;

export function toFingerprintClassRow(row: Raw): PaperworkClassRow {
  return {
    id: String(row.id),
    trial_id: orNull(row.trial_id) as string | null,
    element: orNull(row.element),
    level: orNull(row.level),
    section: orNull(row.section) as string | null,
    status: orNull(row.status),
    time_limit_seconds: orNull(row.time_limit_seconds),
    num_areas: orNull(row.num_areas),
  };
}

export function toFingerprintEntryRow(row: Raw): PaperworkEntryRow {
  return {
    id: String(row.id),
    class_id: orNull(row.class_id) as string | null,
    dog_id: orNull(row.dog_id) as string | null,
    armband: orNull(row.armband) as string | number | null,
    run_order: orNull(row.run_order) as number | null,
    check_in_status: (row.check_in_status ?? 'no-status') as string,
    entry_status: orNull(row.entry_status) as string | null,
  };
}
