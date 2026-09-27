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
