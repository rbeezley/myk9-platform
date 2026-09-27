/**
 * CSV export for the "Export selected" bulk action (MYK9-795).
 *
 * Unlike the page's "Export Full CSV" (`useEntryManagementActions.handleExportCSV`,
 * `@/utils/entryExportUtils`), this builds its rows entirely from the
 * already-loaded `EntryManagementEntry[]` client type — no `getEntriesForExport`
 * round trip. That keeps a bulk action usable offline (CLAUDE.md "Offline-first
 * data"), at the cost of a narrower column set: `EntryManagementEntry` has no
 * split owner first/last name, phone, breed, call name, per-registration
 * numbers, or special-requests text, all of which only the server export query
 * resolves. Extending the client type to carry them is tracked as a follow-up
 * rather than done here, since it would mean a new field on every entries read
 * on this show-day-critical page for a bulk-export-only benefit.
 */
import { buildCsvContent } from '@/utils/csvEscape';
import type { EntryManagementEntry } from '@/types/entry-management-types';

export const SELECTED_ENTRIES_EXPORT_HEADERS = [
  'Armband',
  'Dog Name',
  'Owner Name',
  'Owner Email',
  'Handler',
  'Entry Status',
  'Payment Status',
  'Total Fee',
  'Paid Amount',
  'Confirmation #',
  'Classes',
] as const;

export function buildSelectedEntryExportRow(entry: EntryManagementEntry): string[] {
  return [
    entry.armbandNumber || entry.entryNumber || '',
    entry.dogName || '',
    entry.ownerName || '',
    entry.ownerEmail || '',
    entry.handlerName || '',
    entry.entryStatus || '',
    entry.paymentStatus || '',
    Number.isFinite(entry.totalFee) ? String(entry.totalFee) : '0',
    Number.isFinite(entry.paidAmount) ? String(entry.paidAmount) : '0',
    entry.confirmationNumber || '',
    entry.classes.map(entryClass => entryClass.name).join('; '),
  ];
}

export function buildSelectedEntriesExportCsv(entries: readonly EntryManagementEntry[]): string {
  return buildCsvContent(SELECTED_ENTRIES_EXPORT_HEADERS, entries.map(buildSelectedEntryExportRow));
}

export function selectedEntriesExportFilename(now: Date = new Date()): string {
  return `selected-entries_${now.toISOString().split('T')[0]}.csv`;
}
