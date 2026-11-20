import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { dropExportColumns, exportRowsCsv } from '@/utils/downloadCsv';
import { formatShowsTableDateRange } from './ShowsTableView.helpers';

/** The Shows table's CSV columns: the ones it shows, plus Organization and Status. */
export const SHOWS_EXPORT_HEADERS = [
  'Show',
  'Dates',
  'Location',
  'Entries',
  'Organization',
  'Status',
  'Host Club',
] as const;

export function showsExportRows(
  shows: readonly EnhancedShow[],
  pausedShowIds: ReadonlySet<string> = new Set()
): string[][] {
  return shows.map(show => [
    show.name || '',
    show.startDate ? formatShowsTableDateRange(show.startDate, show.endDate) : '',
    show.location || '',
    getEntryStatus(show, show.userHasEntries, {
      cardEntriesPaused: pausedShowIds.has(show.id),
    }).label,
    show.organization || '',
    show.status || '',
    show.clubName || '',
  ]);
}

/** The whole list as a CSV download, every column. */
export function exportShowsCsv(
  shows: readonly EnhancedShow[],
  pausedShowIds: ReadonlySet<string>
): void {
  exportRowsCsv('shows', SHOWS_EXPORT_HEADERS, showsExportRows(shows, pausedShowIds));
}

/** A signed-out visitor's CSV: the same list minus the columns the public table does not show (MYK9-933). */
export function exportShowsAsGuestCsv(
  shows: readonly EnhancedShow[],
  pausedShowIds: ReadonlySet<string>
): void {
  const { headers, rows } = dropExportColumns(
    SHOWS_EXPORT_HEADERS,
    showsExportRows(shows, pausedShowIds),
    SHOWS_GUEST_EXPORT_OMIT
  );
  exportRowsCsv('shows', headers, rows);
}

/** Columns the public Shows table leaves off (Status is a secretary concern), so a guest's CSV does too. */
export const SHOWS_GUEST_EXPORT_OMIT = ['Status'] as const;
