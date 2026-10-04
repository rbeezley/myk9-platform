import type { EnhancedShow } from '@/hooks/useBrowseShowsData';
import { getEntryStatus } from '@/utils/entryStatusUtils';
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

export function showsExportRows(shows: readonly EnhancedShow[]): string[][] {
  return shows.map(show => [
    show.name || '',
    show.startDate ? formatShowsTableDateRange(show.startDate, show.endDate) : '',
    show.location || '',
    getEntryStatus(show, show.userHasEntries).label,
    show.organization || '',
    show.status || '',
    show.clubName || '',
  ]);
}

/** Columns the public Shows table leaves off (Status is a secretary concern), so a guest's CSV does too. */
export const SHOWS_GUEST_EXPORT_OMIT = ['Status'] as const;
