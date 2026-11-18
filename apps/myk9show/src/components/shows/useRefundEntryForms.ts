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

/** Where the ids no form is known for stand: being read, waiting for a connection, failed, or done. */
export type RefundFormLookup = 'loading' | 'offline' | 'failed' | 'ready';

export interface RefundEntryForms {
  forms: ReadonlyMap<string, RefundEntryForm>;
  lookup: RefundFormLookup;
  /** Re-reads only the ids the roster lacks; never re-runs a refund. */
  retry: () => void;
}

/**
 * The entry form of every entry id on a Refund all result (MYK9-1862). The show's staff roster
 * (replica first) places most of them at once; the ids it lacks are read online by id, once,
 * under the show's entries key so every show-entries refresh covers it too.
 */
export function useRefundEntryForms(
  showId: string,
  entryIds: readonly string[],
  enabled: boolean
): RefundEntryForms {
  const roster = useSecretaryShowEntriesQuery(showId, enabled);
  const rosterSettled = roster.data !== undefined || roster.isError;
  const rosterForms = formsFromRoster(roster.data);
  const unmatched = [...new Set(entryIds)].filter(id => !rosterForms.has(id)).sort();

  const readEnabled = enabled && rosterSettled && unmatched.length > 0;
  const read = useQuery({
    queryKey: [...queryKeys.showEntries(showId), 'refund-forms', unmatched],
    queryFn: () => getRefundEntryForms(unmatched),
    enabled: readEnabled,
    retry: false,
  });

  const forms = mergeRefundForms(rosterForms, formsFromRead(read.data));
  let lookup: RefundFormLookup = 'ready';
  if (!rosterSettled) lookup = 'loading';
  else if (readEnabled && read.data === undefined) {
    if (read.isError) lookup = 'failed';
    else if (read.fetchStatus === 'paused') lookup = 'offline';
    else lookup = 'loading';
  } else if (readEnabled && read.isError) lookup = 'failed';

  return {
    forms,
    lookup,
    retry: () => {
      void read.refetch();
    },
  };
}
