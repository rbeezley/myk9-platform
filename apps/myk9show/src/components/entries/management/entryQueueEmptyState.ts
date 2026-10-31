import type { EntryManagementCockpitState } from './entryManagementCockpitParams';
import { SHOW_REGISTRATION_QUEUE_LABELS } from './entryManagementViews';

export interface EntryQueueEmptyCopy {
  heading: string;
  body: string;
}

/**
 * What the queue says when it has no rows. A show with no forms at all is its own message. A
 * search ignores the queue and scope (`buildShowRegistrationPage`), so when one is present it is
 * the only thing that can have emptied the list. Otherwise the checked queue is what is empty,
 * and the body names how many forms sit in All within the current trial/class scope, so the
 * secretary never concludes the entries are missing (MYK9-1276).
 */
export function describeEmptyEntryQueue(
  state: Pick<EntryManagementCockpitState, 'queues' | 'search'>,
  wholeShowFormCount: number,
  scopedAllCount: number
): EntryQueueEmptyCopy {
  if (wholeShowFormCount === 0) {
    return {
      heading: 'No entries yet',
      body: 'Entries will appear here as exhibitors enter, or you can add one.',
    };
  }
  if (state.search.trim().length > 0) {
    return { heading: 'No matches', body: 'No entry forms match this search.' };
  }
  if (scopedAllCount === 0) {
    return { heading: 'No matches', body: 'No entry forms match this filter.' };
  }

  const [only] = state.queues;
  const heading =
    state.queues.length === 1 && only === 'needs-review'
      ? 'Nothing needs review'
      : state.queues.length === 1 && only
        ? `Nothing in ${SHOW_REGISTRATION_QUEUE_LABELS[only]}`
        : 'Nothing in these queues';
  const one = scopedAllCount === 1;
  const noun = one ? 'entry form is' : 'entry forms are';
  return {
    heading,
    body: `${scopedAllCount.toLocaleString()} ${noun} in All. Clear the Status filter to see ${one ? 'it' : 'them'}.`,
  };
}
