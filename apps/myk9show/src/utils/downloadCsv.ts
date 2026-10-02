import { buildCsvContent } from './csvEscape';

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

/** The dated file name every list Export uses: `dogs-export-2026-10-02.csv`. */
export function exportFilename(noun: string): string {
  return `${noun}-export-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Downloads rows as a CSV through the one guarded builder (`csvEscape.ts`: every cell quoted, a
 * leading `=` `+` `-` `@` neutralised), under a dated name. Every list's Export goes through here.
 */
export function exportRowsCsv(
  noun: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>
): void {
  downloadCsv(exportFilename(noun), buildCsvContent(headers, rows));
}
