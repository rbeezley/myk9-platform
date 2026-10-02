/**
 * Triggers a browser download of CSV text — the same Blob + anchor-click
 * mechanism `useEntryManagementActions.handleExportCSV` uses, factored out so
 * the new "Export selected" bulk action (MYK9-795) doesn't duplicate it.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text from rows (the first is the header). Quotes what needs it; null and undefined read blank. */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

/** The dated file name every bulk-bar Export uses: `dogs-export-2026-10-02.csv`. */
export function exportFilename(noun: string): string {
  return `${noun}-export-${new Date().toISOString().slice(0, 10)}.csv`;
}
