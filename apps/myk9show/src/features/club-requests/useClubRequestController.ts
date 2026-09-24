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
  TOO_MANY_PENDING_ERROR,
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
  // When the last successful submit landed. Until a status read completes
  // after it, the server's answer can predate the ask, so the page holds the
  // ask as pending; after that, the server's answer always wins.
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [deniedThisSession, setDeniedThisSession] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: options.queryKey,
    queryFn: options.fetchStatus,
    enabled: options.preState === null,
    // The other side decides while the requester is away; re-read on return
    // instead of trusting the app-wide five-minute staleTime.
    refetchOnMount: 'always',
    // A page left open while the club decides re-reads when the tab returns.
    refetchOnWindowFocus: 'always',
  });

  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: options.queryKey });

  const submitMutation = useMutation({
    mutationFn: options.submitRequest,
    onMutate: () => setSubmitError(null),
    onSuccess: () => {
      setJustSubmitted(true);
      setSubmittedAt(Date.now());
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
      if (failure === 'too-many-pending') {
        setSubmitError(TOO_MANY_PENDING_ERROR);
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
  } else if (statusQuery.isError) {
    // Checked before cached data: a failed re-read must not fall back to an
    // older answer that could re-offer a submit (fail closed).
    state = { kind: 'error' };
  } else if (statusQuery.data) {
    state = statusQuery.data;
  } else {
    state = { kind: 'loading' };
  }

  // Between a successful submit and the status refetch, the server already
  // holds the ask: show it as pending rather than re-offering the form.
  const postSubmitReadDone =
    submittedAt !== null && statusQuery.dataUpdatedAt >= submittedAt && !statusQuery.isFetching;
  if (submittedAt !== null && !postSubmitReadDone && state.kind === 'available') {
    state = { kind: 'pending' };
  }

  // A cached 'available' is the one answer that offers a submit; while it is
  // being re-read (return, focus) it may already be stale, so show loading.
  // Cached pending/denied/has-access answers offer no action and stay.
  if (state.kind === 'available' && statusQuery.isFetching) state = { kind: 'loading' };

  return {
    state,
    submit: note => submitMutation.mutate(note),
    isSubmitting: submitMutation.isPending,
    justSubmitted,
    submitError,
    retry: () => void statusQuery.refetch(),
  };
}
