import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { recordCoinFlips } from '@/features/show-map/classTiesMutations';
import { useOptionalReplicationSyncActions } from '@/hooks/useOptionalReplicationSyncActions';
import { getUserFriendlyError, mappedErrorMessage } from '@/utils/errorMessages';

/**
 * MYK9-1473: save the coin flip for a class's tied dogs. Online only and never queued
 * (`networkMode: 'always'`, no retry): the server judges the flip against the scores as they are
 * now, so a replayed one could order dogs that are no longer tied. The server re-ranks the class,
 * so this device pulls the show's entries and the class again afterwards, whether or not every
 * group saved; the tie groups are derived from those replicated entries.
 */
export function useRecordCoinFlip(showId: string) {
  const sync = useOptionalReplicationSyncActions();
  const mutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (input: {
      classId: string;
      trialId: string;
      orders: readonly (readonly string[])[];
    }) => recordCoinFlips({ classId: input.classId, orders: input.orders }),
    onSuccess: () => toast.success('Coin flip saved'),
    onError: error =>
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The coin flip could not be saved. Try again.')
      ),
    onSettled: (_data, _error, input) => {
      void sync?.triggerSync([
        { name: 'entries', scopeId: showId },
        { name: 'classes', scopeId: input.trialId },
      ]);
    },
  });
  return { save: mutation.mutateAsync, isPending: mutation.isPending };
}
