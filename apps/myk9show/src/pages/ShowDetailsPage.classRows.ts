import { formatClock } from '@/features/show-map/cockpit/cockpitClock';
import {
  countEntryAccounting,
  type EntryAccountingFields,
} from '@/features/_shared/entryAccounting';

/** The slice of an entry row the class table's Entries count reads. */
export interface ClassEntryRow {
  class_id?: unknown;
  entry_status?: unknown;
  check_in_status?: unknown;
  is_scored?: unknown;
  result_status?: unknown;
  deleted_at?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function accountingFields(entry: ClassEntryRow): EntryAccountingFields {
  return {
    deleted_at: str(entry.deleted_at) ?? null,
    entry_status: str(entry.entry_status),
    check_in_status: str(entry.check_in_status),
    is_scored: entry.is_scored === true,
    result_status: str(entry.result_status),
  };
}

/**
 * Entries each class is still expected to run (MYK9-986), by class id.
 *
 * The Classes table used to count raw rows, so withdrawn and scratched dogs
 * inflated it (3 for a class the show home read as "0 entered · 1 pending").
 * This is the same rule the Ringside class list and run queue use.
 */
export function countExpectedEntriesByClass(
  entries: readonly ClassEntryRow[]
): Map<string, number> {
  const byClass = new Map<string, EntryAccountingFields[]>();
  for (const entry of entries) {
    const classId = str(entry.class_id);
    if (!classId) continue;
    const rows = byClass.get(classId) ?? [];
    rows.push(accountingFields(entry));
    byClass.set(classId, rows);
  }
  return new Map(
    [...byClass].map(([classId, rows]) => [classId, countEntryAccounting(rows).expected])
  );
}

/**
 * The time the Classes table shows: the planned start, else the revised
 * expected start (a timestamptz, rendered in the trial's zone), else ''.
 */
export function classTimeLabel(
  cls: { startTime?: string | null | undefined; revisedExpectedStart?: string | null | undefined },
  timeZone: string
): string {
  return (
    formatClock(cls.startTime, timeZone) ?? formatClock(cls.revisedExpectedStart, timeZone) ?? ''
  );
}
