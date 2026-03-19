import type { Show } from '@/types/show-types';
import type { EntryStatus } from '@/utils/entryStatusUtils';

export type ShowCardStatus =
  | 'upcoming'
  | 'accepting'
  | 'closing_soon'
  | 'in_progress'
  | 'completed'
  | 'closed';

export function getShowCardStatus(show: Show, entryStatus: EntryStatus): ShowCardStatus {
  const now = new Date();
  const startDate = new Date(show.startDate);
  const endDate = new Date(show.endDate);

  if (now > endDate) return 'completed';
  if (now >= startDate && now <= endDate) return 'in_progress';

  if (entryStatus === 'accepting') return 'accepting';
  if (entryStatus === 'closing_soon') return 'closing_soon';
  if (entryStatus === 'closed') return 'closed';

  return 'upcoming';
}

export function computeShowProgress(show: Show): { totalTrials: number; scoredTrials: number } {
  const totalTrials = show.trials?.length ?? 0;
  const scoredTrials =
    show.trials?.filter(t => t.status?.toLowerCase() === 'completed').length ?? 0;
  return { totalTrials, scoredTrials };
}

/** Count user entries for a specific show */
export function countUserEntries(
  showId: string,
  entries: Array<{ showId?: string; show_id?: string }>
): number {
  return entries.filter(e => e.showId === showId || e.show_id === showId).length;
}

/** Tailwind classes for DateCircle border and month text by status */
export const STATUS_STYLES: Record<
  ShowCardStatus,
  { border: string; monthText: string; badgeBg: string }
> = {
  upcoming: {
    border: 'border-border/15',
    monthText: 'text-muted-foreground',
    badgeBg: 'bg-muted',
  },
  accepting: {
    border: 'border-green-500',
    monthText: 'text-green-500',
    badgeBg: 'bg-green-500/15',
  },
  closing_soon: {
    border: 'border-orange-500',
    monthText: 'text-orange-500',
    badgeBg: 'bg-orange-500/15',
  },
  in_progress: {
    border: 'border-blue-500',
    monthText: 'text-blue-500',
    badgeBg: 'bg-blue-500/15',
  },
  completed: {
    border: 'border-green-500',
    monthText: 'text-green-500',
    badgeBg: 'bg-green-500/15',
  },
  closed: {
    border: 'border-border/15',
    monthText: 'text-muted-foreground',
    badgeBg: 'bg-muted',
  },
};
