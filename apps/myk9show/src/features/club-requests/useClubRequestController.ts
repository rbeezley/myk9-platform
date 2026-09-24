/**
 * The shared engine behind both club-routed asks (MYK9-685): read my latest
 * request and submit a new one. The two
 * public hooks differ only in which RPCs they call and what "already has it"
 * means, so each passes those in.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import {
  classifySubmitError,
  GENERIC_SUBMIT_ERROR,
  type ClubRequestController,
  type ClubRequestState,
  type ServerRequestState,
} from './clubRequestState';

interface Options {
  queryKey: readonly unknown[];
  /** A state that short-circuits the query (signed out, already has access). */
  preState: ClubRequestState | null;
  /** The server's answer, already mapped to exactly one state. */
  fetchStatus: () => Promise<ServerRequestState>;
  submitRequest: (note: string) => Promise<string>;
  successMessage: string;
  logContext: Record<string, unknown>;
}

export function useClubRequestController(options: Options): ClubRequestController {
  const queryClient = useQueryClient();
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [deniedThisSession, setDeniedThisSession] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: options.queryKey,
    queryFn: options.fetchStatus,
    enabled: options.preState === null,
    // The other side decides while the requester is away; re-read on return
    // instead of trusting the app-wide five-minute staleTime.
    refetchOnMount: 'always',
  });

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: options.queryKey });

  const submitMutation = useMutation({
    mutationFn: options.submitRequest,
    onMutate: () => setSubmitError(null),
    onSuccess: () => {
      setJustSubmitted(true);
      void refreshStatus();
      notifications.success(options.successMessage);
    },
    onError: error => {
      const failure = classifySubmitError(error);
      if (failure === 'already-pending' || failure === 'already-member') {
        // The server caught a race (two tabs, a double click). Not a failure
        // from the requester's point of view: show the real status instead.
        void refreshStatus();
        if (failure === 'already-pending') {
          notifications.info('You already have a request under review for this club.');
        }
        return;
      }
      if (failure === 'standing-denial') {
        setDeniedThisSession(true);
        notifications.error((error as Error).message);
        return;
      }
      setSubmitError(GENERIC_SUBMIT_ERROR);
      logger.error('Failed to submit club request', 'clubs', {
        ...options.logContext,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  let state: ClubRequestState;
  if (options.preState) {
    state = options.preState;
  } else if (deniedThisSession) {
    // The submit itself was refused as a standing denial (MK571).
    state = { kind: 'denied', reviewerNote: null };
  } else if (statusQuery.data) {
    state = statusQuery.data;
  } else if (statusQuery.isError) {
    state = { kind: 'error' };
  } else {
    state = { kind: 'loading' };
  }

  // Between a successful submit and the status refetch, the server already
  // holds the ask: show it as pending rather than re-offering the form.
  if (justSubmitted && state.kind === 'available') state = { kind: 'pending' };

  return {
    state,
    submit: note => submitMutation.mutate(note),
    isSubmitting: submitMutation.isPending,
    justSubmitted,
    submitError,
    retry: () => void statusQuery.refetch(),
  };
}
