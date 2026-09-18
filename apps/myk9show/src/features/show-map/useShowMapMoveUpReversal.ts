import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { getMoveUpErrorMessage } from '@/services/replication/moveUpEntryRpc';
import {
  resolveMoveUpReversal,
  reverseShowMapMoveUp,
  type MoveUpReversalState,
} from './moveUpSupersession';

interface UseShowMapMoveUpReversalInput {
  /** The entry the Move-up dialog is open on, or null when it is closed. */
  entryId: string | null;
  /** Invalidate the classes a reversal moves an entry between. */
  onReversed: (classIds: Array<string | undefined>) => void;
  /** Close the dialog once the entry is back where it started. */
  onClose: () => void;
}

/**
 * The way back from a move-up (MYK9-640), resolved for whichever entry the
 * Move-up dialog is open on.
 *
 * It lives beside the dialog rather than inside `useShowMapActionExecutor`
 * because the reverse is one question about ONE entry, asked only while that
 * dialog is open -- and because the executor is already at the file-size
 * ceiling.
 *
 * The answer is deliberately not cached across opens (`staleTime: 0`,
 * `gcTime: 0`): "can this still be moved back?" is answered partly by whether
 * the destination has been scored, which a judge can change between two opens
 * of the same dialog.
 */
export function useShowMapMoveUpReversal({
  entryId,
  onReversed,
  onClose,
}: UseShowMapMoveUpReversalInput) {
  const reversalQuery = useQuery<MoveUpReversalState>({
    queryKey: ['show-map', 'move-up-reversal', entryId],
    queryFn: () => resolveMoveUpReversal(entryId as string),
    enabled: Boolean(entryId),
    staleTime: 0,
    gcTime: 0,
  });

  const reverseMutation = useMutation({
    mutationFn: (targetEntryId: string) => reverseShowMapMoveUp(targetEntryId),
    onSuccess: result => {
      toast.success(
        result.sourceClassName
          ? `Entry moved back to ${result.sourceClassName}`
          : 'Entry moved back'
      );
      onClose();
      onReversed([result.sourceClassId ?? undefined]);
    },
    onError: error => {
      // The RPC's own sentence — "This run has already started…", "The original
      // entry is no longer there to restore." — not a generic apology.
      toast.error(getMoveUpErrorMessage(error, 'That move-up could not be reversed.'));
    },
  });

  return {
    /** `undefined` while the answer is still being read. */
    moveUpReversal: reversalQuery.data,
    isResolvingMoveUpReversal: Boolean(entryId) && reversalQuery.isPending,
    isReversingMoveUp: reverseMutation.isPending,
    reverseMoveUp: () => {
      if (entryId) reverseMutation.mutate(entryId);
    },
  };
}
