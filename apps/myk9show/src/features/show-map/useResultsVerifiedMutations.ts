import { useContext } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { getUserFriendlyError, mappedErrorMessage } from '@/utils/errorMessages';
import {
  clearResultsVerified,
  isStaleResultsError,
  recordResultsVerified,
} from './resultsVerifiedMutations';

/**
 * MYK9-1031: "scores match the paper" as React Query mutations. Online only (the default
 * networkMode pauses them offline; the Results tab also disables the buttons): the check is saved
 * by calling the server, never queued, and the local class learns the answer by an ordinary scoped
 * class sync afterwards (nothing is written from the response). `verifyAsync` rejects so the
 * caller can reset its ticks when the server says the scores moved (MK015).
 */
export function useResultsVerifiedMutations() {
  const sync = useContext(ReplicationSyncContext);
  const refreshClass = (trialId: string) => {
    void sync?.triggerSync([{ name: 'classes', scopeId: trialId }]);
  };

  // No automatic retry on either: a repeat of a refused check (MK015) must reach the caller, and
  // the app client's default mutation retry would otherwise run it again.
  const verify = useMutation({
    retry: false,
    mutationFn: (claim: {
      classId: string;
      trialId: string;
      showId: string;
      canonical: string;
      at: string;
    }) =>
      recordResultsVerified({ classId: claim.classId, canonical: claim.canonical, at: claim.at }),
    onSuccess: (_data, claim) => {
      toast.success('Scores marked as matching the paper');
      refreshClass(claim.trialId);
    },
    onError: (error, claim) => {
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The check could not be saved. Try again.')
      );
      // The server says the scores moved: this device's copy of them is stale (the app-wide sync
      // has no entries scope of its own), so pull the show's entries again, or the next tick would
      // resend the same stale fingerprint forever.
      if (isStaleResultsError(error)) {
        void sync?.triggerSync([{ name: 'entries', scopeId: claim.showId }]);
      }
    },
  });

  const undo = useMutation({
    retry: false,
    mutationFn: ({ classId }: { classId: string; trialId: string }) =>
      clearResultsVerified(classId),
    onSuccess: (_data, { trialId }) => {
      toast.success('Check removed');
      refreshClass(trialId);
    },
    onError: error => {
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The check could not be removed. Try again.')
      );
    },
  });

  return {
    /** Saves the check for exactly the results text the caller ticked (see recordResultsVerified). */
    verifyAsync: ({
      classId,
      trialId,
      showId,
      canonical,
    }: {
      classId: string;
      trialId: string;
      showId: string;
      canonical: string;
    }) => verify.mutateAsync({ classId, trialId, showId, canonical, at: new Date().toISOString() }),
    undo: undo.mutate,
    isPending: verify.isPending || undo.isPending,
    /** Pulls the class row again (the Release check found the server disagrees with the replica). */
    refreshClass,
  };
}
