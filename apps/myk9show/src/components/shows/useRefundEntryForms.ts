import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { getRefundEntryForms } from '@/services/database/entries/refundEntryForms';
import {
  formsFromRead,
  formsFromRoster,
  mergeRefundForms,
  type RefundEntryForm,
} from './refundResultForms';

/** Where the form read stands: running, waiting for a connection, failed, or done. */
export type RefundFormLookup = 'loading' | 'offline' | 'failed' | 'ready';

export interface RefundEntryForms {
  forms: ReadonlyMap<string, RefundEntryForm>;
  lookup: RefundFormLookup;
  /** True until the roster has loaded or failed: an entry it may still place is not "unnamed" yet. */
  rosterPending: boolean;
  /** Re-runs only the form read; never re-runs a refund. */
  retry: () => void;
}

/**
 * The entry form of every entry id on a Refund all result (MYK9-1862). The show's staff roster
 * (replica first) places the entries it has at once, by form and confirmation number. One online
 * read of every result id, under the show's entries key, gives each entry's form record and that
 * form's own payer, and places the entries the roster lacks (soft-deleted) or holds incompletely.
 */
export function useRefundEntryForms(
  showId: string,
  entryIds: readonly string[],
  enabled: boolean
): RefundEntryForms {
  const roster = useSecretaryShowEntriesQuery(showId, enabled);
  const ids = [...new Set(entryIds)].sort();

  const read = useQuery({
    queryKey: [...queryKeys.showEntries(showId), 'refund-forms', ids],
    queryFn: () => getRefundEntryForms(ids),
    enabled: enabled && ids.length > 0,
    retry: false,
  });

  const forms = mergeRefundForms(formsFromRoster(roster.data), formsFromRead(read.data));
  // The roster can still place an id the read did not return, so "ready" waits for it too.
  const rosterSettled = roster.data !== undefined || roster.isError;
  const lookup: RefundFormLookup = read.isError
    ? 'failed'
    : read.data !== undefined
      ? rosterSettled
        ? 'ready'
        : 'loading'
      : read.fetchStatus === 'paused'
        ? 'offline'
        : 'loading';

  return {
    forms,
    lookup,
    rosterPending: !rosterSettled,
    retry: () => {
      void read.refetch();
    },
  };
}
