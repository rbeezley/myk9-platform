import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { ReportDbEntry } from '@/lib/reports/types';

const COMPLETE_TRIAL_FIELDS = ['id', 'date', 'name', 'trial_number', 'registry_id'] as const;
const COMPLETE_CLASS_FIELDS = [
  'id',
  'trial_id',
  'name',
  'element',
  'level',
  'section',
  'display_order',
  'start_time',
  'time_limit_seconds',
  'time_limit_area2_seconds',
  'time_limit_area3_seconds',
  'num_areas',
] as const;
const COMPLETE_ENTRY_FIELDS = [
  'id',
  'class_id',
  'dog_id',
  'armband',
  'run_order',
  'check_in_status',
  'is_scored',
  'result_status',
  'search_time_seconds',
  'total_faults',
  'final_placement',
  'entry_status',
  'entry_fee',
  'payment_status',
  'payment_method',
  'entry_source',
  'dog',
] as const;

function hasCompleteRows<T>(rows: unknown, fields: readonly string[]): rows is T[] {
  return (
    Array.isArray(rows) &&
    rows.every(
      row =>
        row !== null &&
        typeof row === 'object' &&
        fields.every(field => Object.prototype.hasOwnProperty.call(row, field))
    )
  );
}

/** The rows a packet can be built from, or null while any of them is a partial replicated read. */
export function completePacketRows(input: {
  trials: unknown;
  classes: unknown;
  entries: unknown;
}): { trials: DbTrial[]; classes: DbClass[]; entries: ReportDbEntry[] } | null {
  if (!hasCompleteRows<DbTrial>(input.trials, COMPLETE_TRIAL_FIELDS)) return null;
  if (!hasCompleteRows<DbClass>(input.classes, COMPLETE_CLASS_FIELDS)) return null;
  if (!hasCompleteRows<DbEntry>(input.entries, COMPLETE_ENTRY_FIELDS)) return null;
  return {
    trials: input.trials,
    classes: input.classes,
    entries: input.entries as ReportDbEntry[],
  };
}
