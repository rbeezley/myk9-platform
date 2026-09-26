import { CalendarClock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getEntryStatus } from '@/utils/entryStatusUtils';
import { showDateRangeStatus } from '@/utils/date-format';
import type { Show } from '@/types/show-types';

interface EntryClosedNoticeProps {
  shows: Show[];
  selectedTab: string;
}

/**
 * Exhibitor discovery aid: when the general browse list has shows but none are
 * currently open for entry, say so plainly instead of leaving a novice clicking
 * into closed shows one by one. Scoped to the "all" tab so management and judge
 * tabs never surface it; renders nothing when the list is empty (the EmptyState
 * covers that) or when any show can still be entered.
 */
export function EntryClosedNotice({ shows, selectedTab }: EntryClosedNoticeProps) {
  if (selectedTab !== 'all' || shows.length === 0) return null;
  if (shows.some(show => getEntryStatus(show).canEnter)) return null;

  // MYK9-808: a past month tile intentionally keeps showing its shows (it
  // replaced the old Past Shows tab, MYK9-427), but every one of them already
  // happened, so "aren't accepting online entries yet... when its entry
  // window opens" is future-tense wording for a window that is never
  // reopening (2026-09-26 exhibitor walk, E52).
  const allPast = shows.every(
    show => showDateRangeStatus(show.startDate, show.endDate) === 'past'
  );

  return (
    <Alert className="mt-4">
      <CalendarClock className="h-4 w-4" />
      <AlertTitle>No shows are open for entries right now</AlertTitle>
      <AlertDescription>
        {allPast
          ? 'These shows have already taken place, so entries are closed. Open a show to see its results.'
          : 'These shows aren’t accepting online entries yet. Open any show to see its schedule and when its entry window opens.'}
      </AlertDescription>
    </Alert>
  );
}
