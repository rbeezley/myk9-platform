/**
 * The names and header-menu rows for the Entries tab's lists (MYK9-795, MYK9-1594).
 *
 * The three registration queues are the Filter menu's Status field (`entryManagementFilterFields`).
 * The four exception lists (Pulls, Move-ups, Registration number needed, Waitlist) are different
 * lists with different rows, so they are rows of the header Actions menu ("Entry lists") and each
 * opens as its own titled view. A count means "waiting for you" (MYK9-1949), the same number as
 * the Show Desk pill: Registration number needed is the held entries; Waitlist is the offers that
 * ran out, plus one for each class with a spot to offer when the show does not offer spots
 * automatically. Each is read from its one calculation in `@/features/waiting-for-you`.
 */
import type { ShowToolItem } from '@/features/actions/showToolActions';
import {
  writeCockpitException,
  type EntryManagementException,
} from './entryManagementCockpitParams';
import type { ShowRegistrationQueue } from './showRegistrationProjection';

/** The one spelling of each queue's name: the Status field and the empty-queue message share it. */
export const SHOW_REGISTRATION_QUEUE_LABELS: Record<ShowRegistrationQueue, string> = {
  'needs-review': 'Needs review',
  'missing-information': 'Missing info',
  'payment-due': 'Payment due',
  all: 'All',
};

/** The one spelling of each list's name: the Actions menu row and the view's title share it. */
export const ENTRY_LIST_LABELS: Record<EntryManagementException, string> = {
  pulls: 'Pulls',
  'move-ups': 'Move-ups',
  'registration-needed': 'Registration number needed',
  waitlist: 'Waitlist',
  'check-in': 'Check-in desk',
};

/** Menu order. */
const ENTRY_LIST_ORDER: readonly EntryManagementException[] = [
  'pulls',
  'move-ups',
  'registration-needed',
  'waitlist',
  'check-in',
];

export interface EntryListCounts {
  pulls: number;
  /** Omitted (no badge) when unknown: still loading, or the read failed. */
  moveUps: number | undefined;
  /**
   * Omitted (no badge) while the trials or dogs it derives from are still loading, rather than a
   * confident 0 (MYK9-1162).
   */
  registrationNeeded: number | undefined;
  /** Omitted (no badge) while the waitlist read is unknown. */
  waitlist: number | undefined;
}

/** A list is reached by the URL the page reads (`tab=exceptions&exception=...`). */
export function getEntryListHref(showId: string, exception: EntryManagementException): string {
  const query = writeCockpitException(new URLSearchParams(), exception).toString();
  return `/shows/${encodeURIComponent(showId)}/entries?${query}`;
}

function countBadge(count: number | undefined): { attentionLabel?: string } {
  return count !== undefined && count > 0 ? { attentionLabel: count.toLocaleString() } : {};
}

/** The "Entry lists" rows of the header Actions menu, each badged when its count is not zero. */
export function buildEntryListTools(showId: string, counts: EntryListCounts): ShowToolItem[] {
  const countOf: Record<EntryManagementException, number | undefined> = {
    pulls: counts.pulls,
    'move-ups': counts.moveUps,
    'registration-needed': counts.registrationNeeded,
    waitlist: counts.waitlist,
    'check-in': undefined,
  };
  return ENTRY_LIST_ORDER.map(exception => ({
    id: `entry-list-${exception}`,
    group: 'entry-lists' as const,
    title: ENTRY_LIST_LABELS[exception],
    href: getEntryListHref(showId, exception),
    ...countBadge(countOf[exception]),
  }));
}

/** How many entry-list items are waiting, for the Actions button's badge. */
export function sumEntryListCounts(counts: EntryListCounts): number {
  return (
    counts.pulls + (counts.moveUps ?? 0) + (counts.registrationNeeded ?? 0) + (counts.waitlist ?? 0)
  );
}
