import { useContext, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { getUserFriendlyError, mappedErrorMessage } from '@/utils/errorMessages';
import {
  clearResultsVerified,
  isStaleResultsError,
  recordResultsVerified,
} from './resultsVerifiedMutations';

/** Saving the check needs the server; offline it is refused, never held back for later. */
export const OFFLINE_CHECK_MESSAGE = 'Connect to save the check';

class OfflineCheckError extends Error {
  constructor() {
    super(OFFLINE_CHECK_MESSAGE);
    this.name = 'OfflineCheckError';
  }
}

const messageFor = (error: unknown, fallback: string) =>
  error instanceof OfflineCheckError
    ? error.message
    : (mappedErrorMessage(error) ?? getUserFriendlyError(error, fallback));

/**
 * MYK9-1031: "scores match the paper" as React Query mutations. Online only (the default
 * networkMode pauses them offline; the Results tab also disables the buttons): the check is saved
 * by calling the server, never queued, and the local class learns the answer by an ordinary scoped
 * class sync afterwards (nothing is written from the response). `verifyAsync` rejects so the
 * caller can reset its ticks when the server says the scores moved (MK015).
 */
export function useResultsVerifiedMutations() {
  const sync = useContext(ReplicationSyncContext);
  // Read at execution time, not at render time: the connection can drop between click and run.
  const online = useIsOnline();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const requireOnline = () => {
    if (!onlineRef.current) throw new OfflineCheckError();
  };
  const refreshClass = (trialId: string) => {
    void sync?.triggerSync([{ name: 'classes', scopeId: trialId }]);
  };

  // No automatic retry on either: a repeat of a refused check (MK015) must reach the caller, and
  // the app client's default mutation retry would otherwise run it again.
  // networkMode 'always': the default 'online' mode would PAUSE an offline mutation and replay it on
  // reconnect, which is exactly the queued write this feature must never be. Offline is refused at
  // execution start instead.
  const verify = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (claim: {
      classId: string;
      trialId: string;
      showId: string;
      canonical: string;
      at: string;
    }) => {
      requireOnline();
      return recordResultsVerified({
        classId: claim.classId,
        canonical: claim.canonical,
        at: claim.at,
      });
    },
    onSuccess: (_data, claim) => {
      toast.success('Scores marked as matching the paper');
      refreshClass(claim.trialId);
    },
    onError: (error, claim) => {
      toast.error(messageFor(error, 'The check could not be saved. Try again.'));
      // The server says the scores moved: this device's copy of them is stale (the app-wide sync
      // has no entries scope of its own), so pull the show's entries again, or the next tick would
      // resend the same stale fingerprint forever.
      if (isStaleResultsError(error)) {
        void sync?.triggerSync([{ name: 'entries', scopeId: claim.showId }]);
      }
    },
  });

  const undo = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ classId }: { classId: string; trialId: string }) => {
      requireOnline();
      return clearResultsVerified(classId);
    },
    onSuccess: (_data, { trialId }) => {
      toast.success('Check removed');
      refreshClass(trialId);
    },
    onError: error => {
      toast.error(messageFor(error, 'The check could not be removed. Try again.'));
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
