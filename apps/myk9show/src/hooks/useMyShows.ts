import { useMemo } from 'react';
import { isToday, isBefore, differenceInDays } from 'date-fns';
import { toLocalDate } from '@/utils/date-format';
import type { Show } from '@/types/show-types';

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

function toPhase(show: Show): ShowPhase {
  const start = toLocalDate(show.startDate);
  if (isToday(start)) return 'today';
  if (show.status === 'draft') return 'draft';
  if (show.status === 'completed' || show.status === 'cancelled') return 'past';
  if (isBefore(start, new Date())) return 'past';
  // 'published' (entries open) or 'upcoming' (entries closed) — both go in upcoming
  return 'upcoming';
}

function buildAttentionItems(shows: Show[], phases: Map<string, ShowPhase>): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const show of shows) {
    const phase = phases.get(show.id);
    const href = `/shows/${show.id}`;

    if (phase === 'today') {
      items.push({
        showId: show.id,
        showName: show.name,
        kind: 'urgent',
        text: 'Happening today — check-in is open',
        href,
      });
      continue;
    }

    if (phase === 'draft') {
      items.push({
        showId: show.id,
        showName: show.name,
        kind: 'info',
        text: 'Draft — complete setup before publishing',
        href,
      });
      continue;
    }

    if (phase === 'upcoming' && show.entryCloseDate) {
      const daysToClose = differenceInDays(toLocalDate(show.entryCloseDate), new Date());
      if (daysToClose >= 0 && daysToClose <= 14) {
        items.push({
          showId: show.id,
          showName: show.name,
          kind: daysToClose <= 7 ? 'urgent' : 'info',
          text: `Entries close in ${daysToClose} day${daysToClose === 1 ? '' : 's'}`,
          href,
        });
      }
    }
  }

  return items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'urgent' ? -1 : 1));
}

export function useMyShows(shows: Show[]): MyShowsBuckets {
  return useMemo(() => {
    const phases = new Map(shows.map(s => [s.id, toPhase(s)]));

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
    past.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return { today, upcoming, draft, past, attentionNeeded: buildAttentionItems(shows, phases) };
  }, [shows]);
}
