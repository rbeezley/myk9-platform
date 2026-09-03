import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { showDateRangeStatus, toLocalDate } from '@/utils/date-format';
import type { Show } from '@/types/show-types';
import { useCurrentDateKey } from '@/features/_shared/hooks/useCurrentDateKey';

export type ShowPhase = 'today' | 'upcoming' | 'draft' | 'past';

export interface AttentionItem {
  showId: string;
  showName?: string;
  kind: 'urgent' | 'info';
  text: string;
  /** Route to navigate to when clicked */
  href: string;
}

export interface MyShowsBuckets {
  today: Show[];
  upcoming: Show[];
  draft: Show[];
  past: Show[];
  attentionNeeded: AttentionItem[];
}

function toPhase(show: Show, now: Date): ShowPhase {
  if (show.status === 'draft') return 'draft';
  // Terminal statuses win over the date range: a show a secretary has marked
  // completed or cancelled is over even if its dates still cover today, and
  // must not sit in the live list or be auto-opened by the ringside chooser
  // for the rest of its run.
  if (show.status === 'completed' || show.status === 'cancelled') return 'past';
  // A multi-day show is live for its whole start→end run, not just its first
  // day. Classifying on startDate alone dropped it into 'past' on day two,
  // removing it from the secretary's live list and the ringside chooser
  // mid-show (MYK9-306).
  // `endDate` falls back to `startDate` so a show missing one keeps its
  // single-day semantics rather than being read as never-ending.
  const dateStatus = showDateRangeStatus(show.startDate, show.endDate || show.startDate, now);
  if (dateStatus === 'active') return 'today';
  if (dateStatus === 'past') return 'past';
  // 'published' (entries open) or 'upcoming' (entries closed) — both go in upcoming
  return 'upcoming';
}

function buildAttentionItems(
  shows: Show[],
  phases: Map<string, ShowPhase>,
  now: Date
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const show of shows) {
    const phase = phases.get(show.id);
    const setupHref = `/shows/${show.id}/setup`;
    const showDeskHref = `/shows/${show.id}/show-desk`;

    if (show.status === 'draft') {
      items.push({
        showId: show.id,
        showName: show.name,
        kind: 'info',
        text: 'Draft — complete setup before publishing',
        href: setupHref,
      });
      continue;
    }

    if (phase === 'today') {
      items.push({
        showId: show.id,
        showName: show.name,
        kind: 'urgent',
        text: 'Happening today — check-in is open',
        href: showDeskHref,
      });
      continue;
    }

    if (phase === 'upcoming' && show.entryCloseDate) {
      const daysToClose = differenceInDays(toLocalDate(show.entryCloseDate), now);
      if (daysToClose >= 0 && daysToClose <= 14) {
        items.push({
          showId: show.id,
          showName: show.name,
          kind: daysToClose <= 7 ? 'urgent' : 'info',
          text: `Entries close in ${daysToClose} day${daysToClose === 1 ? '' : 's'}`,
          href: setupHref,
        });
      }
    }
  }

  return items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'urgent' ? -1 : 1));
}

export function useMyShows(shows: Show[]): MyShowsBuckets {
  const currentDateKey = useCurrentDateKey();
  return useMemo(() => {
    const now = toLocalDate(currentDateKey);
    now.setHours(12, 0, 0, 0);
    const phases = new Map(shows.map(s => [s.id, toPhase(s, now)]));

    const today: Show[] = [];
    const upcoming: Show[] = [];
    const draft: Show[] = [];
    const past: Show[] = [];

    for (const show of shows) {
      switch (phases.get(show.id)) {
        case 'today':
          today.push(show);
          break;
        case 'upcoming':
          upcoming.push(show);
          break;
        case 'draft':
          draft.push(show);
          break;
        case 'past':
          past.push(show);
          break;
      }
    }

    upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
    draft.sort((a, b) => a.startDate.localeCompare(b.startDate));
    past.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return {
      today,
      upcoming,
      draft,
      past,
      attentionNeeded: buildAttentionItems(shows, phases, now),
    };
  }, [shows, currentDateKey]);
}
