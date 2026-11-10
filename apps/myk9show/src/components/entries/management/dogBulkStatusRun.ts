import { toast } from 'sonner';
import { dispatchBulk, errorReason } from '@/hooks/bulkDispatch';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { describeEntryRun, type DogBulkVerb } from './dogBulkStatusEligibility';
import { ENTRY_ACTION_COPY } from '@/hooks/entryManagementErrorCopy';

export type DogStatusChange = (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string
) => void | boolean | Promise<boolean | void>;

const PAST_TENSE: Record<DogBulkVerb, string> = { pull: 'Pulled', withdraw: 'Withdrawn' };

/**
 * Applies the per-entry status path to every entry of one dog and reports the outcome.
 * Pull writes `scratched`; Withdraw writes `CANCELLED` with the reason. No new mutation and no
 * refund: the secretary approves each refund per entry afterwards. A failed entry is put back on
 * screen (the per-entry handler rolls itself back) and named in the toast, which says to check it:
 * the write may have landed before a later step failed (MYK9-1844).
 */
export async function runDogBulkStatus(args: {
  verb: DogBulkVerb;
  dogName: string;
  entries: readonly EntryManagementEntry[];
  onStatusChange: DogStatusChange;
  withdrawalReason?: string;
}): Promise<{ succeeded: number; failed: number }> {
  const { verb, dogName, entries, onStatusChange, withdrawalReason } = args;
  const outcome = await dispatchBulk(entries, async entry => {
    const result =
      verb === 'pull'
        ? await onStatusChange(entry.id, EntryStatus.SCRATCHED)
        : await onStatusChange(entry.id, EntryStatus.CANCELLED, withdrawalReason);
    if (result === false) throw new Error(ENTRY_ACTION_COPY.dogBulkEntryFailed);
  });
  const total = entries.length;
  const done = outcome.succeeded.length;
  if (outcome.failed.length === 0) {
    toast.success(`${PAST_TENSE[verb]} ${dogName}: ${done} of ${total} entries`);
  } else {
    toast.error(`${PAST_TENSE[verb]} ${done} of ${total} entries for ${dogName}`, {
      description: [
        ENTRY_ACTION_COPY.dogBulkFailedHeading,
        ...outcome.failed.map(
          ({ item, error }) => `${describeEntryRun(item)}: ${errorReason(error)}`
        ),
      ].join('\n'),
    });
  }
  return { succeeded: done, failed: outcome.failed.length };
}
