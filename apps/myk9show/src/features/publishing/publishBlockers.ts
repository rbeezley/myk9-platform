import {
  ENTRY_WINDOW_ORDER_MESSAGE,
  entryWindowPublishError,
} from '@/features/payments/onlineEntryGate';

/**
 * MYK9-2198: what blocks a draft show from publishing. The server owns the list
 * (public.show_publish_blockers, MYK9-2197); this file only types it, parses it and words it.
 * The one exception is the wizard's Review step, which has no saved show yet and builds the same
 * lines from the draft with `computeWizardPublishBlockers`.
 */

export const PUBLISH_BLOCKER_KEYS = [
  'club_not_approved',
  'payouts_not_enabled',
  'online_entries_off',
  'premium_not_published',
  'entry_dates_missing',
  'entry_dates_out_of_order',
] as const;

export type PublishBlockerKey = (typeof PUBLISH_BLOCKER_KEYS)[number];

export interface PublishBlocker {
  /** A key this client knows, or the raw key from a newer server (worded generically). */
  key: string;
  /** Who has to act: 'myk9', 'club_admin', 'stripe' or 'secretary'; null when the server names no one. */
  waitingOn: string | null;
  /** A rough wait ("about a day"), or null when there is no estimate. */
  eta: string | null;
}

/** Reads the RPC's jsonb array. Anything that is not an array of keyed objects is an error. */
export function parsePublishBlockers(data: unknown): PublishBlocker[] {
  if (!Array.isArray(data)) throw new Error('Unexpected publish blockers response.');
  return data.map(raw => {
    const row = (raw ?? {}) as Record<string, unknown>;
    if (typeof row.key !== 'string') throw new Error('Unexpected publish blockers response.');
    return {
      key: row.key,
      waitingOn: typeof row.waiting_on === 'string' ? row.waiting_on : null,
      eta: typeof row.eta === 'string' ? row.eta : null,
    };
  });
}

/** One plain sentence per key. Unknown keys read generically rather than disappearing. */
export function publishBlockerSentence(blocker: PublishBlocker): string {
  switch (blocker.key) {
    case 'club_not_approved':
      return 'Your club is waiting for myK9Show approval.';
    case 'payouts_not_enabled':
      return blocker.waitingOn === 'stripe'
        ? 'Stripe is reviewing your club’s bank account.'
        : 'Your club has not finished setting up payouts.';
    case 'online_entries_off':
      return 'Turn online entries on.';
    case 'premium_not_published':
      return 'Publish the premium list, or turn on “We publish our own premium list”.';
    case 'entry_dates_missing':
      return 'Set when entries open and close.';
    case 'entry_dates_out_of_order':
      return 'Entries have to open before they close.';
    default:
      return 'Something else still needs attention before this show can publish.';
  }
}

/**
 * Who the line waits on and roughly how long, or null when it is the viewer's own job (the
 * secretary's lines, or the club admin's own payouts step).
 */
export function publishBlockerWaitingText(
  blocker: PublishBlocker,
  viewerIsClubAdmin: boolean,
  clubAdmins?: { names: string; count: number } | undefined
): string | null {
  const wait = blocker.eta ? `, usually ${blocker.eta}` : '';
  switch (blocker.waitingOn) {
    case 'myk9':
      return `Waiting on myK9Show${wait}`;
    case 'stripe':
      return `Waiting on Stripe${wait}`;
    case 'club_admin':
      if (viewerIsClubAdmin) return null;
      // MYK9-2208: name the admins when the read succeeded; otherwise today's wording.
      return clubAdmins
        ? `Waiting on ${clubAdmins.names}, the club admin${clubAdmins.count === 1 ? '' : 's'}${wait}`
        : `Waiting on your club admin${wait}`;
    default:
      return null;
  }
}

export interface WizardPublishBlockersInput {
  /** The club's lines from public.club_publish_blockers, or null while unknown. */
  clubBlockers: PublishBlocker[] | null;
  /** The wizard always creates a show with online entries on, so this defaults to true. */
  onlineEntriesEnabled?: boolean;
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
}

/**
 * The wizard's draft has no saved show for the server to read, so Review builds the same list
 * from the club's lines and the form. Mirrors private.show_publish_blockers_for: the club lines
 * first, then online entries, premium (a new show never has one; the wizard has no "we publish our own"
 * switch), then the entry dates, in the server's refusal order.
 */
export function computeWizardPublishBlockers({
  clubBlockers,
  onlineEntriesEnabled = true,
  entryOpenDate,
  entryCloseDate,
}: WizardPublishBlockersInput): PublishBlocker[] {
  const lines: PublishBlocker[] = [...(clubBlockers ?? [])];
  if (!onlineEntriesEnabled) {
    lines.push({ key: 'online_entries_off', waitingOn: 'secretary', eta: null });
  }
  lines.push({ key: 'premium_not_published', waitingOn: 'secretary', eta: null });
  const windowProblem = entryWindowPublishError(entryOpenDate, entryCloseDate);
  if (windowProblem) {
    lines.push({
      key:
        windowProblem === ENTRY_WINDOW_ORDER_MESSAGE
          ? 'entry_dates_out_of_order'
          : 'entry_dates_missing',
      waitingOn: 'secretary',
      eta: null,
    });
  }
  return lines;
}
