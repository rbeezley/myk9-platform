/**
 * MYK9-1945 close/reopen record on `shows`: replica field -> column. Both columns are
 * nullable and null is meaningful (reopen clears the close record), so a field is written only
 * when it is defined; `undefined` means "leave the server's value". The free-text close notes
 * (open lines, reopen reason) live in the staff-only `show_close_notes` table, not here.
 */
export const SHOW_CLOSE_RECORD_FIELD_COLUMNS = [
  ['closedAt', 'closed_at'],
  ['reopenedAt', 'reopened_at'],
] as const;

export interface ShowCloseRecord {
  /** shows.closed_at: when the close step completed the show. */
  closedAt?: string | null | undefined;
  /** shows.reopened_at: when the show was last reopened. */
  reopenedAt?: string | null | undefined;
}

type ShowCloseRecordField = (typeof SHOW_CLOSE_RECORD_FIELD_COLUMNS)[number][0];

/** The close-record columns a write actually sets (undefined fields are omitted). */
export function showCloseRecordColumns(show: ShowCloseRecord): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  for (const [field, column] of SHOW_CLOSE_RECORD_FIELD_COLUMNS) {
    if (show[field] !== undefined) columns[column] = show[field];
  }
  return columns;
}

/** Replica fields from a `shows` row (the columns are absent until the migration is applied). */
export function showCloseRecordFromRow(row: object): ShowCloseRecord {
  const columns = row as Record<string, unknown>;
  return {
    closedAt: (columns.closed_at as string | null | undefined) ?? null,
    reopenedAt: (columns.reopened_at as string | null | undefined) ?? null,
  };
}

/**
 * An unrelated edit must not carry this device's cached close record over one written
 * elsewhere: drop every close-record column whose field the caller did not include.
 */
export function stripUnsetCloseRecordColumns(
  payload: Record<string, unknown>,
  updates: Partial<Record<ShowCloseRecordField, unknown>>
): void {
  for (const [field, column] of SHOW_CLOSE_RECORD_FIELD_COLUMNS) {
    if (!(field in updates)) delete payload[column];
  }
}
