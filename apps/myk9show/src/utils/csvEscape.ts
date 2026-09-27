/**
 * Shared CSV cell/row escaping, factored out of `useEntryManagementActions`'s
 * full-show export so the new "Export selected" bulk action (MYK9-795) gets
 * the same formula-injection guard and quote escaping instead of a second,
 * slightly different implementation.
 */

/** Guards against a spreadsheet reading a leading `=`/`+`/`-`/`@`/tab as a formula. */
function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? '').replace(/[\r\n]+/g, ' ');
  const safe = /^[=+\-@\t]/.test(raw) ? `\t${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function escapeCsvRow(row: ReadonlyArray<string | number | null | undefined>): string {
  return row.map(escapeCsvCell).join(',');
}

export function buildCsvContent(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>
): string {
  return [headers.join(','), ...rows.map(escapeCsvRow)].join('\n');
}
